import {
  getPitchClass, getMidi,
  isChordToneHit,
  calcDisplayRange,
  hasSolvableChordTones,
  rootPositionCandidates,
  INTERVAL_NAMES,
  CHORD_TYPES,
  noteName,
  STRING_COUNT,
} from './music.js';

// Stage 4: ルート音を12音フルランダム化（インターバル編LV.4方式: 6/5/4弦 × 0/1オクターブ）。
// Stage 5: 7th系8種類を復帰し、全10種類（CHORD_TYPESの全キー）でルート可変化に対応。
// 全12rootPc × 全ルート候補位置（6/5/4弦×0/1oct）× 全10種類の直積で hasSolvableChordTones() が
// 常にtrueになる（詰みゼロ）ことをNode上で全数検証済み。
const CHORD_TYPE_IDS = ['maj', 'min', 'maj7', 'min7', 'dom7', 'dim7', 'm7b5', 'aug', 'sus2', 'sus4'];
const ROOT_PCS      = [0,1,2,3,4,5,6,7,8,9,10,11];
const ROOT_STRINGS  = [0, 1, 2];  // 6/5/4弦
const ROOT_OCTAVES  = [0, 1];
const JUDGE_STRINGS = [0, 1, 2]; // 判定対象弦は低音3弦のまま固定（ルート位置とは独立）

// 出題可解性チェックのリトライ上限（Game._nextQuestionと同じパターン。
// ルートPC・ルートポジション・コードタイプをまとめて再抽選する）
const MAX_QUESTION_RETRY = 30;

// クリア後、次のコードへ進むまでの待ち時間
const NEXT_CHORD_DELAY = 800;

export class ChordGame {
  constructor({ audio, fretboard, onProgress }) {
    this._audio      = audio;
    this._fb         = fretboard;
    this._onProgress = onProgress;

    this._fb.onTap(({ stringIdx, fret }) => this.handleTap({ stringIdx, fret }));

    this._rootMidi   = null;      // _nextChord()内で毎回計算される
    this._nextTimer  = null;
    this._chordName  = '';
    this._chordTones = [];      // [{ semitone, pc, name }]
    this._remaining  = new Set(); // 未発見の pc 集合
  }

  // ── 公開API ──────────────────────────────────────────────

  start() {
    this._nextChord();
  }

  // 「もう一度聞く」: 進捗はそのまま、現在のコードを再生し直すだけ
  replay() {
    if (this._chordTones.length > 0) this._playChord();
  }

  stop() {
    clearTimeout(this._nextTimer);
    this._audio.stopChord();
  }

  handleTap({ stringIdx, fret }) {
    if (!JUDGE_STRINGS.includes(stringIdx)) return;
    if (this._chordTones.length === 0) return;

    const pc   = getPitchClass(stringIdx, fret);
    const midi = getMidi(stringIdx, fret);

    // タップ位置の音を常に再生（正誤問わず）
    this._audio.playNote(midi, 0.7);

    const isChordTone   = this._chordTones.some(t => isChordToneHit(t.pc, pc));
    const isNewlyFound  = isChordTone && this._remaining.has(pc);
    // 構成音だが既にクリア済み（別ポジションで再タップ）の場合は正解でも不正解でもない中立表示
    const feedbackState = !isChordTone ? false : (isNewlyFound ? true : 'neutral');
    this._fb.showFeedback(stringIdx, fret, feedbackState);

    if (isNewlyFound) {
      this._remaining.delete(pc);
      this._emitProgress();
      if (this._remaining.size === 0) {
        this._nextTimer = setTimeout(() => this._nextChord(), NEXT_CHORD_DELAY);
      }
    }
  }

  // ── 内部メソッド ──────────────────────────────────────────

  _nextChord() {
    clearTimeout(this._nextTimer);
    this._fb.clearFeedback();
    // インターバル編からの遷移でオレンジのルート確定マーカーが残留しないようにクリア
    this._fb.clearConfirmedRoot();

    // Game._nextQuestionと同型: ルートPC・ルートポジション・コードタイプをまとめて再抽選し、
    // 表示窓・判定弦内に全構成音が収まる（＝詰みにならない）組み合わせを探す
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

    this._chordTones = type.chord.map(semitone => ({
      semitone,
      pc:   (rootPc + semitone) % 12,
      name: INTERVAL_NAMES[semitone] ?? String(semitone),
    }));
    this._remaining = new Set(this._chordTones.map(t => t.pc));
    this._chordName = `${noteName(rootPc)} ${type.name}`;

    const range = calcDisplayRange(rootFret);
    const maskStrings = new Set(
      Array.from({ length: STRING_COUNT }, (_, s) => s).filter(s => !JUDGE_STRINGS.includes(s))
    );
    this._fb.draw({ displayRange: range, maskStrings });

    this._emitProgress();
    this._playChord();
  }

  _playChord() {
    const midis = this._chordTones.map(t => this._rootMidi + t.semitone);
    this._audio.playChord(midis, 1.2);
  }

  // ルート音のポジションを候補（6/5/4弦 × 0/1オクターブ）からランダムに選ぶ
  // （Game._pickRootPosition・ArpeggioGame._pickRootPositionと同じ考え方。
  // 候補列挙はmusic.jsのrootPositionCandidatesを使用）
  _pickRootPosition(rootPc) {
    const candidates = rootPositionCandidates(rootPc, ROOT_STRINGS, ROOT_OCTAVES);
    if (candidates.length === 0) {
      // フォールバック: 6弦上でrootPcに最初に一致するフレット
      // （ROOT_STRINGS×ROOT_OCTAVESで12音すべて到達可能なため通常は発火しない想定）
      for (let f = 0; f <= 11; f++) {
        if (getPitchClass(0, f) === rootPc) return { stringIdx: 0, fret: f };
      }
      return { stringIdx: 0, fret: 0 };
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // 進捗テキスト例: 「R ✓　3rd ✓　5th（未）」
  _emitProgress() {
    const progressText = this._chordTones
      .map(t => this._remaining.has(t.pc) ? `${t.name}（未）` : `${t.name} ✓`)
      .join('　');
    this._onProgress?.({ chordName: this._chordName, progressText });
  }
}
