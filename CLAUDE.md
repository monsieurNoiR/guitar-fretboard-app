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
- **PWA**: Service Worker キャッシュファースト（`fretboard-v24`）、manifest.json（orientation: landscape）

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
sw.js           Service Worker（fretboard-v24）
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

### コードトーン編〔発見モード〕Stage 1〜6（`js/chordGame.js`）
- **モード**: 練習のみ（タイマーなし、無限ループ）。10問セット・ランキングは対象外
- **出題（Stage 4でルート可変化、Stage 5で全10種類復帰、Stage 6でテンション対応）**: Stage 1〜3はルートC固定だったが、Stage 4でアルペジオモードStage 3方式（インターバル編LV.4方式）と同型にルート音を12音フルランダム化（`ROOT_PCS`）・弦・オクターブ（`ROOT_OCTAVES: [0,1]`）も可変。Stage 4ではルート可変化の原因切り分けを容易にするため対象コードタイプを一時的にトライアド（maj/min）のみへ絞り込んでいたが、Stage 5で7th系8種類（maj7, min7, dom7, dim7, m7b5, aug, sus2, sus4）を復帰し、`CHORD_TYPE_IDS` は全10種類（`music.js` の `CHORD_TYPES` の全キー）になった。**Stage 6で各コードタイプに定義済みの全テンション（`CHORD_TYPES[...].tensions`）を基本構成音とあわせて毎回まとめて出題するように変更。詳細は下記「Stage 6」項目参照**。**判定弦域（かつてのルート弦・判定弦固定）は v1.11.0 でユーザー設定に統合済み。詳細は下記「判定弦カスタマイズ機能」セクション参照**
- **ルートポジション抽選**: `ArpeggioGame._pickRootPosition()` と同一の `ChordGame._pickRootPosition()` を新設（`music.js` の共有関数 `rootPositionCandidates(rootPc, rootStrings, rootOctaves)` 呼び出し＋候補ゼロ時フォールバック）。`music.js`・`js/arpeggioGame.js`・`js/game.js` は無変更で流用
- **出題可解性チェック（Stage 4で動的リトライ化）**: `music.js` の `hasSolvableChordTones(rootPc, rootFret, judgeStrings, semitones)` が、ルート×コードタイプの組み合わせ単位で `calcDisplayRange(rootFret)` の表示窓・判定弦内に全構成音が存在するかチェック。Stage 1〜3はルート固定のためコードタイプのみリトライしていたが、Stage 4で `Game._nextQuestion()` / `ArpeggioGame._nextChord()` と同型の「ルートPC・ルートポジション・コードタイプをまとめて再抽選するdo-whileリトライ」（最大30回、`MAX_TYPE_RETRY` → `MAX_QUESTION_RETRY` にリネーム）へ変更。`hasSolvableChordTones()` 自体は無変更で、呼び出し側で毎回異なる `rootPc`/`rootFret` を渡すだけで対応。Node上で `_nextChord()` を5000回呼び機械検証済み（詰みゼロ・全12音出現・6/5/4弦ほぼ均等分布・両オクターブ出現・maj/minのみ・マスク正常）。チェック範囲は `_hasValidAnswer` と完全に同型（`start` は指板左端の「フレット線」位置でタップ不可のため実際のループ範囲は `start+1〜end+1`、`start === 0` の場合のみ開放弦0Fを別途許可）
- **判定ロジック（未クリア集合方式）**: コード開始時に構成音のピッチクラス集合を持ち、順不同でタップして見つけた度数を集合から消す。集合が空になったら次のコードへ自動遷移（`NEXT_CHORD_DELAY = 800ms`）。フェーズ管理（Root→度数のような順序制約）はしない
- **進捗表示**: `root-name` 要素に常時テキストで表示（例:「R ✓　3rd ✓　5th ✓　7th（未）」）。Stage 6以降はテンションを含むため音数はコードタイプにより3〜10音まで変動する（下記「Stage 6」項目参照）。既存の `interval-name` 要素にはコード名（例:「C Minor」）を表示。ヒント機能や表示の補助ON/OFFは対象外
- **ポリフォニック再生**: `AudioEngine.playChord(midis, duration)` で複数 `OscillatorNode` を同時発音。`_chordVoices` は `midis.map(...)` で可変長対応済み（3音固定ではない）。既存の単音再生 `playNote()`（`_activeVoice` で後勝ちカット）とは別管理にし、互いに干渉しない。`AudioEngine.stopChord()` で再生中のコードを即座にフェードアウト（`ChordGame.stop()` から呼ばれ、ホームボタン離脱時に音を止める）
- **モード離脱時のクリーンアップ**: `ChordGame._nextChord()` の先頭で `fretboard.clearConfirmedRoot()` を呼び、インターバル編でRootタップ後に離脱した際のオレンジマーカー残留を防止
- **タップフィードバックの3値表現**: `Fretboard.showFeedback(stringIdx, fret, state)` の `state` は `true`（正解）/ `false`（不正解）/ `'neutral'`（構成音だが既にクリア済みの度数を別ポジションで再タップ、`COLOR.neutral` の青系で表示）。インターバル編（Gameクラス）は従来通り真偽値のみ渡す
- **フッタータイマー非表示**: タイマーなし仕様のため、`app.js` の `startChordPractice()` は `elTimer` に `hidden` クラスを付与し `startTimerDisplay()` を呼ばない（`startGame()` 側で `hidden` を解除しているため、インターバル編に戻れば再表示される）
- **【解消済み・Stage 6で対応】既知の制約（テンションは低音3弦・6フレット窓では原理的に大半が不可能）**: この記述はStage 0〜1段階の企画検討時の分析で、ルート位置を固定した上で「物理的な半音距離ちょうどの位置（9th=+14, b9=+13等）」を6フレット窓内に探すという、オクターブ厳密判定を前提にした古い考え方に基づくものだった。Stage 6でオクターブ無視・ピッチクラスベースの設計（下記「Stage 6」項目参照）を採用した結果、この制約は該当しなくなった。全数検証（7200通り）で判定弦3本を含むあらゆる組み合わせにおいて詰みゼロを確認済み
- **発見モードのルート可変化・全10コードタイプ対応はStage 5（v1.10.0）で完了、テンション対応はStage 6（v1.12.0）で完了**。将来のステージで出題度数の部分集合・対象弦の可変設定・出題順序制約（順序固定⇄順不同を段階的に混ぜる案）を追加予定
- **Stage 4 コードレビュー結果の申し送りとStage 5での対応**（`CODE_REVIEW_2026-07-03_chordgame-stage4.md`）:
  - **F1（対応済み）**: Stage 4の「詰みゼロ」は maj/min トライアド限定の全数検証結果だったため、Stage 5で `CHORD_TYPE_IDS` に7th系8種類を戻す際、全12 rootPc × 全ルート候補位置（6/5/4弦×0/1oct）× 全10種類（540通り）で `hasSolvableChordTones()` を総当たりし、不可解な組み合わせ0件を確認済み（3音組・4音組ともに詰みゼロ）
  - **F2（既存事象・対応不要）**: `music.js` の `isChordToneHit(rootPc, tapPc)` は、発見モードの呼び出し（`isChordToneHit(t.pc, pc)`）では第1引数にルートではなく任意の構成音pcを渡しており引数名がやや誤解を招く（実体は純粋なピッチクラス等値比較 `tapPc === rootPc`）。Stage 1からの既存事象で対応不要だが、テンション対応で判定ロジックを触る際に混乱の種になりうるため記録
  - **N1（対応済み）**: `_pickRootPosition()` のフォールバック（`chordGame.js`）の6弦探索上限を `f = 0..12` → `f = 0..11` に統一し、`music.js` の `rootPositionCandidates()` と揃えた。`ArpeggioGame._pickRootPosition()` 側は今回のスコープ外のため `0..12` のまま未修正
