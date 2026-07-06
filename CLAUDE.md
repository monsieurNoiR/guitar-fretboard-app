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
- **PWA**: Service Worker キャッシュファースト（`fretboard-v17`）、manifest.json（orientation: landscape）

## ファイル構成

```
js/
  app.js        エントリポイント・状態管理・画面遷移・イベント配線
  music.js      音楽理論・ピッチクラス・コードデータ・LV設定
  fretboard.js  Canvas指板描画・タップ判定（Fretboardクラス）
  audio.js      Web Audio API音再生（AudioEngineクラス。単音playNote/コードpolyphonic再生playChord）
  game.js       インターバル編ゲームロジック・問題生成・判定（Gameクラス）
  chordGame.js  コードトーン編〔発見モード〕ゲームロジック（ChordGameクラス、Stage 1）
  arpeggioGame.js コードトーン編〔アルペジオモード〕ゲームロジック（ArpeggioGameクラス、Stage 3）
css/style.css
index.html      3画面（ホーム/ゲーム/リザルト）+ ハンバーガーメニュー
guide.html      初めて触る人向け説明ページ（スタンドアロン）
sw.js           Service Worker（fretboard-v17）
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

### コードトーン編〔発見モード〕Stage 1〜5（`js/chordGame.js`）
- **モード**: 練習のみ（タイマーなし、無限ループ）。10問セット・ランキングは対象外
- **出題（Stage 4でルート可変化、Stage 5で全10種類復帰）**: Stage 1〜3はルートC固定だったが、Stage 4でアルペジオモードStage 3方式（インターバル編LV.4方式）と同型にルート音を12音フルランダム化（`ROOT_PCS`）・弦・オクターブ（`ROOT_OCTAVES: [0,1]`）も可変。Stage 4ではルート可変化の原因切り分けを容易にするため対象コードタイプを一時的にトライアド（maj/min）のみへ絞り込んでいたが、**Stage 5で7th系8種類（maj7, min7, dom7, dim7, m7b5, aug, sus2, sus4）を復帰し、`CHORD_TYPE_IDS` は全10種類**（`music.js` の `CHORD_TYPES` の全キー）になった。テンション（9th/11th等）は出題対象外。**判定弦域（かつてのルート弦・判定弦固定）は v1.11.0 でユーザー設定に統合済み。詳細は下記「判定弦カスタマイズ機能」セクション参照**
- **ルートポジション抽選**: `ArpeggioGame._pickRootPosition()` と同一の `ChordGame._pickRootPosition()` を新設（`music.js` の共有関数 `rootPositionCandidates(rootPc, rootStrings, rootOctaves)` 呼び出し＋候補ゼロ時フォールバック）。`music.js`・`js/arpeggioGame.js`・`js/game.js` は無変更で流用
- **出題可解性チェック（Stage 4で動的リトライ化）**: `music.js` の `hasSolvableChordTones(rootPc, rootFret, judgeStrings, semitones)` が、ルート×コードタイプの組み合わせ単位で `calcDisplayRange(rootFret)` の表示窓・判定弦内に全構成音が存在するかチェック。Stage 1〜3はルート固定のためコードタイプのみリトライしていたが、Stage 4で `Game._nextQuestion()` / `ArpeggioGame._nextChord()` と同型の「ルートPC・ルートポジション・コードタイプをまとめて再抽選するdo-whileリトライ」（最大30回、`MAX_TYPE_RETRY` → `MAX_QUESTION_RETRY` にリネーム）へ変更。`hasSolvableChordTones()` 自体は無変更で、呼び出し側で毎回異なる `rootPc`/`rootFret` を渡すだけで対応。Node上で `_nextChord()` を5000回呼び機械検証済み（詰みゼロ・全12音出現・6/5/4弦ほぼ均等分布・両オクターブ出現・maj/minのみ・マスク正常）。チェック範囲は `_hasValidAnswer` と完全に同型（`start` は指板左端の「フレット線」位置でタップ不可のため実際のループ範囲は `start+1〜end+1`、`start === 0` の場合のみ開放弦0Fを別途許可）
- **判定ロジック（未クリア集合方式）**: コード開始時に構成音のピッチクラス集合を持ち、順不同でタップして見つけた度数を集合から消す。集合が空になったら次のコードへ自動遷移（`NEXT_CHORD_DELAY = 800ms`）。フェーズ管理（Root→度数のような順序制約）はしない
- **進捗表示**: `root-name` 要素に常時テキストで表示（例:「R ✓　3rd ✓　5th ✓　7th（未）」、7th系は4音）。既存の `interval-name` 要素にはコード名（例:「C Minor」）を表示。ヒント機能や表示の補助ON/OFFは対象外
- **ポリフォニック再生**: `AudioEngine.playChord(midis, duration)` で複数 `OscillatorNode` を同時発音。`_chordVoices` は `midis.map(...)` で可変長対応済み（3音固定ではない）。既存の単音再生 `playNote()`（`_activeVoice` で後勝ちカット）とは別管理にし、互いに干渉しない。`AudioEngine.stopChord()` で再生中のコードを即座にフェードアウト（`ChordGame.stop()` から呼ばれ、ホームボタン離脱時に音を止める）
- **モード離脱時のクリーンアップ**: `ChordGame._nextChord()` の先頭で `fretboard.clearConfirmedRoot()` を呼び、インターバル編でRootタップ後に離脱した際のオレンジマーカー残留を防止
- **タップフィードバックの3値表現**: `Fretboard.showFeedback(stringIdx, fret, state)` の `state` は `true`（正解）/ `false`（不正解）/ `'neutral'`（構成音だが既にクリア済みの度数を別ポジションで再タップ、`COLOR.neutral` の青系で表示）。インターバル編（Gameクラス）は従来通り真偽値のみ渡す
- **フッタータイマー非表示**: タイマーなし仕様のため、`app.js` の `startChordPractice()` は `elTimer` に `hidden` クラスを付与し `startTimerDisplay()` を呼ばない（`startGame()` 側で `hidden` を解除しているため、インターバル編に戻れば再表示される）
- **既知の制約（テンションは低音3弦・6フレット窓では原理的に大半が不可能）**: ルートC・6弦8Fの窓（6F〜12F）内では9th(+14)/b9(+13)のみ到達可能で、11th以上（11th/#11th/13th/b13/#9）はMIDI距離が窓幅を超えるため物理的に到達不可。窓を動的に広げる方式は「実際の運指で無理なく弾ける1ポジション分」というコアコンセプトのため却下済み。テンション出題を扱うにはルート可変化・窓再設計を伴う別ステージでの再検討が必要
- **発見モードのルート可変化・全10コードタイプ対応はStage 5（v1.10.0）で完了**。将来のステージでテンション・出題度数の部分集合・対象弦の可変設定・出題順序制約（順序固定⇄順不同を段階的に混ぜる案）を追加予定
- **Stage 4 コードレビュー結果の申し送りとStage 5での対応**（`CODE_REVIEW_2026-07-03_chordgame-stage4.md`）:
  - **F1（対応済み）**: Stage 4の「詰みゼロ」は maj/min トライアド限定の全数検証結果だったため、Stage 5で `CHORD_TYPE_IDS` に7th系8種類を戻す際、全12 rootPc × 全ルート候補位置（6/5/4弦×0/1oct）× 全10種類（540通り）で `hasSolvableChordTones()` を総当たりし、不可解な組み合わせ0件を確認済み（3音組・4音組ともに詰みゼロ）
  - **F2（既存事象・対応不要）**: `music.js` の `isChordToneHit(rootPc, tapPc)` は、発見モードの呼び出し（`isChordToneHit(t.pc, pc)`）では第1引数にルートではなく任意の構成音pcを渡しており引数名がやや誤解を招く（実体は純粋なピッチクラス等値比較 `tapPc === rootPc`）。Stage 1からの既存事象で対応不要だが、テンション対応で判定ロジックを触る際に混乱の種になりうるため記録
  - **N1（対応済み）**: `_pickRootPosition()` のフォールバック（`chordGame.js`）の6弦探索上限を `f = 0..12` → `f = 0..11` に統一し、`music.js` の `rootPositionCandidates()` と揃えた。`ArpeggioGame._pickRootPosition()` 側は今回のスコープ外のため `0..12` のまま未修正
- **Stage 5 コードレビュー結果**（`CODE_REVIEW_2026-07-06_chordgame-stage5.md`。総合判定: 問題なし・修正必須の指摘0件）: F1・N1の対応内容（全数検証540通り詰みゼロ、モック5000回検証）を独立した検証で再現・確認。無改修とされた `music.js`・`js/arpeggioGame.js`・`js/game.js` の無変更、`README.md`・`guide.html`・`index.html`・`log.md` の記述整合性も確認済み。以下、情報提供（修正不要・既存事象）として将来テンション対応時の参考記録:
  - **INFO-1（dim7の度数名表示）**: `dim7 = [0,3,6,9]` の9半音は `INTERVAL_NAMES[9] = '6th'` として表示される（進捗テキストで「Diminished 7」なのに構成音表示に「6th」が並ぶ）。理論上はdouble-flat 7 = 長6度の異名同音で正しいが、コード名との見た目のギャップがある。`INTERVAL_NAMES` はStage 1から無変更でStage 5の新規事象ではない
  - **INFO-2（対称コードの同一pc集合）**: aug（3根で同一集合）・dim7（4根で同一集合）は、ルートが変わってもタップ対象のピッチクラス集合が一致する。発見モード（構成音の同定が目的）では実用上問題ないが、テンション対応や出題順序制約を入れる段では対称コードのルート識別が困難な点を考慮する必要がある
  - **INFO-3（F2の再掲）**: 上記F2と同じ指摘（`isChordToneHit` の引数名がやや誤解を招く）。テンション判定を実装する際に混乱の種になりうるため重ねて記録
- **次ステージ（テンション対応）着手前の必須確認事項**: 着手前に「オクターブ無視ルール（12半音未満は一律ピッチクラス一致で正解とする現行仕様）がテンション判定（12半音以上は物理的な距離が必要）を無効化していないか」という概念的疑問を必ず解消すること。発見モードStage 1のテンション実装（9th/b9のみ可解と判明していた部分）が実際にオクターブ距離の区別を実装できているか、それとも一律pc一致のみを見ているかは未検証。インターバル編（`js/game.js` のLV.4/LV.Max該当箇所）・アルペジオモードにも同じ疑問が及ぶため、これらを含めて必ずまとめて確認してからテンション対応に着手すること。Stage 5はテンションに一切踏み込んでいないため、この疑問はStage 5の正当性には影響しない

### コードトーン編〔アルペジオモード〕Stage 2〜3（`js/arpeggioGame.js`）
- **目的**: 発見モード（構成音の同定）とは異なり、「聞いた音の順序の記憶と再現」を鍛える新モード。`game.js↔Game`、`chordGame.js↔ChordGame` と同じ「1クラス1ファイル」の慣例に沿って新規ファイルに分離。`js/chordGame.js` は無変更
- **出題（Stage 3でルート可変化）**: コードタイプ（トライアド maj/min のみ、7th系は対象外）はStage 2から変更していないが、ルート音はインターバル編LV.4方式で12音フルランダム化（`ROOT_PCS`）・弦・オクターブ（`ROOT_OCTAVES: [0,1]`）も可変。**判定弦域（かつてのルート弦・判定弦固定）は v1.11.0 でユーザー設定に統合済み。詳細は下記「判定弦カスタマイズ機能」セクション参照**
- **ルートポジション抽選**: `music.js` に共有関数 `rootPositionCandidates(rootPc, rootStrings, rootOctaves)` を新設し、`Game._pickRootPosition`（`js/game.js`）と同じ考え方でルート弦×オクターブの候補を列挙する。候補抽選・候補ゼロ時のフォールバックは `ArpeggioGame._pickRootPosition()` 側の責務（`Game._pickRootPosition` 自体は変更していない）
- **出題可解性チェック（Stage 3で動的リトライ化）**: Stage 2はルートC固定だったためコードタイプのみをリトライ対象にしていたが、Stage 3では `Game._nextQuestion()` と同型の「ルートPC・ルートポジション・コードタイプをまとめて再抽選するdo-whileリトライ」（最大30回、`MAX_QUESTION_RETRY`）に変更。`hasSolvableChordTones()` 自体は無変更で、呼び出し側で毎回異なる `rootPc`/`rootFret` を渡すだけで対応
- **出題順序**: `type.chord` の半音配列をFisher–Yatesで1回シャッフルし `this._sequence` に保持。これが出題順（正解の音順）になる
- **再生**: ストローク（`playChord`）→ 900ms後からアルペジオ（`playNote`を自前の`setTimeout`で順次発火、間隔450ms）。`audio.js`の未使用スキャフォールド`playArpeggio()`は使わない（呼び出し元からキャンセルする手段がなく、画面離脱時に音が止まらない潜在バグを持つため）。`ArpeggioGame`側で各`setTimeout`のIDを配列に保持し、`stop()`/`replay()`で確実に`clearTimeout`する
- **再生中のタップブロック**: `this._playbackLocked` が再生完了まで`true`。インターバル編は音名を画面に即時表示するためタップをブロックしていないが、本モードは度数名を隠して音順記憶を鍛える目的上、再生中のタップを許すと「聴かずに色フィードバックの試行錯誤で解く」抜け道が成立してしまうため、意図的にインターバル編と異なる挙動にしている
- **判定ロジック（フェーズ管理方式）**: `this._phaseIndex`（今何番目の音を待っているか）を持ち、正しいピッチクラスのタップで次へ進める。構成音だが順番違いのタップも通常の不正解と同じ扱い（赤、`'neutral'`状態は使わない）。不正解時は同じフェーズのまま待機する「粘れる」方式（インターバル編・発見モードと同じ）
- **進捗表示**: 度数名を隠し、「1音目 ✓　2音目 ✓　3音目（待機中）」のように順番のみ表示。`onProgress({ chordName, progressText })` という発見モードと同じ形のコールバックを使い、`app.js`側の配線（`elIntervalName`/`elRootName`、`body.mode-chord`の2行レイアウト）をそのまま流用
- **もう一度**: `replay()`は`_phaseIndex`をリセットせず、ストローク＋アルペジオ全体を再生し直すだけ（`Game.replay()`が`_phase`を変えずに音だけ再生し直すのと同じ考え方）
- **ヒント機能**: `Game._scheduleHint()`と同型（スケジュール時点の`phaseIndex`を覚えておき、発火時に不一致なら無視する）。表示対象は「今のフェーズで待っている音」のポジション。ヒント対象ポジション列挙のロジック（`_hintPositionsForPc`）は`Game`と同内容だが、コードトーン編には開放弦除外設定が存在しないためその分岐は持たない
- 発見モードは一切変更しておらず、インターバル編・発見モード双方への回帰がないことを実機・Nodeモックテスト両方で確認済み
- **将来のテンション対応時に必ず確認すべき申し送り事項**: 初期設計では「12半音未満＝度数名（オクターブ無視で正解）」「12半音以上＝テンション名（物理的距離が12半音以上ないと不正解）」という区別を意図していたが、発見モードStage 1のテンション実装（9th/b9のみ可解と判明）が実際にこの区別を実装できているか、それとも一律ピッチクラス一致のみを見ているかは未検証。もし後者なら「9th/b9のみ可解」という結果自体の意味も再検証が必要。また、この区別の要否は発見モード（理論的な構成音の同定）とアルペジオモード（メロディ選択、オクターブは運指の選択に過ぎない）で異なる可能性がある。インターバル編（`js/game.js` のLV.4/LV.Max、ルート・正解音双方がオクターブを跨ぐ箇所）も同様の疑問が当てはまるため、テンション対応に着手する前に必ずまとめて確認すること

### 判定弦カスタマイズ機能（v1.11.0、発見モード・アルペジオモード共通）
- **目的**: コードトーン編（発見モード・アルペジオモード）の判定対象弦は従来6/5/4弦（低音3弦）に固定だったが、ユーザーが3〜6本の範囲で自由に設定できるようにした。`js/game.js`（インターバル編）は対象外（ルートの弦と判定弦が独立して動く別構造のため）
- **実装前調査で判明した経緯**: `js/fretboard.js` の `draw({ maskStrings })` は元々任意の `Set<number>` を受け取れる汎用実装で、`music.js` の `hasSolvableChordTones()` / `rootPositionCandidates()` も弦範囲を引数として受け取る汎用設計だった（いずれも改修不要）。一方 `ROOT_STRINGS` と `JUDGE_STRINGS` は `chordGame.js`・`arpeggioGame.js` それぞれで**独立に定義された別々の定数**で、値がたまたま `[0,1,2]` で一致していただけと判明。`hasSolvableChordTones()` はルートの物理弦位置を見ておらず、構成音のピッチクラスが判定弦域に存在するかだけを見ている
- **設計判断**: 上記調査を踏まえ、`ROOT_STRINGS` をユーザー設定の判定弦域と統合（同じ値を共有）。判定弦を変更するとルート音の出現弦も連動して変わる（「選んだ弦域だけで練習が完結する」体験を優先）
- **データモデル**: 判定弦域を「開始弦インデックス（0=6弦〜5=1弦）＋本数（3〜6）」で表現。`js/chordGame.js`・`js/arpeggioGame.js` はモジュールレベルの固定定数 `ROOT_STRINGS`/`JUDGE_STRINGS` を廃止し、コンストラクタ引数 `stringRange`（デフォルト `[0,1,2]`）を `this._stringRange` として保持。`_nextChord()`・`handleTap()`・マスク生成・`_pickRootPosition()`のフォールバックはすべて `this._stringRange` を参照する
- **設定の持ち方（`js/app.js`）**: `judgeStringStart`/`judgeStringCount` のプレーンなモジュール変数（`hintEnabled`等と同じくlocalStorage永続化なし）。`computeStringRange()` で配列に変換し、`startChordPractice()`/`startChordArpeggio()` で `new ChordGame({..., stringRange})`/`new ArpeggioGame({..., stringRange})` のようにインスタンス生成時に渡す。**設定変更の反映タイミングは「次に練習をはじめたとき」**（既存の `hintEnabled` 等と同じ反映パターンで一貫性を持たせている。プレイ中の設定変更は現在のセッションには影響しない）
- **UI**: ハンバーガーメニューに「コードトーン編：判定弦」の1設定を追加（発見モード・アルペジオモード共通）。本数ボタン（3〜6本、`#judge-count-btns`）と開始弦ボタン（6弦〜1弦、`#judge-start-btns`）の2段構成。本数変更時、`judgeStringStart + count > STRING_COUNT` となる開始弦ボタンは自動的に `disabled`（`.wave-btn:disabled { opacity: 0.35; pointer-events: none; }` を追加）。既存の波形選択ボタンと同じ `.wave-btn` クラスを流用しているため、`js/app.js` の `waveButtons` セレクタを `document.querySelectorAll('.wave-btn')`（全`.wave-btn`にマッチしてしまう）から `#waveform-btns .wave-btn` に絞り込む修正が必要だった（index.htmlの波形ボタンのコンテナに`id="waveform-btns"`を追加）
- **全数検証**: 有効な弦範囲10通り（本数3: 開始弦0-3の4通り、本数4: 0-2の3通り、本数5: 0-1の2通り、本数6: 0のみ）× 全12rootPc × 全ルート候補位置 × 全10コードタイプ（7200通り）で `hasSolvableChordTones()` を総当たりし、詰み0件を確認済み（3音組・4音組とも全弦範囲パターンで詰みゼロ、特に本数3の高音3弦パターンも含む）
- **モック検証**: デフォルト（6〜4弦）・高音3弦（3〜1弦）・全弦（6本）の3パターンで `_nextChord()` を各2000回実行し、指定弦域内でのみ出現し詰みが発生しないことを確認済み

