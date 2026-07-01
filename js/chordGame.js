import {
  getPitchClass, getMidi,
  isChordToneHit,
  calcDisplayRange,
  INTERVAL_NAMES,
  CHORD_TYPES,
  noteName,
  STRING_COUNT,
} from './music.js';

// Stage 0: ルート固定C・低音3弦・メジャー/マイナートライアドのみ
const CHORD_TYPE_IDS = ['maj', 'min'];
const ROOT_PC     = 0;          // C
const ROOT_STRING = 0;          // 6弦
const ROOT_FRET   = 8;          // 6弦8F = C
const JUDGE_STRINGS = [0, 1, 2]; // 低音3弦（6〜4弦）

// クリア後、次のコードへ進むまでの待ち時間
const NEXT_CHORD_DELAY = 800;

export class ChordGame {
  constructor({ audio, fretboard, onProgress }) {
    this._audio      = audio;
    this._fb         = fretboard;
    this._onProgress = onProgress;

    this._fb.onTap(({ stringIdx, fret }) => this.handleTap({ stringIdx, fret }));

    this._rootMidi   = getMidi(ROOT_STRING, ROOT_FRET);
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

    const typeId = CHORD_TYPE_IDS[Math.floor(Math.random() * CHORD_TYPE_IDS.length)];
    const type   = CHORD_TYPES[typeId];

    this._chordTones = type.chord.map(semitone => ({
      semitone,
      pc:   (ROOT_PC + semitone) % 12,
      name: INTERVAL_NAMES[semitone] ?? String(semitone),
    }));
    this._remaining = new Set(this._chordTones.map(t => t.pc));
    this._chordName = `${noteName(ROOT_PC)} ${type.name}`;

    const range = calcDisplayRange(ROOT_FRET);
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

  // 進捗テキスト例: 「R ✓　3rd ✓　5th（未）」
  _emitProgress() {
    const progressText = this._chordTones
      .map(t => this._remaining.has(t.pc) ? `${t.name}（未）` : `${t.name} ✓`)
      .join('　');
    this._onProgress?.({ chordName: this._chordName, progressText });
  }
}