- **Stage 5 コードレビュー結果**（`CODE_REVIEW_2026-07-06_chordgame-stage5.md`。総合判定: 問題なし・修正必須の指摘0件）: F1・N1の対応内容（全数検証540通り詰みゼロ、モック5000回検証）を独立した検証で再現・確認。無改修とされた `music.js`・`js/arpeggioGame.js`・`js/game.js` の無変更、`README.md`・`guide.html`・`index.html`・`log.md` の記述整合性も確認済み。以下、情報提供（修正不要・既存事象）として将来テンション対応時の参考記録:
  - **INFO-1（dim7の度数名表示）**: `dim7 = [0,3,6,9]` の9半音は `INTERVAL_NAMES[9] = '6th'` として表示される（進捗テキストで「Diminished 7」なのに構成音表示に「6th」が並ぶ）。理論上はdouble-flat 7 = 長6度の異名同音で正しいが、コード名との見た目のギャップがある。`INTERVAL_NAMES` はStage 1から無変更でStage 5の新規事象ではない
  - **INFO-2（対称コードの同一pc集合）**: aug（3根で同一集合）・dim7（4根で同一集合）は、ルートが変わってもタップ対象のピッチクラス集合が一致する。発見モード（構成音の同定が目的）では実用上問題ないが、テンション対応や出題順序制約を入れる段では対称コードのルート識別が困難な点を考慮する必要がある
  - **INFO-3（F2の再掲）**: 上記F2と同じ指摘（`isChordToneHit` の引数名がやや誤解を招く）。テンション判定を実装する際に混乱の種になりうるため重ねて記録