## 現在の状態（最終更新: 2026-07-06）

インターバル編 v1.4.3 完了・GitHub Pages 公開済み（従来の改善に加え、ハンバーガーメニュー表示バグの修正、詰まった時のヒント表示機能（LV.Max除く、ON/OFF切替可）を追加。ヒントドットは実機確認とフィードバックを経て半径 0.2→0.8→0.32、不透明度 0.7→0.5 に調整済み）。

コードトーン編〔発見モード〕v1.6.2 Stage 1 実装・実機確認済み・GitHub Pages 公開済み。コードタイプをメジャー/マイナートライアドから7th系を含む全10種類（maj, min, maj7, min7, dom7, dim7, m7b5, aug, sus2, sus4）に拡張。`music.js` に `hasSolvableChordTones()` を新設し、ルート×コードタイプの組み合わせ単位で出題可解性をチェックする仕組みを追加（Stage 0からの申し送り事項を解消）。実装前にNode上で実際のコードを使い全10種類の可解性を機械的に検証済み（「詰み」なし）。テンションは9th/b9のみ窓内到達可能・11th以上は物理的制約により今回スコープ外。詳細仕様は上記「コードトーン編〔発見モード〕Stage 1〜4」セクション参照。ルート音の可変化・テンション出題は将来ステージで再検討。

