// ── 弦データ ──────────────────────────────────────────────
// インデックス 0=6弦(E2), 1=5弦(A2), 2=4弦(D3), 3=3弦(G3), 4=2弦(B3), 5=1弦(E4)
export const OPEN_STRINGS = [4, 9, 2, 7, 11, 4];
export const STRING_MIDI  = [40, 45, 50, 55, 59, 64];
export const STRING_COUNT = 6;
export const MAX_FRET     = 17;

// ── ピッチクラス計算 ───────────────────────────────────────
export function getPitchClass(stringIdx, fret) {
  return (OPEN_STRINGS[stringIdx] + fret) % 12;
}

export function getMidi(stringIdx, fret) {
  return STRING_MIDI[stringIdx] + fret;
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── 音名 ──────────────────────────────────────────────────
export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export function noteName(pc) {
  return NOTE_NAMES[pc];
}

// ── コード定義 ─────────────────────────────────────────────
// chord: ルートからの半音数配列（コードトーン）
// tensions: { 表示名: ルートからの半音数 }（12以上がテンション扱い）
export const CHORD_TYPES = {
  maj:  {
    name: 'Major',
    chord: [0, 4, 7],
    tensions: { '9th': 14, '11th': 17, '13th': 21 },
  },
  min:  {
    name: 'Minor',
    chord: [0, 3, 7],
    tensions: { '9th': 14, '11th': 17, 'b13': 20 },
  },
  maj7: {
    name: 'Major 7th',
    chord: [0, 4, 7, 11],
    tensions: { '9th': 14, '#11th': 18, '13th': 21 },
  },
  min7: {
    name: 'Minor 7th',
    chord: [0, 3, 7, 10],
    tensions: { '9th': 14, '11th': 17, '13th': 21 },
  },
  dom7: {
    name: 'Dominant 7th',
    chord: [0, 4, 7, 10],
    tensions: { 'b9': 13, '9th': 14, '#9': 15, '11th': 17, '#11th': 18, '13th': 21 },
  },
  dim7: {
    name: 'Diminished 7',
    chord: [0, 3, 6, 9],
    // dim7は対称コード。慣習的にb9が使われる。M9は理論上可能だが実用では稀
    tensions: { 'b9': 13 },
  },
  m7b5: {
    name: 'Half Dim',
    chord: [0, 3, 6, 10],
    // ロクリアン(b9)またはロクリアン#2(9th)どちらも実用的
    tensions: { 'b9': 13, '9th': 14, '11th': 17 },
  },
  aug:  {
    name: 'Augmented',
    chord: [0, 4, 8],
    // V+ として使用時にb9・9th・#9が頻出（オルタードドミナント系）
    tensions: { 'b9': 13, '9th': 14, '#9': 15 },
  },
  sus2: {
    name: 'Sus2',
    chord: [0, 2, 7],
    // 2nd（コードトーン）とは別に、9th（12半音以上）は位置で区別できるテンションとして追加
    tensions: { '9th': 14 },
  },
  sus4: {
    name: 'Sus4',
    chord: [0, 5, 7],
    tensions: { '9th': 14 },
  },
};

// ── 度数名（コードトーン: 0〜11半音）─────────────────────────
export const INTERVAL_NAMES = {
  0:  'R',
  1:  'b2',
  2:  '2nd',
  3:  'm3',
  4:  '3rd',
  5:  '4th',
  6:  'b5',
  7:  '5th',
  8:  '#5',
  9:  '6th',
  10: 'm7',
  11: '7th',
};

// テンション名（12半音以上）はCHORD_TYPESのキーをそのまま使用

// ── 全インターバル一覧（インターバル編用）──────────────────────
// 半音数 → { name, isTension }
export const ALL_INTERVALS = [
  { semitones: 0,  name: 'R',     isTension: false },
  { semitones: 1,  name: 'b2',    isTension: false },
  { semitones: 2,  name: '2nd',   isTension: false },
  { semitones: 3,  name: 'm3',    isTension: false },
  { semitones: 4,  name: '3rd',   isTension: false },
  { semitones: 5,  name: '4th',   isTension: false },
  { semitones: 6,  name: 'b5',    isTension: false },
  { semitones: 7,  name: '5th',   isTension: false },
  { semitones: 8,  name: '#5',    isTension: false },
  { semitones: 9,  name: '6th',   isTension: false },
  { semitones: 10, name: 'm7',    isTension: false },
  { semitones: 11, name: '7th',   isTension: false },
];

// ── LV設定（インターバル編）──────────────────────────────────
// judgeStrings: 判定対象弦のインデックス配列（0=6弦, 5=1弦）
// rootPcs: 基準音ピッチクラスの候補リスト
// intervals: 出題するインターバルの半音数リスト
export const INTERVAL_LEVELS = [
  {
    id: 'lv1',
    label: 'LV.1',
    intervals: [0, 4, 7],               // R・3rd・5th
    rootPcs: [0],                        // C固定
    judgeStrings: [0, 1, 2],            // 低音3弦（6〜4弦）
  },
  {
    id: 'lv2',
    label: 'LV.2',
    intervals: [0, 2, 4, 5, 7],         // +2nd・4th
    rootPcs: [0],                        // C固定
    judgeStrings: [0, 1, 2, 3],         // 低音4弦（6〜3弦）
  },
  {
    id: 'lv3',
    label: 'LV.3',
    intervals: [0, 2, 3, 4, 5, 7, 10], // +m3rd・m7th
    // E,A,D,G,C,B（ギター開放弦と頻出キー）
    rootPcs: [4, 9, 2, 7, 0, 11],
    judgeStrings: [0, 1, 2, 3, 4],     // 低音5弦（6〜2弦）
  },
  {
    id: 'lv4',
    label: 'LV.4',
    intervals: [0, 2, 3, 4, 5, 7, 9, 8, 10], // +6th・#5
    rootPcs: [0,1,2,3,4,5,6,7,8,9,10,11],     // 12音フルランダム
    judgeStrings: [0, 1, 2, 3, 4, 5],  // 全弦
    // 高レベル拡張: 根弦を 6・5・4 弦からランダム、オクターブも 0 or 1
    rootStrings: [0, 1, 2],
    rootOctaves: [0, 1],
  },
  {
    id: 'lvmax',
    label: 'LV.Max',
    intervals: [0,1,2,3,4,5,6,7,8,9,10,11],   // 全12音
    rootPcs: [0,1,2,3,4,5,6,7,8,9,10,11],
    judgeStrings: [0, 1, 2, 3, 4, 5],  // 全弦
    // 高レベル拡張: 根弦を 6・5・4 弦からランダム、オクターブも 0 or 1
    rootStrings: [0, 1, 2],
    rootOctaves: [0, 1],
  },
];

// 練習モード（タイムなし、何度でも聞き直し）
export const PRACTICE_LEVEL = {
  id: 'practice',
  label: '練習',
  intervals: [0, 4, 7],
  rootPcs: [0],
  judgeStrings: [0],
};

// ── 判定ロジック ───────────────────────────────────────────

// コードトーン: ピッチクラス一致ならオクターブ問わず正解
export function isChordToneHit(rootPc, tapPc) {
  return tapPc === rootPc;
}

// テンション: ルートから12半音以上離れた位置のみ正解
export function isTensionHit(rootMidi, tapMidi, semitones) {
  const diff = tapMidi - rootMidi;
  return (diff % 12 === semitones % 12) && diff >= 12;
}

// インターバル編: タップが指定インターバルの正解かどうか
// isTension: 半音数 >= 12 の場合はテンション判定
export function isIntervalHit(rootPc, rootMidi, tapPc, tapMidi, semitones) {
  if (semitones >= 12) {
    return isTensionHit(rootMidi, tapMidi, semitones);
  }
  return tapPc === ((rootPc + semitones) % 12);
}

// ── 指板表示範囲の動的計算 ────────────────────────────────────
// 基準音フレットが端に来ないよう、左から2フレット余白を確保
export function calcDisplayRange(rootFret) {
  let start = Math.max(0, rootFret - 2);
  let end   = start + 5; // 6フレット幅（start〜end+1 の6ゾーンを描画）
  // 表示ゾーンは end+1 まで描画されるため、end+1 <= MAX_FRET になるよう上限を MAX_FRET-1 に設定
  if (end >= MAX_FRET) {
    end   = MAX_FRET - 1;
    start = Math.max(0, end - 5);
  }
  return { start, end };
}

// ランダムなルート音を選ぶ（rootPcs候補リストから）
export function pickRootPc(rootPcs) {
  return rootPcs[Math.floor(Math.random() * rootPcs.length)];
}

// ランダムなインターバルを選ぶ
export function pickInterval(intervals) {
  return intervals[Math.floor(Math.random() * intervals.length)];
}

// 指定ピッチクラスが指板上に現れる全ポジション
export function allPositionsForPc(pc) {
  const positions = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= MAX_FRET; f++) {
      if (getPitchClass(s, f) === pc) positions.push({ stringIdx: s, fret: f });
    }
  }
  return positions;
}

// 指定ピッチクラスが指板上に現れる全ポジション（テンション判定用: midiベース）
export function allPositionsForTension(rootMidi, semitones) {
  const positions = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= MAX_FRET; f++) {
      const midi = getMidi(s, f);
      if (isTensionHit(rootMidi, midi, semitones)) {
        positions.push({ stringIdx: s, fret: f });
      }
    }
  }
  return positions;
}