- **【解消済み】オクターブ無視ルールとテンション判定の整合性確認（2026-07-07）**: 長年の懸案事項だった「オクターブ無視ルールがテンション判定を無効化していないか」は解消済み。理由：この確認を行った時点で発見モード（`js/chordGame.js`）にはテンション判定ロジック自体がそもそも存在しなかった。`music.js`の`CHORD_TYPES.tensions`フィールド（生の半音数、9th:14・b9:13等）はどこからも読まれていない未使用データで、実際の判定は`type.chord`（ピッチクラス、0〜11の範囲）と`isChordToneHit()`（純粋なpc一致）のみで行われていた。オクターブを厳密に見る`isTensionHit()`は存在するが、`js/game.js`（インターバル編）専用で`chordGame.js`・`js/arpeggioGame.js`からは呼ばれていない。確定方針（コードトーン編＝オクターブ無視が正しい設計）は、直後のStage 6実装で以下の通り実現された
- **Stage 6: テンション対応（v1.12.0）**: 上記の方針確認を踏まえ、`CHORD_TYPES.tensions`に定義済みの全テンションを基本構成音とあわせて毎回まとめて出題する機能を実装（1個だけランダム抽選ではなく定義済み全部）
  - **実装**: `music.js`に新規関数`extendedChordTones(type)`を追加。`type.chord`（基本構成音）と`type.tensions`（テンション）を統合し、ピッチクラスが重複するものは除外した「拡張構成音リスト」（`[{semitone, name}]`）を返す。`semitone`は生の値（mod12化しない）のまま保持し、`_playChord()`でルートMIDIに加算する際に実際に正しいオクターブで鳴らせるようにしている。`chordGame.js`の`_nextChord()`はこのリストを`type.chord`の代わりに使い、`hasSolvableChordTones()`の可解性チェック・`this._chordTones`の生成の両方に渡す
  - **`hasSolvableChordTones()`は無変更で対応**: この関数は内部で`(rootPc + semitone) % 12`を計算しているため、12以上の生の半音数（テンション）を渡しても元から正しく動作する。呼び出し側が渡す配列を拡張しただけで、`handleTap()`・`_emitProgress()`・`_playChord()`（いずれも`_chordTones`配列に対して汎用的に動作）も無変更で対応できた
  - **sus2のピッチクラス衝突**: sus2の基本構成音2nd（pc2）と、定義済みテンション9th（14半音→pc2）が完全に一致する唯一のケース。ユーザー確認の上、ピッチクラス基準で重複除去する方針を採用（`extendedChordTones()`が全コードタイプ共通の汎用ルールとして重複pcをスキップするため、sus2は特別扱いなしで実質R・2nd・5thの3音のまま出題される。9thは2ndに吸収され進捗表示にも出ない）。他の9コードタイプは基本構成音とテンションのpcが一切衝突しない
  - **拡張後の実質音数**: maj/min/aug=6音、maj7/min7/m7b5=7音、dom7=10音（最多）、dim7=5音、sus2=3音（最少）、sus4=4音
  - **全数検証**: 有効な弦範囲10通り（本数3〜6）× 全12rootPc × 全ルート候補位置 × 全10コードタイプの拡張構成音セット（合計7200通り）で`hasSolvableChordTones()`を総当たりし、**詰み0件**を確認（dom7の10音・判定弦3本の組み合わせも含む）
  - **モック検証**: Audio/Fretboardをモック化した`ChordGame._nextChord()`を5000回実行し、コードタイプごとの音数が期待通り（sus2=3, dom7=10等）で常に一定であること、`_chordTones`内でpcの重複が発生しないことを確認
  - **スコープ外**: アルペジオモード（`js/arpeggioGame.js`）・インターバル編（`js/game.js`）は無変更。アルペジオモードは7th系自体が未対応のため、テンション対応は別課題として引き続き切り離す
  - **Stage 6 コードレビュー結果**（`CODE_REVIEW_2026-07-07_chordgame-tensions-stage6.md`）: 修正不要と結論
    - **F1（見送り・要再検討事項として記録）**: dom7の10音同時発音による音量クリッピングの可能性を指摘。実機確認の結果、気にならなかったため今回は対応を見送り。将来的に同時発音数がさらに増える変更（追加のテンション対応や別のコードタイプ拡張等）を行う際は、`js/audio.js`の`playChord()`に音量正規化やコンプレッサーを入れる対応を再検討すること
    - **INFO-2（対応済み）**: CLAUDE.md内のSWバージョン記述が`fretboard-v17`のまま古かった点を、実際の値（`fretboard-v24`）に修正
    - **INFO-3（既存事象・対応不要）**: dim7の6th表記（INFO-1として上記Stage 5レビューで既出）の再掲。記録のみ

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
- **【解消済み】将来のテンション対応時の申し送り（2026-07-07）**: 上記「コードトーン編〔発見モード〕Stage 1〜5」セクションの「オクターブ無視ルールとテンション判定の整合性確認」を参照。発見モードと同様、アルペジオモードにもテンション判定ロジックは未実装（`type.tensions`は未使用）で、方針（コードトーン編はオクターブ無視で確定）と矛盾はない。将来実装する際の設計メモ（`isTensionHit()`を流用せず`type.chord`にピッチクラス化した値を加える方式）も発見モードと共通

