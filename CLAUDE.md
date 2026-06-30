# guitar-fretboard-app — CLAUDE.md

ギター指板上でルート音からの度数（インターバル）の絶対位置を耳と指で体に入れる自習PWA。
iPad（横持ち）メイン。HTML/CSS/JS（フレームワーク不使用）、GitHub Pages公開予定。

## 起動方法

```bash
# mkcert で cert.pem / key.pem を生成済みの前提
node server.js   # HTTPS on port 3443
```

iPad から `https://192.168.1.7:3443` でアクセス（IPアドレスは環境に合わせて変更）。

## 技術スタック

- **音再生**: Web Audio API `OscillatorNode`（sine/triangle/sawtooth/square 切り替え可）
- **指板描画**: Canvas 2D（`fretboard.js`）
- **ゲームロジック**: `game.js`（問題生成・判定・タイマー）
- **音楽理論**: `music.js`（ピッチクラス計算・コード定義・LV設定）
- **スコア保存**: localStorage（モード×LVごと、タイムランキング上位20件）
- **PWA**: Service Worker キャッシュファースト、manifest.json

## ファイル構成

```
js/
  app.js        エントリポイント・状態管理・画面遷移・イベント配線
  music.js      音楽理論・ピッチクラス・コードデータ・LV設定
  fretboard.js  Canvas指板描画・タップ判定（Fretboardクラス）
  audio.js      Web Audio API音再生（AudioEngineクラス）
  game.js       ゲームロジック・問題生成・判定（Gameクラス）
css/style.css
index.html      3画面（ホーム/ゲーム/リザルト）+ ハンバーガーメニュー
sw.js           Service Worker
manifest.json   PWA設定（orientation: landscape）
server.js       Node.js HTTPSサーバー（開発用）
```

## 音楽理論メモ

### ピッチクラス
`OPEN_STRINGS = [4, 9, 2, 7, 11, 4]`（6弦〜1弦: E,A,D,G,B,E）
`STRING_MIDI  = [40, 45, 50, 55, 59, 64]`

### 判定ルール
- **コードトーン** (0〜11半音): ピッチクラス一致ならオクターブ問わず正解
- **テンション** (12半音以上): ルートから12半音以上離れた位置のみ正解

### 難易度LV（インターバル編）
| LV | 出題音 | 基準音 | 判定弦 |
|---|---|---|---|
| 1 | R・3rd・5th | C固定 | 6弦のみ |
| 2 | +2nd・4th | C固定 | 低音2弦 |
| 3 | +m3rd・m7th | E/A/D/G/C/Bランダム | 低音3弦 |
| 4 | +6th・#5 | 12音フルランダム | 低音4弦 |
| Max | 全12音 | 12音フルランダム | 全指板 |

## 現在の状態（最終更新: 2026-06-30）

v1.0 初期実装完了。インターバル編のみ実装済み。
コードトーン編は準備中。

### 最近の変更
- **MAX_FRET=17**: 表示・タップ判定・全範囲チェックを 17F まで統一
  - `music.js`: `MAX_FRET = 17`
  - `fretboard.js`: `POSITION_MARKS` に 17 を追加（実際のギターのポジションマーク）
  - `_handleTap` のブレーク条件は `f > MAX_FRET`（= `f > 17`）のまま変更不要
- **LV.4/LV.Max 基準音ランダム化**: `rootStrings: [0,1,2]`, `rootOctaves: [0,1]` で 6・5・4 弦×0/1 オクターブ候補からランダム選択
- **出題バリデーション**: `_hasValidAnswer()` + 最大 30 回リトライで「18F 以上にしか正解がない」問題を排除
- **SW**: `fretboard-v7`

## GitHub Pages 公開予定情報

- すべてのパスは相対パス（`./`）で記述
- key.pem / cert.pem は .gitignore 済み

## 注意点

- Canvas は `clientWidth/Height * devicePixelRatio` でサイズ設定。`fretboard.resize()` は `showScreen('screen-game')` の後、かつ `requestAnimationFrame` コールバック内で呼ぶこと（`display:none` 中は `clientWidth/Height` が 0 になるため）
- AudioContext は iOS では最初のユーザー操作（タップ）後でないと音が出ない。`_ensureContext()` で `state === 'suspended'` 時に `resume()` している
