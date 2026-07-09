import {
  getPitchClass, getMidi,
  isChordToneHit,
  calcDisplayRange,
  hasSolvableChordTones,
  rootPositionCandidates,
  pickChordToneSet,
  CHORD_TYPES,
  TRIAD_TYPE_IDS,
  ALL_TYPE_IDS,
  noteName,
  STRING_COUNT,
} from './music.js';

// Stage 4: ルート音を12音フルランダム化（インターバル編LV.4方式: 6/5/4弦 × 0/1オクターブ）。
// Stage 5: 7th系8種類を復帰し、全10種類（CHORD_TYPESの全キー）でルート可変化に対応。
// Stage 6→v1.13: テンション対応。type.chord（基本構成音）に加え、music.jsのpickChordToneSet()で
// type.tensionsから毎回1個だけランダムに選んだテンションを加えた構成音セットを出題する
// （v1.12時点は定義済み全テンションをまとめて出題していたが、コード名と出題音数が一致しない
// コンセプト矛盾のため1個ランダム選択に変更。sus2はテンション抽選対象外）。
// 全12rootPc × 全ルート候補位置（6/5/4弦×0/1oct）× 全10種類のテンション全パターンの直積で
// hasSolvableChordTones() が常にtrueになる（詰みゼロ）ことをNode上で全数検証済み。
// 判定弦カスタマイズ機能（v1.11.0）: 判定弦域はユーザー設定（`stringRange`、コンストラクタ引数）
// に統合。ルート出現弦も同じ値を共有する（以前は別々の定数がたまたま一致していただけだった）。
// v1.15.0: 出題コード範囲設定に対応。CHORD_TYPE_IDSのハードコード定数は廃止し、コンストラクタ
// 引数`chordTypeRangeAll`でmusic.jsのTRIAD_TYPE_IDS/ALL_TYPE_IDSどちらを使うか切り替える。
const ROOT_PCS      = [0,1,2,3,4,5,6,7,8,9,10,11];
const ROOT_OCTAVES  = [0, 1];
const DEFAULT_STRING_RANGE = [0, 1, 2]; // 6/5/4弦（stringRange未指定時のフォールバック）

// 出題可解性チェックのリトライ上限（Game._nextQuestionと同じパターン。
// ルートPC・ルートポジション・コードタイプをまとめて再抽選する）
const MAX_QUESTION_RETRY = 30;

// クリア後、次のコードへ進むまでの待ち時間
const NEXT_CHORD_DELAY = 800;

export class ChordGame {
  constructor({ audio, fretboard, stringRange = DEFAULT_STRING_RANGE, chordTypeRangeAll = true, tensionEnabled = true, onProgress }) {
    this._audio          = audio;
    this._fb             = fretboard;
    this._stringRange    = stringRange;
    this._typeIds        = chordTypeRangeAll ? ALL_TYPE_IDS : TRIAD_TYPE_IDS;
    this._tensionEnabled = tensionEnabled;
    this._onProgress     = onProgress;

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
    if (!this._stringRange.includes(stringIdx)) return;
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

    // Game._nextQuestionと同型: ルートPC・ルートポジション・コードタイプ・テンション抽選を
    // まとめて再抽選し、表示窓・判定弦内に構成音セット（基本構成音＋テンション最大1個）が
    // 収まる（＝詰みにならない）組み合わせを探す
    let rootPc, rootString, rootFret, rootMidi, typeId, type, tones, tensionName;
    let attempts = 0;
    do {
      rootPc = ROOT_PCS[Math.floor(Math.random() * ROOT_PCS.length)];
      typeId = this._typeIds[Math.floor(Math.random() * this._typeIds.length)];
      type   = CHORD_TYPES[typeId];
      ({ tones, tensionName } = pickChordToneSet(typeId, type, this._tensionEnabled));
      const pos = this._pickRootPosition(rootPc);
      rootString = pos.stringIdx;
      rootFret   = pos.fret;
      rootMidi   = getMidi(rootString, rootFret);
      attempts++;
    } while (!hasSolvableChordTones(rootPc, rootFret, this._stringRange, tones.map(t => t.semitone)) && attempts < MAX_QUESTION_RETRY);

    this._rootMidi = rootMidi;

    this._chordTones = tones.map(({ semitone, name }) => ({
      semitone,
      pc: (rootPc + semitone) % 12,
      name,
    }));
    this._remaining = new Set(this._chordTones.map(t => t.pc));
    // テンション名（例:「9th」）は末尾の「th」を除いた表記で括弧内に表示する（「9th」→「9」、
    // 「b9」「#9」「b13」は元々「th」を含まないためそのまま）
    const tensionLabel = tensionName
      ? (tensionName.endsWith('th') ? tensionName.slice(0, -2) : tensionName)
      : null;
    this._chordName = `${noteName(rootPc)}${type.symbol}` + (tensionLabel ? `(${tensionLabel})` : '');

    const range = calcDisplayRange(rootFret);
    const maskStrings = new Set(
      Array.from({ length: STRING_COUNT }, (_, s) => s).filter(s => !this._stringRange.includes(s))
    );
    this._fb.draw({ displayRange: range, maskStrings });

    this._emitProgress();
    this._playChord();
  }

  _playChord() {
    const midis = this._chordTones.map(t => this._rootMidi + t.semitone);
    this._audio.playChord(midis, 1.2);
  }

  // ルート音のポジションを候補（判定弦域 × 0/1オクターブ）からランダムに選ぶ
  // （Game._pickRootPosition・ArpeggioGame._pickRootPositionと同じ考え方。
  // 候補列挙はmusic.jsのrootPositionCandidatesを使用）
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

  // 進捗テキスト例: 「R ✓　3rd ✓　5th（未）」
  _emitProgress() {
    const progressText = this._chordTones
      .map(t => this._remaining.has(t.pc) ? `${t.name}（未）` : `${t.name} ✓`)
      .join('　');
    this._onProgress?.({ chordName: this._chordName, progressText });
  }
}