### 判定弦カスタマイズ機能（v1.11.0〜v1.11.1、発見モード・アルペジオモード共通）
- **目的**: コードトーン編（発見モード・アルペジオモード）の判定対象弦は従来6/5/4弦（低音3弦）に固定だったが、ユーザーが3〜6本の範囲で自由に設定できるようにした。`js/game.js`（インターバル編）は対象外（ルートの弦と判定弦が独立して動く別構造のため）
- **実装前調査で判明した経緯（v1.11.0）**: `js/fretboard.js` の `draw({ maskStrings })` は元々任意の `Set<number>` を受け取れる汎用実装で、`music.js` の `hasSolvableChordTones()` / `rootPositionCandidates()` も弦範囲を引数として受け取る汎用設計だった（いずれも改修不要）。一方 `ROOT_STRINGS` と `JUDGE_STRINGS` は `chordGame.js`・`arpeggioGame.js` それぞれで**独立に定義された別々の定数**で、値がたまたま `[0,1,2]` で一致していただけと判明。`hasSolvableChordTones()` はルートの物理弦位置を見ておらず、構成音のピッチクラスが判定弦域に存在するかだけを見ている
- **設計判断**: 上記調査を踏まえ、`ROOT_STRINGS` をユーザー設定の判定弦域と統合（同じ値を共有）。判定弦を変更するとルート音の出現弦も連動して変わる（「選んだ弦域だけで練習が完結する」体験を優先）
- **データモデル**: 判定弦域を「開始弦インデックス（0=6弦〜5=1弦）＋本数（3〜6）」で表現。`js/chordGame.js`・`js/arpeggioGame.js` はモジュールレベルの固定定数 `ROOT_STRINGS`/`JUDGE_STRINGS` を廃止し、コンストラクタ引数 `stringRange`（デフォルト `[0,1,2]`）を `this._stringRange` として保持。`_nextChord()`・`handleTap()`・マスク生成・`_pickRootPosition()`のフォールバックはすべて `this._stringRange` を参照する。**このデータモデル・可解性チェックは v1.11.1 でも無変更**
- **設定の持ち方（`js/app.js`）**: `judgeStringStart`/`judgeStringCount` のプレーンなモジュール変数（`hintEnabled`等と同じくlocalStorage永続化なし）。`computeStringRange()` で配列に変換し、`startChordPractice()`/`startChordArpeggio()` で `new ChordGame({..., stringRange})`/`new ArpeggioGame({..., stringRange})` のようにインスタンス生成時に渡す。**設定変更の反映タイミングは「次に練習をはじめたとき」**（既存の `hintEnabled` 等と同じ反映パターンで一貫性を持たせている。プレイ中の設定変更は現在のセッションには影響しない）
- **UIをv1.11.1でハンバーガーメニュー内ボタンから全画面デュアルスライダーへ変更**: v1.11.0では「3本/4本/5本/6本」＋「6弦〜1弦」の2段ボタンをハンバーガーメニュー内に実装したが、実際に触ると直感的にわかりにくいことが判明。発見モード・アルペジオモードの「練習をはじめる」タップ時に新設の全画面 `#screen-judge-strings`（「判定弦を選ぶ」画面）を経由するように変更し、そこにデュアルハンドルスライダーを配置した
  - **スライダー実装**: 2本の `<input type="range" min="0" max="5" step="1">`（`#judge-range-start`/`#judge-range-end`）を同一コンテナに重ねる定番の「デュアルレンジスライダー」方式。各rangeの track は透明化し、つまみ（`::-webkit-slider-thumb`/`::-moz-range-thumb`）のみ `pointer-events: auto` にすることで、track部分の誤操作でどちらのつまみが反応するか曖昧になる問題を回避。目盛りは6・5・4・3・2・1（`.judge-slider-ticks`）、選択範囲は `.judge-slider-fill`（`var(--accent)` のオレンジ、`input`イベントごとに`left`/`width`を%で再計算）で視覚化。ブレスト時の参考画像は赤い帯だったが、既存デザインとの統一感を優先しアクセントカラーに変更した
  - **最小本数制約**: `applyJudgeRange(movedSide)`（`js/app.js`）が、動かした側の反対側のつまみを「ギャップ2未満（＝3本未満）にならない」よう連動して押し出す。0〜5の6段階・最小ギャップ2という制約上、2つのつまみが重なる／すれ違う事態は構造的に発生しない
  - **画面遷移**: `openJudgeStringScreen(mode)` が `pendingPracticeMode`（`'chord'`|`'arpeggio'`）をセットしスライダーを現在値に同期して画面表示。「この設定で練習をはじめる」（`#btn-judge-confirm`）が `pendingPracticeMode` に応じて `startChordPractice()`/`startChordArpeggio()` を呼ぶ。**インターバル編には対応する「LV選択専用画面」が元々存在しない**（LV一覧はホーム画面内にインライン表示されているだけ）ため、新規に4画面目として追加し既存の `showScreen()` の仕組みに乗せた
  - ハンバーガーメニューの旧UI（`#judge-count-btns`・`#judge-start-btns`・関連イベントリスナー・`.wave-btn:disabled`のCSS）は削除済み