v1.6.1でコードトーン編の進捗表示を2行レイアウトに変更（`body.mode-chord` クラスでインターバル編と分岐）。v1.6.2で `hasSolvableChordTones()` のチェック範囲を `Game._hasValidAnswer` と完全に同型へ修正（別セッションのコードレビューで指摘。ルート固定のStage 1では実害なかったが、将来ルート可変化時にバグ化するため先行修正）。

コードトーン編〔アルペジオモード〕v1.7.0 Stage 2 実装・実機確認済み・GitHub Pages 公開済み。発見モードとは別の新規モードとして `js/arpeggioGame.js`（`ArpeggioGame`クラス）に分離実装。コードをストローク→アルペジオ（ランダム順）で聴き、聞こえた順番どおりにタップして再現する。判定はインターバル編と同型の「フェーズ管理」方式（未クリア集合方式ではない）。ホーム画面に3モード目として追加（インターバル編／コードトーン編〔発見〕／コードトーン編〔アルペジオ〕）。対象はルートC固定・低音3弦・トライアド（maj/min）のみ、7th系・テンションは対象外。発見モードは無変更、`hasSolvableChordTones()`をそのまま流用。

コードトーン編〔アルペジオモード〕v1.8.0 Stage 3 実装・実機相当のブラウザ確認済み・GitHub Pages 公開済み。アルペジオモードのルート音をインターバル編LV.4方式で12音フルランダム化（弦: 6/5/4弦、オクターブ: 0/1）。判定対象弦（低音3弦）・対象コードタイプ（トライアドmaj/minのみ）は変更していない。`music.js` に共有関数 `rootPositionCandidates()` を新設し、`hasSolvableChordTones()` の呼び出しを静的1回チェックから `Game._nextQuestion()` と同型の動的リトライへ変更。発見モード（`js/chordGame.js`）・インターバル編（`js/game.js`）は無変更で、両方への回帰がないことを確認済み。詳細仕様は上記「コードトーン編〔アルペジオモード〕Stage 2〜3」セクション参照。

