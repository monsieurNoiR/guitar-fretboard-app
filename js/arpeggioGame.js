import {
  getPitchClass, getMidi,
  calcDisplayRange,
  hasSolvableChordTones,
  rootPositionCandidates,
  CHORD_TYPES,
  TRIAD_TYPE_IDS,
  ALL_TYPE_IDS,
  noteName,
  STRING_COUNT,
  MAX_FRET,
} from './music.js';

// v1.14.0: 発見モード（chordGame.js）Stage 5と同様、全10種類のコードタイプに対応
// （maj, min, maj7, min7, dom7, dim7, m7b5, aug, sus2, sus4）。テンションは対象外
// v1.15.0: 出題コード範囲設定に対応。CHORD_TYPE_IDSのハードコード定数は廃止し、コンストラクタ
// 引数`chordTypeRangeAll`でmusic.jsのTRIAD_TYPE_IDS/ALL_TYPE_IDSどちらを使うか切り替える。
// アルペジオモードはテンション非対応のため変更なし
// ルート音を12音フルランダム化（インターバル編LV.4方式: 6/5/4弦 × 0/1オクターブ）
const ROOT_PCS      = [0,1,2,3,4,5,6,7,8,9,10,11];
const ROOT_OCTAVES  = [0, 1];
// 判定弦カスタマイズ機能（v1.11.0）: 判定弦域はユーザー設定（`stringRange`、コンストラクタ引数）
// に統合。ルート出現弦も同じ値を共有する（以前は別々の定数がたまたま一致していただけだった）。
const DEFAULT_STRING_RANGE = [0, 1, 2]; // 6/5/4弦（stringRange未指定時のフォールバック）

// 出題可解性チェックのリトライ上限（Game._nextQuestionと同じパターン。
// ルートPC・ルートポジション・コードタイプをまとめて再抽選する）
const MAX_QUESTION_RETRY = 30;

// クリア後、次のコードへ進むまでの待ち時間（発見モードと同じ）
const NEXT_CHORD_DELAY = 800;

// ストローク→アルペジオの再生タイミング（実機確認をふまえて調整予定の暫定値）
const STROKE_DURATION        = 1.0;  // 秒
const ARPEGGIO_START_DELAY   = 900;  // ms（ストローク開始からアルペジオ1音目まで）
const ARPEGGIO_NOTE_INTERVAL = 450;  // ms（アルペジオの音と音の間隔）
const ARPEGGIO_NOTE_DURATION = 0.6;  // 秒
const PLAYBACK_UNLOCK_BUFFER = 150;  // ms（最後の音の減衰を待つ余裕）

// 詰まった時のヒント表示までの待ち時間（インターバル編と同じレンジ）
const HINT_DELAY_MIN = 5000;
const HINT_DELAY_MAX = 7000;

export class ArpeggioGame {
  constructor({ audio, fretboard, hintEnabled = true, stringRange = DEFAULT_STRING_RANGE, chordTypeRangeAll = true, onProgress }) {
    this._audio       = audio;
    this._fb          = fretboard;
    this._hintEnabled = hintEnabled;
    this._stringRange = stringRange;
    this._typeIds     = chordTypeRangeAll ? ALL_TYPE_IDS : TRIAD_TYPE_IDS;
    this._onProgress  = onProgress;

    this._fb.onTap(({ stringIdx, fret }) => this.handleTap({ stringIdx, fret }));

    this._rootMidi        = null; // _nextChord()内で毎回計算される
    this._currentRange    = null;
    this._chordName      = '';
    this._sequence        = [];   // [{ semitone, pc }] 出題順（シャッフル済み）
    this._phaseIndex      = 0;    // 今何番目の音を待っているか
    this._answered         = false;
    this._playbackLocked   = true; // 再生中はタップを無視する

    this._playTimers  = [];  // アルペジオ各音のsetTimeout ID
    this._unlockTimer = null;
    this._hintTimer    = null;
    this._nextTimer    = null;
  }

  // ── 公開API ──────────────────────────────────────────────

  start() {
    this._nextChord();
  }

