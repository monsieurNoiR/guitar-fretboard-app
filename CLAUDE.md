# guitar-fretboard-app — CLAUDE.md

ギター指板上でルート音からの度数（インターバル）の絶対位置を耳と指で体に入れる自習PWA。
iPad（横持ち）メイン。HTML/CSS/JS（フレームワーク不使用）、GitHub Pages 公開済み。

## 起動方法

```bash
# mkcert で cert.pem / key.pem を生成済みの前提
node server.js   # HTTPS on port 3443
```

iPad から `https://192.168.1.7:3443` でアクセス（IPアドレスは環境に合わせて変更）。

## 技術スタック

- **音再生**: Web Audio API `OscillatorNode`（sine/triangle/sawtooth/square 切り替え可、デフォルト square）
- **指板描画**: Canvas 2D（`fretboard.js`）、0F〜17F 対応
- **ゲームロジック**: `game.js`（問題生成・判定・2タップフロー・タイマー）
- **音楽理論**: `music.js`（ピッチクラス計算・コード定義・LV設定）
- **スコア保存**: localStorage（モード×LVごと、タイムランキング上位20件）
- **PWA**: Service Worker キャッシュファースト（`fretboard-v9`）、manifest.json（orientation: landscape）

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
guide.html      初めて触る人向け説明ページ（スタンドアロン）
sw.js           Service Worker（fretboard-v9）
manifest.json   PWA設定（orientation: landscape）
server.js       Node.js HTTPSサーバー（開発用）
```

## 音楽理論メモ

### ピッチクラス
`OPEN_STRINGS = [4, 9, 2, 7, 11, 4]`（6弦〜1弦: E,A,D,G,B,E）
`STRING_MIDI  = [40, 45, 50, 55, 59, 64]`
`MAX_FRET = 17`

### 判定ルール
- **コードトーン** (0〜11半音): ピッチクラス一致ならオクターブ問わず正解
- **テンション** (12半音以上): ルートから12半音以上離れた位置のみ正解

### 難易度LV（インターバル編）
| LV | 出題音 | 基準音 | 判定弦 |
|---|---|---|---|
| 練習 | R・3rd・5th | C 固定 | 低音3弦（6〜4弦） |
| LV.1 | R・3rd・5th | C 固定 | 低音3弦（6〜4弦） |
| LV.2 | +2nd・4th | C 固定 | 低音4弦（6〜3弦） |
| LV.3 | +m3・m7 | E/A/D/G/C/B ランダム | 低音5弦（6〜2弦） |
| LV.4 | +6th・#5 | 12音フルランダム、6〜4弦×0/1oct | 全弦 |
| Max | 全12音 | 12音フルランダム、6〜4弦×0/1oct | 全弦 |

### 出題バリデーション
`_hasValidAnswer(rootPc, rootMidi, semitones, rootFret)` が `calcDisplayRange(rootFret)` の表示窓内に正解ポジションが存在するかチェック。失敗時は最大 30 回リトライ。

## 現在の状態（最終更新: 2026-07-01）

インターバル編 v1.4.0 完了・GitHub Pages 公開済み（従来の改善に加え、ハンバーガーメニュー表示バグの修正、詰まった時のヒント表示機能（LV.Max除く、ON/OFF切替可）を追加）。
コードトーン編は v1.5 予定・未着手。

- **公開URL**: `https://monsieurnoir.github.io/guitar-fretboard-app/`
- **ガイドページ**: `https://monsieurnoir.github.io/guitar-fretboard-app/guide.html`

## GitHub Pages

- すべてのパスは相対パス（`./`）で記述
- key.pem / cert.pem は .gitignore 済み
- main ブランチへのプッシュで自動デプロイ

## 注意点

- Canvas は `clientWidth/Height * devicePixelRatio` でサイズ設定。`fretboard.resize()` は `showScreen('screen-game')` の後、かつ `requestAnimationFrame` コールバック内で呼ぶこと（`display:none` 中は `clientWidth/Height` が 0 になるため）
- AudioContext は iOS では最初のユーザー操作（タップ）後でないと音が出ない。`AudioEngine.playNote()` 内で `state === 'suspended'` 時に `resume()` している
- `calcDisplayRange` が返す `end` の意味は「最後のフレット線位置」であり、表示されるゾーンは `end+1` まで。`end` の上限は `MAX_FRET - 1 = 16`（ゾーン最大 = 17F）
- localStorage の `setItem`/`JSON.parse` は iOS Safari プライベートブラウズで例外を投げる。`loadScores()` / `saveScore()` で try/catch 済み
- **画面表示のタイマーとスコア用タイマーは別物**: `app.js` の `elTimer`（フッター表示）は `Game.start()` 直後に始動し、ゲーム画面を出るまで一度も止まらない単純な経過時間。一方 `Game._totalTime`（リザルト・ランキングに保存される値）は出題音再生後から正解までを問題ごとに積算した別のカウント。両者は数値が一致しないので、タイマー周りを触るときはどちらの値を変更しているか要確認
- `Game._startTimer()` は呼ばれるたびに `_qStartTime` を上書きするのではなく、前回開始時刻からの経過分を `_totalTime` に加算してから計り直す実装にしている（「もう一度」ボタンで `_playQuestion` 経由で再度呼ばれるため、加算しないと聞き直すたびにタイムが消えるバグになる）
- **ローカル検証時、`server.js` を再起動してファイルを更新してもブラウザ（Chrome）が古い `.js`/`.html` をHTTPキャッシュから返すことがある**（`server.js` はキャッシュ制御ヘッダーを一切付与していないため、Chromeのヒューリスティックキャッシュに乗ってしまう）。動作確認で変更が反映されない場合は、まずハードリロード（Cmd+Shift+R）を試すこと
- **ヒント機能（`Game._scheduleHint`）はスケジュール時点の `_phase` を覚えておき、タイマー発火時に現在の `_phase` と比較して不一致なら無視する**実装にしている。ルート正解でフェーズが `root`→`interval` に変わった直後に `_playQuestion` 経由の古いタイマーが発火すると、誤って古いフェーズ用のヒントが出てしまうため。ヒント関連のタイマーを追加・変更する際はこのガードを崩さないよう注意（実際に一度、フェーズ1のヒントがフェーズ2に残留するバグを作り込んで検証時に発見・修正した）