- **全数検証（v1.11.0時点）**: 有効な弦範囲10通り（本数3: 開始弦0-3の4通り、本数4: 0-2の3通り、本数5: 0-1の2通り、本数6: 0のみ）× 全12rootPc × 全ルート候補位置 × 全10コードタイプ（7200通り）で `hasSolvableChordTones()` を総当たりし、詰み0件を確認済み（3音組・4音組とも全弦範囲パターンで詰みゼロ、特に本数3の高音3弦パターンも含む）。v1.11.1はUIのみの変更でデータモデル・検証ロジックを一切変更していないため、この検証結果はそのまま有効
- **モック検証（v1.11.0時点）**: デフォルト（6〜4弦）・高音3弦（3〜1弦）・全弦（6本）の3パターンで `_nextChord()` を各2000回実行し、指定弦域内でのみ出現し詰みが発生しないことを確認済み
- **v1.11.1 コードレビュー結果**（`CODE_REVIEW_2026-07-06_ui-slider-v1.11.1.md`。総合判定: 問題なし・修正必須の指摘0件）: 判定弦カスタマイズ機能はデータモデル（v1.11.0）→UI改善（v1.11.1、全画面デュアルスライダー化）まで完了。ロジックファイル（`js/chordGame.js`・`js/arpeggioGame.js`・`js/music.js`・`js/game.js`）の無変更、最小幅制約の境界ロジック（`applyJudgeRange()`を移植し start×end 全36通り×movedSide 2通り＝72ケース総当たりで不正な状態0件）、`pointer-events`制御（つまみのみ有効・重なりは構造的に発生しない）、値↔`judgeStringStart`/`judgeStringCount`変換のオフバイワンなし、画面遷移・状態整合性（モード切替時の設定復元含む）、旧UI（`updateJudgeStringUI`・`judge-count-btns`・`judge-start-btns`等）の残骸ゼロ、ドキュメント整合性をすべて独立検証で確認済み
  - **NIT-1（軽微・実害なし・任意対応）**: `js/app.js`の `const screenJudgeStrings = document.getElementById('screen-judge-strings');` は宣言後どこからも参照されていないデッドコード（`showScreen()`はid文字列で`getElementById`するため）。他の画面DOM参照（`screenGame`等）との一貫性で置かれた可能性があり実害はない。次に`js/app.js`を触る機会があれば削除してよい程度

