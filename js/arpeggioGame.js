import {
  getPitchClass, getMidi,
  calcDisplayRange,
  hasSolvableChordTones,
  rootPositionCandidates,
  CHORD_TYPES,
  noteName,
  STRING_COUNT,
  MAX_FRET,
} from './music.js';

// Stage 3: トライアド（メジャー/マイナー）のみ。7th系は対象外
const CHORD_TYPE_IDS = ['maj', 'min'];
// ルート音を12音フルランダム化（インターバル編LV.4方式: 6/5/4弦 × 0/1オクターブ）
const ROOT_PCS      = [0,1,2,3,4,5,6,7,8,9,10,11];
const ROOT_STRINGS  = [0, 1, 2];  // 6/5/4弦
const ROOT_OCTAVES  = [0, 1];
const JUDGE_STRINGS = [0, 1, 2]; // 判定対象弦は低音3弦のまま固定（ルート位置とは独立）

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
  constructor({ audio, fretboard, hintEnabled = true, onProgress }) {
    this._audio       = audio;
    this._fb          = fretboard;
    this._hintEnabled = hintEnabled;
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
    if (!JUDGE_STRINGS.includes(stringIdx)) return;

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
      typeId = CHORD_TYPE_IDS[Math.floor(Math.random() * CHORD_TYPE_IDS.length)];
      type   = CHORD_TYPES[typeId];
      const pos = this._pickRootPosition(rootPc);
      rootString = pos.stringIdx;
      rootFret   = pos.fret;
      rootMidi   = getMidi(rootString, rootFret);
      attempts++;
    } while (!hasSolvableChordTones(rootPc, rootFret, JUDGE_STRINGS, type.chord) && attempts < MAX_QUESTION_RETRY);

    this._rootMidi = rootMidi;

    const tones = type.chord.map(semitone => ({
      semitone,
      pc: (rootPc + semitone) % 12,
    }));
    this._sequence   = this._shuffle(tones);
    this._phaseIndex = 0;
    this._answered   = false;
    this._chordName  = `${noteName(rootPc)} ${type.name}`;

    const range = calcDisplayRange(rootFret);
    this._currentRange = range;
    const maskStrings = new Set(
      Array.from({ length: STRING_COUNT }, (_, s) => s).filter(s => !JUDGE_STRINGS.includes(s))
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
    for (const s of JUDGE_STRINGS) {
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

  // ルート音のポジションを候補（6/5/4弦 × 0/1オクターブ）からランダムに選ぶ
  // （Game._pickRootPositionと同じ考え方。候補列挙はmusic.jsのrootPositionCandidatesを使用）
  _pickRootPosition(rootPc) {
    const candidates = rootPositionCandidates(rootPc, ROOT_STRINGS, ROOT_OCTAVES);
    if (candidates.length === 0) {
      // フォールバック: 6弦上でrootPcに最初に一致するフレット
      // （ROOT_STRINGS×ROOT_OCTAVESで12音すべて到達可能なため通常は発火しない想定）
      for (let f = 0; f <= 12; f++) {
        if (getPitchClass(0, f) === rootPc) return { stringIdx: 0, fret: f };
      }
      return { stringIdx: 0, fret: 0 };
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
