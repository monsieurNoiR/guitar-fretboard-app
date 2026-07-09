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
// chord: ルートからの半音数配列（コードトーン、0〜11のピッチクラス）
// tensions: { 表示名: ルートからの半音数 }（12以上がテンション扱い。生の半音数でmod12化していない）
// ※ コードトーン編（chordGame.js）がオクターブを無視して判定するのは妥協ではなく意図的な設計判断
//   （鳴っているコードの中でどの音を弾くかという演奏上の問いには、基準音との距離を厳密に問う
//   インターバル編とは異なる判定基準が正しい）。v1.13からchordGame.jsが
//   pickChordToneSet()経由でtensionsから毎回1個ランダムに選び、オクターブ無視・
//   ピッチクラスベースで出題に使用する
//   （isTensionHit()のようなオクターブ厳密判定は流用しない。アルペジオモードは今回未対応）
// symbol: noteName(rootPc) の直後に連結するコード記号（例: 'C' + '7' = 'C7'）。
// 既存のtensionsキー（'b9'等）とASCII表記で統一するため♭記号は使わない
export const CHORD_TYPES = {
  maj:  {
    name: 'Major',
    symbol: '',
    chord: [0, 4, 7],
    // 11th(P4)は3rd(長3度)の半音上でぶつかる明白なアボイドノートのため除外（v1.13.1）
    tensions: { '9th': 14, '13th': 21 },
  },
  min:  {
    name: 'Minor',
    symbol: 'm',
    chord: [0, 3, 7],
    // 11th(P4)はm3(短3度)の全音上でありぶつからないため見直し不要。b13(pc8)は5th(pc7)の半音上で
    // 機械的にはmajの11thと類似だが、b9/#9と違いb13は変化音ではなくAeolian由来のダイアトニック音。
    // 理論書ではアボイド寄りに扱われることもあるが、マイナー♭6という独自の色として実務で使われる
    // 価値を優先しグレーゾーンとして現状維持（v1.13.1）
    tensions: { '9th': 14, '11th': 17, 'b13': 20 },
  },
  maj7: {
    name: 'Major 7th',
    symbol: 'maj7',
    chord: [0, 4, 7, 11],
    tensions: { '9th': 14, '#11th': 18, '13th': 21 },
  },
  min7: {
    name: 'Minor 7th',
    symbol: 'm7',
    chord: [0, 3, 7, 10],
    tensions: { '9th': 14, '11th': 17, '13th': 21 },
  },
  dom7: {
    name: 'Dominant 7th',
    symbol: '7',
    chord: [0, 4, 7, 10],
    // ナチュラル11th(P4)は3rd(長3度)の半音上でぶつかる明白なアボイドノートのため除外
    // （majの11thと同じ構造。b9/#9/#11th/13thはalt系または接触なしのため対象外、v1.13.1）
    tensions: { 'b9': 13, '9th': 14, '#9': 15, '#11th': 18, '13th': 21 },
  },
  dim7: {
    name: 'Diminished 7',
    symbol: 'dim7',
    chord: [0, 3, 6, 9],
    // dim7は対称コード。慣習的にb9が使われる。M9は理論上可能だが実用では稀
    tensions: { 'b9': 13 },
  },
  m7b5: {
    name: 'Half Dim',
    symbol: 'm7b5',
    chord: [0, 3, 6, 10],
    // ロクリアン(b9)またはロクリアン#2(9th)どちらも実用的
    tensions: { 'b9': 13, '9th': 14, '11th': 17 },
  },
  aug:  {
    name: 'Augmented',
    symbol: 'aug',
    chord: [0, 4, 8],
    // V+ として使用時にb9・9th・#9が頻出（オルタードドミナント系）
    tensions: { 'b9': 13, '9th': 14, '#9': 15 },
  },
  sus2: {
    name: 'Sus2',
    symbol: 'sus2',
    chord: [0, 2, 7],
    // 2nd（コードトーン）とは別に、9th（12半音以上）は位置で区別できるテンションとして追加。
    // 発見モードのpickChordToneSet()は、9thが2ndとピッチクラス衝突するためsus2をテンション抽選
    // 対象から明示的に除外する（常にテンションなしで出題）
    tensions: { '9th': 14 },
  },
  sus4: {
    name: 'Sus4',
    symbol: 'sus4',
    chord: [0, 5, 7],
    tensions: { '9th': 14 },
  },
};

// コードトーン編（発見モード・アルペジオモード共通）v1.15.0: 出題コード範囲設定で使用する
// コードタイプIDの共有定数。chordGame.js・arpeggioGame.jsにハードコード重複していた
// CHORD_TYPE_IDSをここに一元化した
export const TRIAD_TYPE_IDS = ['maj', 'min'];
export const ALL_TYPE_IDS   = Object.keys(CHORD_TYPES);

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
// judgeStrings を3弦に拡張: 1弦のみだと5th(G)が C/6弦起点の表示窓(7〜12F)に入らず詰む
export const PRACTICE_LEVEL = {
  id: 'practice',
  label: '練習',
  intervals: [0, 4, 7],
  rootPcs: [0],
  judgeStrings: [0, 1, 2],
};