## 現在の状態（最終更新: 2026-07-07）

インターバル編 v1.4.3 完了・GitHub Pages 公開済み（従来の改善に加え、ハンバーガーメニュー表示バグの修正、詰まった時のヒント表示機能（LV.Max除く、ON/OFF切替可）を追加。ヒントドットは実機確認とフィードバックを経て半径 0.2→0.8→0.32、不透明度 0.7→0.5 に調整済み）。

コードトーン編〔発見モード〕v1.6.2 Stage 1 実装・実機確認済み・GitHub Pages 公開済み。コードタイプをメジャー/マイナートライアドから7th系を含む全10種類（maj, min, maj7, min7, dom7, dim7, m7b5, aug, sus2, sus4）に拡張。`music.js` に `hasSolvableChordTones()` を新設し、ルート×コードタイプの組み合わせ単位で出題可解性をチェックする仕組みを追加（Stage 0からの申し送り事項を解消）。実装前にNode上で実際のコードを使い全10種類の可解性を機械的に検証済み（「詰み」なし）。テンションは9th/b9のみ窓内到達可能・11th以上は物理的制約により今回スコープ外。詳細仕様は上記「コードトーン編〔発見モード〕Stage 1〜4」セクション参照。ルート音の可変化・テンション出題は将来ステージで再検討。

v1.6.1でコードトーン編の進捗表示を2行レイアウトに変更（`body.mode-chord` クラスでインターバル編と分岐）。v1.6.2で `hasSolvableChordTones()` のチェック範囲を `Game._hasValidAnswer` と完全に同型へ修正（別セッションのコードレビューで指摘。ルート固定のStage 1では実害なかったが、将来ルート可変化時にバグ化するため先行修正）。

コードトーン編〔アルペジオモード〕v1.7.0 Stage 2 実装・実機確認済み・GitHub Pages 公開済み。発見モードとは別の新規モードとして `js/arpeggioGame.js`（`ArpeggioGame`クラス）に分離実装。コードをストローク→アルペジオ（ランダム順）で聴き、聞こえた順番どおりにタップして再現する。判定はインターバル編と同型の「フェーズ管理」方式（未クリア集合方式ではない）。ホーム画面に3モード目として追加（インターバル編／コードトーン編〔発見〕／コードトーン編〔アルペジオ〕）。対象はルートC固定・低音3弦・トライアド（maj/min）のみ、7th系・テンションは対象外。発見モードは無変更、`hasSolvableChordTones()`をそのまま流用。

