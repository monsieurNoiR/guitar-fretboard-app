# コードレビュー結果（2026-06-30）

対象: guitar-fretboard-app（インターバル編 v1.0）
レビュー観点: 座標変換 / フレット範囲・出題ロジック / リトライ / メモリリーク・リスナー / localStorage / 一貫性

---

## 検証で確定した重大バグ

### 【重大1】`_hasValidAnswer()` が「表示範囲外」を見ているため、練習モードで詰む問題が必ず発生する

- **無限ループにはならない**（`attempts < 30` で必ず抜ける）。問題は逆で、**リトライが機能せず「タップ不能な問題」がそのまま確定**してしまう点。
- `game.js:227` の `_hasValidAnswer()` は `f = 0 〜 MAX_FRET`（指板全域）を走査するが、実際にタップ可能なのは `_handleTap`（`fretboard.js:260`）の `start+1 〜 end+1` の**表示6フレット窓のみ**。両者の範囲が一致していない。

ブルートフォース検証結果:

```
[practice] STUCK問題 1件 (visibleに正解0):
  {"rootPc":0,"rootStr":0,"rootFret":8,"semis":7,"wholePass":true}
```

- 練習モードはルートが常に C（6弦8F固定）、判定弦は6弦のみ（`judgeStrings:[0]`）。
- インターバル「5th」（pc=G）は6弦上では 3F/15F にしかなく、表示窓 `7〜12F`（`calcDisplayRange(8)`）に1つも入らない。
- しかし `_hasValidAnswer` は全域で 15F を見つけて `true` を返すため、リトライもかからずそのまま出題 → **永久に正解できない**。
- 練習の出題は `{R, 3rd, 5th}` の3択なので、**約1/3の確率で詰む**。
- LV.1〜Max は判定弦が複数あるため今回の全組合せ検証ではセーフだったが、構造的欠陥（チェック範囲のズレ）は残存。レベル定義を変えると再発し得る。

**修正方針**
- `_hasValidAnswer()` のループを「実際に表示・タップ可能なセル」に揃える。`calcDisplayRange(rootFret)` を渡し、`excludeOpenStrings` も加味して窓内だけを走査する。
- 練習モードは判定弦が1本で詰みやすい。範囲を直しても練習5thは30回リトライ全滅 → 結局詰むため、`judgeStrings` を増やす等の**練習モード定義の見直しが必須**。

---

### 【重大2】localStorage に try/catch が一切なく、iPad Safari でクラッシュし得る

- `app.js:152, 156, 161` の `JSON.parse` / `setItem` が無防備。ターゲットが iPad Safari である以上、特に問題。
- **iOS Safari のプライベートブラウズでは `setItem` が必ず `QuotaExceededError` を投げる**。`saveScore()` が例外を出し、`showResult()` が途中で死んでランキングが描画されない（リザルト画面が壊れる）。
- 保存値が壊れていた場合 `JSON.parse` も throw する。
- パース結果が配列である保証もなく、`.push` / `.sort` 前提が崩れる。

**修正方針**
- `saveScore` / `renderRanking` を try/catch で包む。
- パース失敗時は `[]` フォールバック、`Array.isArray` チェックを追加。

---

## 軽微な指摘

### 【軽微1】`setTimeout` が `stop()` でキャンセルされず、画面遷移後に旧ゲームが共有 `fretboard` を上書きするレース

- リスナーの累積は**なし**（`Fretboard` は1度だけ生成、`onTap` は加算でなく**置換**、`buildLvList` / `waveButtons` も1回のみ）。この点は問題なし。
- ただし `game.js:97, 99` の `_nextQuestion` / `_finish` 予約タイマーは `stop()`（`game.js:120`）で止まらない。正解直後（500ms 予約中）に「ホーム」「リトライ」を押すと、旧 Game のタイマーが後から発火し、**共有している `fretboard` を旧問題で再描画**したり旧クロージャで DOM（`elIntervalName` 等）を書き換える。
- **修正方針**: タイマーハンドルを保持し、`stop()` で `clearTimeout` する。

### 【軽微2】`touchend` と `click` の二重登録

- `fretboard.js:239-240` で両方を同一ハンドラに登録。`touchend` 側は `{passive:false}` + `preventDefault()` なので iOS では合成 click が概ね抑止されるが、保険がない。
- **修正方針**: `_handleTap` を冪等にするか、タッチ環境では click を無効化する。

### 【軽微3】盤面外の縦方向タップも反応する

- `_handleTap`（`fretboard.js:249-253`）は `minDist = Infinity` 始点で常に最近接弦を確定するため、ボード上下の余白（`PAD_TOP/BOT`）をタップしても x がフレット窓内なら最寄り弦として判定される。
- なお縦持ち/横持ちの判定は `fretboard.js` ではなく `app.js:230` の `updatePortraitOverlay`（`innerHeight > innerWidth`）で行われ、座標変換（`fretboard.js:235-236`）は `getBoundingClientRect` ベースで向きに依存せず正しい。回転時の不具合は見当たらず。

### 【軽微4】`_pickRootPosition` の冗長条件

- `game.js:212` の `calcDisplayRange(fret).end <= MAX_FRET` は、`calcDisplayRange` が常に `end <= MAX_FRET-1` を返す（`music.js:209`）ため恒真で無意味。
- MAX_FRET=17 の一貫性自体は表示・タップ・出題で揃っており、ここ以外に不整合なし。

### 【軽微5】未使用コード

- `isChordToneHit` / `allPositionsForPc` / `allPositionsForTension`（music.js）、`playChord` / `playArpeggio`（audio.js）、`isTensionHit` 経路、`CHORD_TYPES` / `INTERVAL_NAMES` はインターバル編では未使用（`intervals` が全て 0〜11 でテンション判定に到達しない）。
- コードトーン編向けの先行実装と思われる。`// コードトーン編で使用予定` 等のコメントがあると意図が明確。
- 命名規則（camelCase / `_private`）や CLAUDE.md 記載の規約は概ね遵守。

---

## 優先対応のおすすめ

1. **重大2（localStorage try/catch）** — iPad Safari で即クラッシュし得るため最優先。
2. **重大1（`_hasValidAnswer` の範囲整合 + 練習モード定義）** — 練習5thが確実に詰むため早急に。
3. 軽微1（タイマーの clearTimeout）。

---

## 補足

- 検証スクリプト: `scratchpad/check.mjs`（全レベル×全ルート×全インターバルで「表示窓内に正解0」の組合せを総当たり）。