v1.8.1（インフラのみ、アプリ本体は無変更）で GitHub Pages のデプロイ方式をレガシー方式から GitHub Actions ベース（`.github/workflows/deploy-pages.yml`）へ移行。レガシー方式が `gh run rerun` と相性が悪く queued で詰まる問題への対応。詳細は下記「GitHub Pages」セクション参照。

コードトーン編〔発見モード〕v1.9.0 Stage 4 実装・Node機械検証済み。アルペジオモードStage 3で実装・検証済みのルート可変化の仕組み（`music.js` の共有関数 `rootPositionCandidates()` ＋ 動的do-whileリトライ）を発見モードへ横展開し、ルート音を12音フルランダム化（弦: 6/5/4弦、オクターブ: 0/1）。判定対象弦（低音3弦）は固定のまま。ルート可変化の原因切り分けを容易にするため、対象コードタイプを一時的にトライアド（maj/min）のみへ絞り込み（`CHORD_TYPE_IDS = ['maj','min']`、7th系はコメントで残す）。`js/chordGame.js` のみ変更、`music.js`・`js/arpeggioGame.js`・`js/game.js` は無変更。Node上で `_nextChord()` を5000回呼び機械検証済み（詰みゼロ・全12音出現・6/5/4弦ほぼ均等・両オクターブ出現・maj/minのみ・マスク正常）。