コードトーン編〔アルペジオモード〕v1.8.0 Stage 3 実装・実機相当のブラウザ確認済み・GitHub Pages 公開済み。アルペジオモードのルート音をインターバル編LV.4方式で12音フルランダム化（弦: 6/5/4弦、オクターブ: 0/1）。判定対象弦（低音3弦）・対象コードタイプ（トライアドmaj/minのみ）は変更していない。`music.js` に共有関数 `rootPositionCandidates()` を新設し、`hasSolvableChordTones()` の呼び出しを静的1回チェックから `Game._nextQuestion()` と同型の動的リトライへ変更。発見モード（`js/chordGame.js`）・インターバル編（`js/game.js`）は無変更で、両方への回帰がないことを確認済み。詳細仕様は上記「コードトーン編〔アルペジオモード〕Stage 2〜3」セクション参照。

v1.8.1（インフラのみ、アプリ本体は無変更）で GitHub Pages のデプロイ方式をレガシー方式から GitHub Actions ベース（`.github/workflows/deploy-pages.yml`）へ移行。レガシー方式が `gh run rerun` と相性が悪く queued で詰まる問題への対応。詳細は下記「GitHub Pages」セクション参照。

コードトーン編〔発見モード〕v1.9.0 Stage 4 実装・Node機械検証済み。アルペジオモードStage 3で実装・検証済みのルート可変化の仕組み（`music.js` の共有関数 `rootPositionCandidates()` ＋ 動的do-whileリトライ）を発見モードへ横展開し、ルート音を12音フルランダム化（弦: 6/5/4弦、オクターブ: 0/1）。判定対象弦（低音3弦）は固定のまま。ルート可変化の原因切り分けを容易にするため、対象コードタイプを一時的にトライアド（maj/min）のみへ絞り込み（`CHORD_TYPE_IDS = ['maj','min']`、7th系はコメントで残す）。`js/chordGame.js` のみ変更、`music.js`・`js/arpeggioGame.js`・`js/game.js` は無変更。Node上で `_nextChord()` を5000回呼び機械検証済み（詰みゼロ・全12音出現・6/5/4弦ほぼ均等・両オクターブ出現・maj/minのみ・マスク正常）。

コードトーン編〔発見モード〕v1.10.0 Stage 5 実装・Node機械検証済み。Stage 4のコードレビュー申し送り（F1）に対応し、`CHORD_TYPE_IDS` に7th系8種類（maj7, min7, dom7, dim7, m7b5, aug, sus2, sus4）を復帰、全10種類でのルート可変化に対応完了。実装前に全12 rootPc × 全ルート候補位置（6/5/4弦×0/1oct）× 全10種類の直積（540通り）で `hasSolvableChordTones()` を総当たり検証し、3音組（maj/min/sus2/sus4/aug）・4音組（maj7/min7/dom7/dim7/m7b5）とも詰みゼロを確認。加えて `ChordGame._nextChord()` をモック経由で5000回実行し、全12rootPc・6/5/4弦（ほぼ均等）・両オクターブ・全10種類が偏りなく出現し詰みゼロであることも確認。任意対応だったN1nit（`_pickRootPosition()` フォールバックのフレット探索上限を `0..12`→`0..11` に統一）も本ステージで反映。`js/chordGame.js` のみ変更、`music.js`・`js/arpeggioGame.js`・`js/game.js` は無変更。別セッションのコードレビュー（`CODE_REVIEW_2026-07-06_chordgame-stage5.md`）でも全数検証・モック検証の結果を独立に再現でき、修正必須の指摘0件（INFO-1〜3は将来テンション対応時の参考記録として上記セクションに反映済み）。詳細仕様は上記「コードトーン編〔発見モード〕Stage 1〜5」セクション参照。

コードトーン編（発見モード・アルペジオモード共通）v1.11.0 判定弦カスタマイズ機能 実装・実機相当のブラウザ確認済み。判定対象弦が低音3弦固定だった制約を解消し、ハンバーガーメニューから3〜6本の範囲で自由に設定できるようにした。実装前の調査で、`ROOT_STRINGS`と`JUDGE_STRINGS`が`chordGame.js`・`arpeggioGame.js`それぞれで独立に定義された別定数の偶然の一致だったと判明したため、`ROOT_STRINGS`をユーザー設定の判定弦域に統合（判定弦を変えるとルート出現弦も連動）。`js/fretboard.js`・`js/music.js`は事前調査で汎用実装済みと確認できたため無変更。全数検証（有効な弦範囲10通り×全12rootPc×全10コードタイプ、7200通り）・モック検証（3パターン×2000回）とも詰みゼロを確認。