  // 「もう一度聞く」: 進捗（phaseIndex）はそのまま、ストローク＋アルペジオを最初から再生し直す
  replay() {
    if (this._sequence.length > 0) this._playSequence();
  }

  stop() {
    this._clearAllTimers();
    this._audio.stopChord();
    this._fb.clearHints();
  }

  handleTap({ stringIdx, fret }) {
    if (this._sequence.length === 0 || this._answered || this._playbackLocked) return;
    if (!this._stringRange.includes(stringIdx)) return;

    const pc   = getPitchClass(stringIdx, fret);
    const midi = getMidi(stringIdx, fret);

    // タップ位置の音を常に再生（正誤問わず）
    this._audio.playNote(midi, 0.7);

    const expected = this._sequence[this._phaseIndex];
    const hit = (pc === expected.pc);
    // 構成音だが順番違いの場合も含め、通常の不正解（赤）として扱う（'neutral'は使わない）
    this._fb.showFeedback(stringIdx, fret, hit);

    if (hit) {
      clearTimeout(this._hintTimer);
      this._fb.clearHints();
      this._phaseIndex++;
      this._emitProgress();
      if (this._phaseIndex >= this._sequence.length) {
        this._answered = true;
        this._nextTimer = setTimeout(() => this._nextChord(), NEXT_CHORD_DELAY);
      } else {
        this._scheduleHint();
      }
    }
    // 不正解時は同じフェーズのまま待機（「粘れる」方式、状態変更なし）
  }

  // ── 内部メソッド ──────────────────────────────────────────

  _nextChord() {
    this._clearAllTimers();
    this._fb.clearFeedback();
    // インターバル編からの遷移でオレンジのルート確定マーカーが残留しないようにクリア
    this._fb.clearConfirmedRoot();
    this._fb.clearHints();

    let rootPc, rootString, rootFret, rootMidi, typeId, type;
    let attempts = 0;
    do {
      rootPc = ROOT_PCS[Math.floor(Math.random() * ROOT_PCS.length)];
      typeId = this._typeIds[Math.floor(Math.random() * this._typeIds.length)];
      type   = CHORD_TYPES[typeId];
      const pos = this._pickRootPosition(rootPc);
      rootString = pos.stringIdx;
      rootFret   = pos.fret;
      rootMidi   = getMidi(rootString, rootFret);
      attempts++;
    } while (!hasSolvableChordTones(rootPc, rootFret, this._stringRange, type.chord) && attempts < MAX_QUESTION_RETRY);

    this._rootMidi = rootMidi;

    const tones = type.chord.map(semitone => ({
      semitone,
      pc: (rootPc + semitone) % 12,
    }));
    this._sequence   = this._shuffle(tones);
    this._phaseIndex = 0;
    this._answered   = false;
    // 発見モード（v1.13.0〜）と同じ記号表記に統一（例:「C7」「C#dim7」）。
    // アルペジオモードはテンション非対応のため括弧表記は付けない
    this._chordName  = `${noteName(rootPc)}${type.symbol}`;

    const range = calcDisplayRange(rootFret);
    this._currentRange = range;
    const maskStrings = new Set(
      Array.from({ length: STRING_COUNT }, (_, s) => s).filter(s => !this._stringRange.includes(s))
    );
    this._fb.draw({ displayRange: range, maskStrings });

    this._emitProgress();
    this._playSequence();
  }

  _playSequence() {
    this._clearPlaybackTimers();
    clearTimeout(this._hintTimer);
    this._fb.clearHints();
    this._playbackLocked = true;

    // ストローク再生
    const strokeMidis = this._sequence.map(t => this._rootMidi + t.semitone);
    this._audio.playChord(strokeMidis, STROKE_DURATION);

    // 続けてアルペジオ再生（ランダムな出題順）。playArpeggio()は呼び出し元から
    // キャンセルできないため使わず、setTimeoutを自前管理してstop()/replay()で
    // 確実にclearTimeoutできるようにする
    this._sequence.forEach((tone, i) => {
      const timer = setTimeout(() => {
        this._audio.playNote(this._rootMidi + tone.semitone, ARPEGGIO_NOTE_DURATION);
      }, ARPEGGIO_START_DELAY + i * ARPEGGIO_NOTE_INTERVAL);
      this._playTimers.push(timer);
    });

    const totalDuration = ARPEGGIO_START_DELAY
      + (this._sequence.length - 1) * ARPEGGIO_NOTE_INTERVAL
      + ARPEGGIO_NOTE_DURATION * 1000
      + PLAYBACK_UNLOCK_BUFFER;

    this._unlockTimer = setTimeout(() => {
      this._playbackLocked = false;
      this._scheduleHint();
    }, totalDuration);
  }