コードトーン編〔発見モード〕v1.10.0 Stage 5 実装・Node機械検証済み。Stage 4のコードレビュー申し送り（F1）に対応し、`CHORD_TYPE_IDS` に7th系8種類（maj7, min7, dom7, dim7, m7b5, aug, sus2, sus4）を復帰、全10種類でのルート可変化に対応完了。実装前に全12 rootPc × 全ルート候補位置（6/5/4弦×0/1oct）× 全10種類の直積（540通り）で `hasSolvableChordTones()` を総当たり検証し、3音組（maj/min/sus2/sus4/aug）・4音組（maj7/min7/dom7/dim7/m7b5）とも詰みゼロを確認。加えて `ChordGame._nextChord()` をモック経由で5000回実行し、全12rootPc・6/5/4弦（ほぼ均等）・両オクターブ・全10種類が偏りなく出現し詰みゼロであることも確認。任意対応だったN1nit（`_pickRootPosition()` フォールバックのフレット探索上限を `0..12`→`0..11` に統一）も本ステージで反映。`js/chordGame.js` のみ変更、`music.js`・`js/arpeggioGame.js`・`js/game.js` は無変更。別セッションのコードレビュー（`CODE_REVIEW_2026-07-06_chordgame-stage5.md`）でも全数検証・モック検証の結果を独立に再現でき、修正必須の指摘0件（INFO-1〜3は将来テンション対応時の参考記録として上記セクションに反映済み）。詳細仕様は上記「コードトーン編〔発見モード〕Stage 1〜5」セクション参照。