コードトーン編（発見モード・アルペジオモード共通）v1.11.1 判定弦カスタマイズ機能のUI改善・実機相当のブラウザ確認済み。v1.11.0のハンバーガーメニュー内ボタンUIが直感的でなかったため、発見モード・アルペジオモードの「練習をはじめる」タップ時に新設の全画面「判定弦を選ぶ」画面（`#screen-judge-strings`）を経由し、目盛り6・5・4・3・2・1上のデュアルハンドルスライダーで判定弦域を選ぶ方式に変更。2本の`<input type="range">`を重ねる定番実装＋最小本数3の連動押し出しロジックを`js/app.js`に実装。`judgeStringStart`/`judgeStringCount`・`computeStringRange()`・`js/chordGame.js`/`js/arpeggioGame.js`の`stringRange`・`js/music.js`の可解性チェックはv1.11.0のまま完全に無変更（UIの作り直しのみ）。ハンバーガーメニューの旧ボタンUIは削除。詳細仕様は上記「判定弦カスタマイズ機能」セクション参照。

2026-07-07、長年の申し送りだった「オクターブ無視ルールとテンション判定の整合性」を調査。結論：発見モード・アルペジオモードともテンション判定ロジック自体が未実装（`CHORD_TYPES.tensions`は定義のみで`chordGame.js`/`arpeggioGame.js`のどちらからも未参照）で、現行コードは矛盾なく方針通りに動いている。方針も確定：インターバル編（基準音からの距離を問う）とコードトーン編（鳴っているコードの中でどの音を弾くかを問う）は問うべき問いが別物であり、コードトーン編はオクターブ無視のままで正しい設計。コード修正は不要と判断し、`music.js`に設計意図のコメントを追記した。詳細は上記「発見モード」「アルペジオモード」各セクションの該当項目を参照。

コードトーン編〔発見モード〕v1.12.0 Stage 6 実装・Node機械検証済み。上記の方針確認を受け、`CHORD_TYPES.tensions`に定義済みの全テンション（9th・b9・#9・11th・#11th・13th・b13）を基本構成音とあわせて毎回まとめて出題する機能を追加。`music.js`に新規関数`extendedChordTones(type)`を追加し、基本構成音とテンションを統合してピッチクラス重複を除去した拡張構成音セットを生成（`hasSolvableChordTones()`は`(rootPc + semitone) % 12`を内部で計算する既存実装のまま無変更で対応、`chordGame.js`の`handleTap()`/`_emitProgress()`/`_playChord()`も`_chordTones`配列に対する汎用ロジックのため無変更。変更は`_nextChord()`内の2箇所のみ）。sus2は基本構成音2ndとテンション9thのピッチクラスが一致する唯一のケースで、重複除去により実質R・2nd・5thの3音のまま出題（9thは2ndに吸収）。拡張後の実質音数はコードタイプにより3〜10音（sus2最少・dom7最多）。全数検証（有効な弦範囲10通り×全12rootPc×全ルート候補位置×全10コードタイプ、7200通り）・モック検証（`_nextChord()`5000回）とも詰みゼロを確認。アルペジオモード（`js/arpeggioGame.js`）・インターバル編（`js/game.js`）は今回のスコープ外につき無変更。実機（ブラウザ）でdom7（10音）・dim7（5音）を実際にタップして完走・自動遷移することも確認済み。別セッションのコードレビュー（`CODE_REVIEW_2026-07-07_chordgame-tensions-stage6.md`）で修正不要と結論。F1（dom7の10音同時発音による音量クリッピングの可能性）は実機確認で気にならなかったため今回は対応を見送り、将来さらに同時発音数が増える変更を行う際に`js/audio.js`の`playChord()`への音量正規化・コンプレッサー導入を再検討する申し送りとした。詳細仕様は上記「コードトーン編〔発見モード〕Stage 1〜6」セクションの「Stage 6」項目参照。

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