// ── 判定ロジック ───────────────────────────────────────────

// コードトーン編で使用。オクターブを無視した純粋なピッチクラス一致は妥協ではなく意図的な設計
// （鳴っているコードの中でどの音を弾くかという演奏上の問いには、基準音との距離を厳密に問う
// インターバル編のisIntervalHit/isTensionHitとは別の判定基準が正しい）
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

// ルート音のポジション候補を rootStrings × rootOctaves の組み合わせで列挙する。
// Game._pickRootPosition（js/game.js）と同じ考え方だが、候補抽選・候補ゼロ時の
// フォールバックは呼び出し側の責務とする（本関数は候補配列を返すだけ）
export function rootPositionCandidates(rootPc, rootStrings, rootOctaves) {
  const candidates = [];
  for (const s of rootStrings) {
    let baseFret = -1;
    for (let f = 0; f <= 11; f++) {
      if (getPitchClass(s, f) === rootPc) { baseFret = f; break; }
    }
    if (baseFret < 0) continue;
    for (const oct of rootOctaves) {
      const fret = baseFret + oct * 12;
      if (fret <= MAX_FRET) candidates.push({ stringIdx: s, fret });
    }
  }
  return candidates;
}

// ランダムなインターバルを選ぶ
export function pickInterval(intervals) {
  return intervals[Math.floor(Math.random() * intervals.length)];
}

// コードトーン編で使用予定
export function allPositionsForPc(pc) {
  const positions = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= MAX_FRET; f++) {
      if (getPitchClass(s, f) === pc) positions.push({ stringIdx: s, fret: f });
    }
  }
  return positions;
}

// コードトーン編: ルート×コードタイプの組み合わせ単位で、指定の表示窓・判定弦内に
// 全構成音が見つかるか（＝出題として「詰み」にならないか）を判定する。
// ルートが可変化しても、同じ関数に新しい組み合わせを渡すだけで再利用できる形にしている。
// Game._hasValidAnswerと同型: startは指板左端の「フレット線」位置でありタップ不可のため
// 実際のタップ判定範囲は start+1〜end+1。start===0のときのみ開放弦(0F)を別途許可する。
export function hasSolvableChordTones(rootPc, rootFret, judgeStrings, semitones) {
  const { start, end } = calcDisplayRange(rootFret);
  return semitones.every(semitone => {
    const targetPc = (rootPc + semitone) % 12;
    return judgeStrings.some(s => {
      if (start === 0 && getPitchClass(s, 0) === targetPc) return true;
      for (let f = start + 1; f <= end + 1; f++) {
        if (getPitchClass(s, f) === targetPc) return true;
      }
      return false;
    });
  });
}

// コードトーン編〔発見モード〕v1.13: type.chord（基本構成音）に、type.tensionsから毎回1個だけ
// ランダムに選んだテンションを加えた構成音セットを返す（v1.12のStage 6では定義済み全テンションを
// まとめて出題していたが、表示コード名〔例:「C7」〕が指す音数と実際の出題音数〔最大10音〕が
// 一致しないコンセプト矛盾があったため、ジャズの「アベイラブルテンション」の考え方に基づき
// 1個ランダム選択に変更した）。sus2は唯一の定義済みテンション9thが基本構成音2ndとピッチクラス
// 衝突するため、テンション抽選自体を行わず常にテンションなしで返す。semitoneは生の値のまま保持
// （_playChord()でルートMIDIに加算し、テンションを基準音より高いオクターブで鳴らすため）。
// tensionEnabled（v1.15.0）: falseの場合はテンション抽選自体を行わず基本構成音のみ返す
// （出題コード範囲設定の「テンションOFF」用。デフォルトtrueで既存呼び出し元との後方互換を保つ）
export function pickChordToneSet(typeId, type, tensionEnabled = true) {
  const seenPcs = new Set();
  const tones = [];
  const push = (semitone, name) => {
    const pc = ((semitone % 12) + 12) % 12;
    if (seenPcs.has(pc)) return false;
    seenPcs.add(pc);
    tones.push({ semitone, name });
    return true;
  };
  type.chord.forEach(semitone => push(semitone, INTERVAL_NAMES[semitone] ?? String(semitone)));

  let tensionName = null;
  const tensionEntries = Object.entries(type.tensions);
  if (tensionEnabled && typeId !== 'sus2' && tensionEntries.length > 0) {
    const [name, semitone] = tensionEntries[Math.floor(Math.random() * tensionEntries.length)];
    if (push(semitone, name)) tensionName = name;
  }
  return { tones, tensionName };
}

// コードトーン編で使用予定
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