コードトーン編（発見モード・アルペジオモード共通）v1.11.0 判定弦カスタマイズ機能 実装・実機相当のブラウザ確認済み。判定対象弦が低音3弦固定だった制約を解消し、ハンバーガーメニューから3〜6本の範囲で自由に設定できるようにした。実装前の調査で、`ROOT_STRINGS`と`JUDGE_STRINGS`が`chordGame.js`・`arpeggioGame.js`それぞれで独立に定義された別定数の偶然の一致だったと判明したため、`ROOT_STRINGS`をユーザー設定の判定弦域に統合（判定弦を変えるとルート出現弦も連動）。`js/fretboard.js`・`js/music.js`は事前調査で汎用実装済みと確認できたため無変更。全数検証（有効な弦範囲10通り×全12rootPc×全10コードタイプ、7200通り）・モック検証（3パターン×2000回）とも詰みゼロを確認。発見モードのテンション対応は次ステージで検討するが、着手前に「次ステージ（テンション対応）着手前の必須確認事項」（オクターブ無視ルールとテンション判定の整合性）を必ず解消すること。詳細仕様は上記「判定弦カスタマイズ機能」セクション参照。

v1.5.2でハンバーガーメニューにバージョン表示を追加、v1.5.3で同メニューが画面高さに収まらず一部の設定項目が見えなくなる問題を修正（ヘッダー固定＋本体スクロール化）。両編共通のUI改善。