  // 進捗テキスト例:「1音目 ✓　2音目 ✓　3音目（待機中）」度数名は出さない
  _emitProgress() {
    const progressText = this._sequence
      .map((_, i) => {
        const n = i + 1;
        if (i < this._phaseIndex) return `${n}音目 ✓`;
        if (i === this._phaseIndex) return `${n}音目（待機中）`;
        return `${n}音目（未）`;
      })
      .join('　');
    this._onProgress?.({ chordName: this._chordName, progressText });
  }

  // 詰まった時のヒント表示をスケジュール（Game._scheduleHintと同型）。
  // スケジュール時点のphaseIndexを覚えておき、発火時に現在のphaseIndexと
  // 不一致なら無視する（フェーズが進んだ後の古いヒントの誤発火防止）
  _scheduleHint() {
    clearTimeout(this._hintTimer);
    if (!this._hintEnabled) return;
    const phaseAtSchedule = this._phaseIndex;
    const delay = HINT_DELAY_MIN + Math.random() * (HINT_DELAY_MAX - HINT_DELAY_MIN);
    this._hintTimer = setTimeout(() => {
      if (this._answered || this._phaseIndex !== phaseAtSchedule || this._playbackLocked) return;
      this._showHint();
    }, delay);
  }

  _showHint() {
    const expected = this._sequence[this._phaseIndex];
    if (!expected) return;
    this._fb.showHints(this._hintPositionsForPc(expected.pc));
  }

  // 表示窓内・判定対象弦の中で pc に一致する全ポジションを返す（Game._hintPositionsForPcと同内容。
  // コードトーン編には開放弦除外設定が存在しないためその分岐は持たない）
  _hintPositionsForPc(pc) {
    const { start, end } = this._currentRange;
    const positions = [];
    for (const s of this._stringRange) {
      if (start === 0 && getPitchClass(s, 0) === pc) {
        positions.push({ stringIdx: s, fret: 0 });
      }
      for (let f = start + 1; f <= end + 1; f++) {
        if (f > MAX_FRET) break;
        if (getPitchClass(s, f) === pc) positions.push({ stringIdx: s, fret: f });
      }
    }
    return positions;
  }

  // ルート音のポジションを候補（判定弦域 × 0/1オクターブ）からランダムに選ぶ
  // （Game._pickRootPositionと同じ考え方。候補列挙はmusic.jsのrootPositionCandidatesを使用）
  _pickRootPosition(rootPc) {
    const candidates = rootPositionCandidates(rootPc, this._stringRange, ROOT_OCTAVES);
    if (candidates.length === 0) {
      // フォールバック: 判定弦域の最初の弦上でrootPcに最初に一致するフレット
      // （this._stringRange×ROOT_OCTAVESで12音すべて到達可能なため通常は発火しない想定）
      const fallbackString = this._stringRange[0];
      for (let f = 0; f <= 11; f++) {
        if (getPitchClass(fallbackString, f) === rootPc) return { stringIdx: fallbackString, fret: f };
      }
      return { stringIdx: fallbackString, fret: 0 };
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _clearPlaybackTimers() {
    this._playTimers.forEach(t => clearTimeout(t));
    this._playTimers = [];
    clearTimeout(this._unlockTimer);
  }

  _clearAllTimers() {
    this._clearPlaybackTimers();
    clearTimeout(this._hintTimer);
    clearTimeout(this._nextTimer);
  }
}