- **公開URL**: `https://monsieurnoir.github.io/guitar-fretboard-app/`
- **ガイドページ**: `https://monsieurnoir.github.io/guitar-fretboard-app/guide.html`

## GitHub Pages

- すべてのパスは相対パス（`./`）で記述
- key.pem / cert.pem は .gitignore 済み
- main ブランチへのプッシュで自動デプロイ
- **デプロイ方式（v1.8.1〜）**: GitHub Actions ベース。`.github/workflows/deploy-pages.yml` が main への push で起動し、`actions/checkout` → `actions/configure-pages` → `actions/upload-pages-artifact`（`path: .`、ビルド工程なし）→ `actions/deploy-pages` の順で配信する。`Settings → Pages → Source` は「GitHub Actions」（`build_type: workflow`）。手動再実行は `gh workflow run deploy-pages.yml` または Actions 画面の Re-run から
- **旧デプロイ方式（v1.8.0まで）**: レガシー方式（`pages-build-deployment`、GitHubが自動生成する特殊ワークフロー）。`gh run rerun` と相性が悪く queued のまま詰まる問題があったため v1.8.1 で移行した。Source を Actions に切り替えたことでレガシーの自動ビルドは停止済み（もし将来 Source を「Deploy from a branch」に戻すとレガシー方式が復活する）

## バージョン表示

- `index.html` のハンバーガーメニュー最下部（`.app-version`、使い方ガイドリンクの下）にバージョン番号を表示している（例:「v1.7.0」）
- **バージョンを上げるたびに、この表示を必ず更新すること**（`log.md` に新しいバージョンのエントリを追加するタイミングと合わせる）
- 表示内容を変更した場合は `sw.js` のキャッシュバージョンも忘れずに更新する

## 注意点

- Canvas は `clientWidth/Height * devicePixelRatio` でサイズ設定。`fretboard.resize()` は `showScreen('screen-game')` の後、かつ `requestAnimationFrame` コールバック内で呼ぶこと（`display:none` 中は `clientWidth/Height` が 0 になるため）
- AudioContext は iOS では最初のユーザー操作（タップ）後でないと音が出ない。`AudioEngine.playNote()` 内で `state === 'suspended'` 時に `resume()` している
- `calcDisplayRange` が返す `end` の意味は「最後のフレット線位置」であり、表示されるゾーンは `end+1` まで。`end` の上限は `MAX_FRET - 1 = 16`（ゾーン最大 = 17F）
- localStorage の `setItem`/`JSON.parse` は iOS Safari プライベートブラウズで例外を投げる。`loadScores()` / `saveScore()` で try/catch 済み
- **画面表示のタイマーとスコア用タイマーは別物**: `app.js` の `elTimer`（フッター表示）は `Game.start()` 直後に始動し、ゲーム画面を出るまで一度も止まらない単純な経過時間。一方 `Game._totalTime`（リザルト・ランキングに保存される値）は出題音再生後から正解までを問題ごとに積算した別のカウント。両者は数値が一致しないので、タイマー周りを触るときはどちらの値を変更しているか要確認
- `Game._startTimer()` は呼ばれるたびに `_qStartTime` を上書きするのではなく、前回開始時刻からの経過分を `_totalTime` に加算してから計り直す実装にしている（「もう一度」ボタンで `_playQuestion` 経由で再度呼ばれるため、加算しないと聞き直すたびにタイムが消えるバグになる）
- **ローカル検証時、`server.js` を再起動してファイルを更新してもブラウザ（Chrome）が古い `.js`/`.html` をHTTPキャッシュから返すことがある**（`server.js` はキャッシュ制御ヘッダーを一切付与していないため、Chromeのヒューリスティックキャッシュに乗ってしまう）。動作確認で変更が反映されない場合は、まずハードリロード（Cmd+Shift+R）を試すこと
- **ヒント機能（`Game._scheduleHint`）はスケジュール時点の `_phase` を覚えておき、タイマー発火時に現在の `_phase` と比較して不一致なら無視する**実装にしている。ルート正解でフェーズが `root`→`interval` に変わった直後に `_playQuestion` 経由の古いタイマーが発火すると、誤って古いフェーズ用のヒントが出てしまうため。ヒント関連のタイマーを追加・変更する際はこのガードを崩さないよう注意（実際に一度、フェーズ1のヒントがフェーズ2に残留するバグを作り込んで検証時に発見・修正した）
- **`position: fixed; height: 100%` の要素（`.menu-panel` など）は viewport 基準で高さが決まるため、ブラウザ自動操作ツールの `resize_window` でウィンドウを縮めても実際のビューポート高さに反映されないことがある**。ハンバーガーメニューのオーバーフロー動作をローカルで検証する際は、対象要素に一時的に `element.style.height = '260px'` のようなインラインスタイルを直接注入して強制的に低くする方が確実（検証後は `style.height = ''` で戻す）
- **ローカル検証時、Service Worker のキャッシュファースト戦略により、前回セッションで一度でも登録された SW が新しい `.js`/`.html`/`.css` を古い内容のまま返し続けることがある**（`sw.js` のキャッシュバージョンを上げていても、ブラウザタブが以前のセッションから引き続き使われている場合は古いキャッシュのままになりうる）。動作確認で変更が反映されない場合は `navigator.serviceWorker.getRegistrations()` で unregister し、`caches.keys()` の内容を `caches.delete()` してから再読み込みすること
- **ブラウザ自動操作ツールでの視覚テストは、ツール呼び出し間の実時間経過（モデルの思考時間・往復レイテンシ）が数秒〜10秒程度になることがある**。ヒント表示（5〜7秒無反応で発火）のようなタイマー依存の挙動を検証する際、「即座にタップしたつもりが実は数秒経過していてヒントが先に出ていた」といった誤認が起きやすい。タイマー・フェーズ遷移などロジックの正しさを検証する場合は、ブラウザでの目視確認だけに頼らず、Audio/Fretboardをモックにした Node スクリプトで直接メソッドを呼び出して検証する方が確実（`ArpeggioGame` のStage 2実装時に採用した手法）
