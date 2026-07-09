import { INTERVAL_LEVELS, PRACTICE_LEVEL, STRING_COUNT } from './music.js';
import { AudioEngine }  from './audio.js';
import { Fretboard }    from './fretboard.js';
import { FeedbackFx }   from './feedbackFx.js';
import { Game }         from './game.js';
import { ChordGame }    from './chordGame.js';
import { ArpeggioGame } from './arpeggioGame.js';

// ── 状態 ──────────────────────────────────────────────────
let currentGame         = null;
let currentLevel        = null;
let excludeOpenStrings  = false;
let hintEnabled         = true;
// コードトーン編（発見・アルペジオ共通）の判定弦域。0=6弦〜5=1弦。ルート出現弦も同じ値を共有する
let judgeStringStart    = 0;
let judgeStringCount    = 3;
// コードトーン編（発見・アルペジオ共通）の出題コード範囲設定（v1.15.0）。
// chordTypeRangeAll: false=トライアドのみ（maj/min）/ true=全10種類
// tensionEnabled: テンション出題の有無（発見モードのみ意味を持つ。アルペジオは常にテンションなし）
let chordTypeRangeAll   = true;
let tensionEnabled      = true;
// 判定弦選択画面から「この設定で練習をはじめる」を押した時にどちらのモードを開始するか
let pendingPracticeMode = null; // 'chord' | 'arpeggio'
const audio             = new AudioEngine();

// 「開始弦インデックス, 本数」→ 判定弦域の配列（例: 0,3 → [0,1,2]）
function computeStringRange() {
  return Array.from({ length: judgeStringCount }, (_, i) => judgeStringStart + i);
}

const STRING_LABELS = ['6弦', '5弦', '4弦', '3弦', '2弦', '1弦'];
const MAX_STRING_INDEX = STRING_COUNT - 1; // 5
const MIN_JUDGE_GAP    = 2; // 最小本数3（終了インデックス - 開始インデックス >= 2）

// ── DOM参照 ───────────────────────────────────────────────
// ── ホーム画面 ──
const screenHome   = document.getElementById('screen-home');
const btnInterval  = document.getElementById('btn-interval');
const btnChord     = document.getElementById('btn-chord');
const btnChordArpeggio = document.getElementById('btn-chord-arpeggio');
const intervalSection = document.getElementById('interval-section');
const chordSection    = document.getElementById('chord-section');
const arpeggioSection = document.getElementById('arpeggio-section');
const lvList       = document.getElementById('lv-list');
const btnPractice  = document.getElementById('btn-practice');
const btnChordPractice = document.getElementById('btn-chord-practice');
const btnChordArpeggioPractice = document.getElementById('btn-chord-arpeggio-practice');

// ── 判定弦選択画面 ──
const screenJudgeStrings = document.getElementById('screen-judge-strings');
const btnJudgeBack     = document.getElementById('btn-judge-back');
const btnJudgeConfirm  = document.getElementById('btn-judge-confirm');
const judgeRangeStart  = document.getElementById('judge-range-start');
const judgeRangeEnd    = document.getElementById('judge-range-end');
const judgeSliderFill  = document.getElementById('judge-slider-fill');
const elJudgeStringSummary = document.getElementById('judge-string-summary');
const chordPresetBtns  = document.querySelectorAll('#chord-preset-btns .wave-btn');
const tensionToggleRow = document.getElementById('tension-toggle-row');
const btnTension       = document.getElementById('btn-tension');

// ── ゲーム画面 ──
const screenGame   = document.getElementById('screen-game');
const elQNum       = document.getElementById('q-num');
const elTimer      = document.getElementById('timer');
const elIntervalName = document.getElementById('interval-name');
const elRootName   = document.getElementById('root-name');
const btnReplay    = document.getElementById('btn-replay');
const btnHomeGame  = document.getElementById('btn-home-game');
const canvas       = document.getElementById('fretboard-canvas');

// ── リザルト画面 ──
const screenResult = document.getElementById('screen-result');
const elResTitle   = document.getElementById('result-title');
const elResScore   = document.getElementById('res-score');
const elResTime    = document.getElementById('res-time');
const elRanking    = document.getElementById('ranking-list');
const btnRetry     = document.getElementById('btn-retry');
const btnHomeRes   = document.getElementById('btn-home-result');

// ── ハンバーガーメニュー ──
const btnMenu      = document.getElementById('btn-menu');
const menuPanel    = document.getElementById('menu-panel');
const btnMenuClose = document.getElementById('btn-menu-close');
const sliderVol    = document.getElementById('slider-volume');
const waveButtons  = document.querySelectorAll('#waveform-btns .wave-btn');

// ── 指板 ──────────────────────────────────────────────────
const fretboard = new Fretboard(canvas);

// ── 正解・不正解フィードバック演出（音＋画面演出、v1.16.0）────────
const fxOverlay = document.getElementById('fx-overlay');
const fxSymbol  = document.getElementById('fx-symbol');
const feedbackFx = new FeedbackFx(fxOverlay, fxSymbol);

function onCorrectFx() { feedbackFx.showCorrect(); audio.playCorrectChime(); }
function onWrongFx()   { feedbackFx.showWrong();   audio.playWrongBuzz(); }

// ── 画面遷移 ──────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── ホーム画面初期化 ──────────────────────────────────────
function buildLvList() {
  lvList.replaceChildren();
  INTERVAL_LEVELS.forEach(lv => {
    const row = document.createElement('li');
    row.className = 'lv-row';

    const btn = document.createElement('button');
    btn.className   = 'lv-btn';
    btn.textContent = lv.label;
    btn.dataset.lvId = lv.id;
    btn.addEventListener('click', () => startGame(lv));

    const rankBtn = document.createElement('button');
    rankBtn.className   = 'lv-rank-btn';
    rankBtn.textContent  = '\u{1F3C6}';
    rankBtn.setAttribute('aria-label', `${lv.label} のランキングを見る`);
    rankBtn.addEventListener('click', () => showRanking(lv));

    row.appendChild(btn);
    row.appendChild(rankBtn);
    lvList.appendChild(row);
  });
}

// ── ゲーム開始 ────────────────────────────────────────────
function startGame(level) {
  currentLevel = level;
  currentGame?.stop();

  // ハンバーガーメニューを開いたままLVを選ぶと画面が隠れるため、ゲーム開始前に閉じる
  menuPanel.classList.remove('open');

  // 先に表示してからレイアウト確定を待つ（display:none 中は clientWidth/Height が 0）
  showScreen('screen-game');

  // コードトーン編から戻ってきた場合に備え、2行レイアウト用クラスを解除
  document.body.classList.remove('mode-chord');

  elTimer.classList.remove('hidden');
  elTimer.textContent = '0.0';
  elQNum.textContent  = level.id === 'practice' ? '練習' : '1 / 10';

  requestAnimationFrame(() => {
    fretboard.resize();

    currentGame = new Game({
      level,
      audio,
      fretboard,
      excludeOpenStrings,
      hintEnabled,
      onQuestion({ qNum, total, intervalName, rootName, phase }) {
        if (phase === 'root') {
          // ルートフェーズ: ノート名を大きく、ガイドを小さく
          elIntervalName.textContent = rootName || 'Root';
          elRootName.textContent     = '① Root をタップ';
        } else {
          // 度数フェーズ: 度数名を大きく
          elIntervalName.textContent = intervalName;
          elRootName.textContent     = '② 度数音をタップ';
        }
        if (qNum !== null) elQNum.textContent = `${qNum} / ${total}`;
      },
      onCorrect: onCorrectFx,
      onWrong:   onWrongFx,
      onComplete(results) {
        showResult(results);
      },
    });

    currentGame.start();
    startTimerDisplay();
  });
}

// ── コードトーン編 練習開始（Stage 4: ルート12音ランダム・低音3弦・トライアドmaj/minのみ）──
function startChordPractice() {
  currentGame?.stop();

  menuPanel.classList.remove('open');
  showScreen('screen-game');

  // コード名・進捗テキストを2行表示にするレイアウト用クラス（インターバル編には適用しない）
  document.body.classList.add('mode-chord');

  // Stage 1 はタイマーなし仕様のため、フッターのストップウォッチ表示は隠す
  elTimer.classList.add('hidden');
  elQNum.textContent = '練習';

  requestAnimationFrame(() => {
    fretboard.resize();

    currentGame = new ChordGame({
      audio,
      fretboard,
      stringRange: computeStringRange(),
      chordTypeRangeAll,
      tensionEnabled,
      onProgress({ chordName, progressText }) {
        elIntervalName.textContent = chordName;
        elRootName.textContent     = progressText;
      },
      onCorrect: onCorrectFx,
      onWrong:   onWrongFx,
    });

    currentGame.start();
  });
}

// ── コードトーン編 アルペジオモード開始（Stage 3: Root12音ランダム・低音3弦・トライアドのみ）──
function startChordArpeggio() {
  currentGame?.stop();

  menuPanel.classList.remove('open');
  showScreen('screen-game');

  // 発見モードと同じ2行レイアウト用クラスを流用
  document.body.classList.add('mode-chord');

  // 練習モードのみ・タイマーなし仕様のため、フッターのストップウォッチ表示は隠す
  elTimer.classList.add('hidden');
  elQNum.textContent = '練習';

  requestAnimationFrame(() => {
    fretboard.resize();

    currentGame = new ArpeggioGame({
      audio,
      fretboard,
      hintEnabled,
      stringRange: computeStringRange(),
      chordTypeRangeAll,
      onProgress({ chordName, progressText }) {
        elIntervalName.textContent = chordName;
        elRootName.textContent     = progressText;
      },
      onCorrect: onCorrectFx,
      onWrong:   onWrongFx,
    });

    currentGame.start();
  });
}

// ── タイマー表示（ゲーム画面用、秒単位で更新）─────────────────
let _timerRAF = null;
function startTimerDisplay() {
  cancelAnimationFrame(_timerRAF);
  const start = performance.now();
  function tick() {
    const elapsed = (performance.now() - start) / 1000;
    elTimer.textContent = elapsed.toFixed(1);
    _timerRAF = requestAnimationFrame(tick);
  }
  _timerRAF = requestAnimationFrame(tick);
}
function stopTimerDisplay() {
  cancelAnimationFrame(_timerRAF);
}

// ── リザルト表示 ───────────────────────────────────────────
function showResult(results) {
  stopTimerDisplay();
  const { correct, total, totalTime, levelId } = results;

  elResTitle.textContent = '結果';
  elResScore.classList.remove('hidden');
  elResTime.classList.remove('hidden');
  btnRetry.textContent = 'もう一度';

  elResScore.textContent = `${correct} / ${total} 正解`;
  elResTime.textContent  = `タイム: ${totalTime.toFixed(1)}秒`;

  if (levelId !== 'practice') {
    saveScore(levelId, totalTime);
    renderRanking(levelId);
  } else {
    elRanking.replaceChildren();
  }

  showScreen('screen-result');
}

// ── ランキングのみ表示（プレイせずホームから閲覧）─────────────
function showRanking(level) {
  currentLevel = level;

  elResTitle.textContent = 'ランキング';
  elResScore.classList.add('hidden');
  elResTime.classList.add('hidden');
  btnRetry.textContent = 'プレイする';

  renderRanking(level.id);
  showScreen('screen-result');
}

// ── スコア永続化（localStorage）────────────────────────────
const MAX_RECORDS = 20;

function scoreKey(levelId) {
  return `score_interval_${levelId}`;
}

// iOS Safari プライベートブラウズでは parse / setItem が例外を投げるためガードする
function loadScores(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveScore(levelId, time) {
  try {
    const key    = scoreKey(levelId);
    const scores = loadScores(key);
    scores.push(time);
    scores.sort((a, b) => a - b);
    if (scores.length > MAX_RECORDS) scores.splice(MAX_RECORDS);
    localStorage.setItem(key, JSON.stringify(scores));
  } catch {
    // QuotaExceededError 等: ランキング保存を諦めるだけで画面は継続
  }
}

function renderRanking(levelId) {
  const scores = loadScores(scoreKey(levelId));
  elRanking.replaceChildren();
  if (scores.length === 0) {
    const li = document.createElement('li');
    li.textContent = '記録なし';
    elRanking.appendChild(li);
    return;
  }
  scores.forEach((t, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${t.toFixed(1)}秒`;
    elRanking.appendChild(li);
  });
}

// ── イベントリスナー ───────────────────────────────────────

// モード選択（インターバル編 ⇄ コードトーン編〔発見モード〕⇄ コードトーン編〔アルペジオモード〕）
function selectMode(mode) {
  btnInterval.classList.toggle('active-mode', mode === 'interval');
  btnChord.classList.toggle('active-mode', mode === 'chord');
  btnChordArpeggio.classList.toggle('active-mode', mode === 'arpeggio');
  intervalSection.classList.toggle('hidden', mode !== 'interval');
  chordSection.classList.toggle('hidden', mode !== 'chord');
  arpeggioSection.classList.toggle('hidden', mode !== 'arpeggio');
}
btnInterval.addEventListener('click', () => selectMode('interval'));
btnChord.addEventListener('click', () => selectMode('chord'));
btnChordArpeggio.addEventListener('click', () => selectMode('arpeggio'));

btnPractice.addEventListener('click', () => startGame(PRACTICE_LEVEL));
btnChordPractice.addEventListener('click', () => openJudgeStringScreen('chord'));
btnChordArpeggioPractice.addEventListener('click', () => openJudgeStringScreen('arpeggio'));

btnReplay.addEventListener('click', () => currentGame?.replay());

btnHomeGame.addEventListener('click', () => {
  currentGame?.stop();
  stopTimerDisplay();
  showScreen('screen-home');
});

btnRetry.addEventListener('click', () => {
  if (currentLevel) startGame(currentLevel);
});

btnHomeRes.addEventListener('click', () => showScreen('screen-home'));

// ハンバーガーメニュー
btnMenu.addEventListener('click', () => menuPanel.classList.toggle('open'));
btnMenuClose.addEventListener('click', () => menuPanel.classList.remove('open'));

sliderVol.addEventListener('input', (e) => {
  audio.setVolume(Number(e.target.value));
});

waveButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    waveButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    audio.setWaveType(btn.dataset.wave);
  });
});

// コードトーン編：判定弦域（開始弦＋本数）。デュアルレンジスライダーで選択する
// （発見モード・アルペジオモード共通、「練習をはじめる」の直前に専用画面で設定する）
function openJudgeStringScreen(mode) {
  pendingPracticeMode = mode;
  menuPanel.classList.remove('open');
  syncJudgeSliderUI();
  syncChordSettingsUI();
  // テンションはアルペジオモード非対応のため、発見モード時のみトグル行を表示する
  tensionToggleRow.classList.toggle('hidden', mode === 'arpeggio');
  showScreen('screen-judge-strings');
}

// 現在の chordTypeRangeAll/tensionEnabled をプリセットボタン・トグルの表示に反映する。
// 一致するプリセットがない組み合わせ（例: トライアドのみ+テンションON）は全ボタン非activeの
// 「カスタム」状態になる（.wave-btnの「一致するボタンにだけactive」パターンを流用）
function syncChordSettingsUI() {
  btnTension.dataset.enabled = String(tensionEnabled);
  btnTension.textContent = tensionEnabled ? 'ON' : 'OFF';

  chordPresetBtns.forEach(btn => {
    const matches = (btn.dataset.range === String(chordTypeRangeAll)) &&
                    (btn.dataset.tension === String(tensionEnabled));
    btn.classList.toggle('active', matches);
  });
}

// 現在の judgeStringStart/judgeStringCount をスライダーのつまみ位置に反映する
function syncJudgeSliderUI() {
  judgeRangeStart.value = String(judgeStringStart);
  judgeRangeEnd.value   = String(judgeStringStart + judgeStringCount - 1);
  updateJudgeSliderVisual();
}

// fillバーの位置・幅と要約テキストを再描画する
function updateJudgeSliderVisual() {
  const endIdx = judgeStringStart + judgeStringCount - 1;
  const leftPct  = (judgeStringStart / MAX_STRING_INDEX) * 100;
  const rightPct = (endIdx / MAX_STRING_INDEX) * 100;
  judgeSliderFill.style.left  = `${leftPct}%`;
  judgeSliderFill.style.width = `${rightPct - leftPct}%`;
  elJudgeStringSummary.textContent =
    `${STRING_LABELS[judgeStringStart]}〜${STRING_LABELS[endIdx]}（${judgeStringCount}本）を使用`;
}

// 2つのつまみの間に最小ギャップ（3本分）を保ちつつ、動かした側に応じてもう片方を押し出す
function applyJudgeRange(movedSide) {
  let startVal = Number(judgeRangeStart.value);
  let endVal   = Number(judgeRangeEnd.value);

  if (endVal - startVal < MIN_JUDGE_GAP) {
    if (movedSide === 'start') {
      endVal = startVal + MIN_JUDGE_GAP;
      if (endVal > MAX_STRING_INDEX) {
        endVal   = MAX_STRING_INDEX;
        startVal = endVal - MIN_JUDGE_GAP;
      }
    } else {
      startVal = endVal - MIN_JUDGE_GAP;
      if (startVal < 0) {
        startVal = 0;
        endVal   = startVal + MIN_JUDGE_GAP;
      }
    }
    judgeRangeStart.value = String(startVal);
    judgeRangeEnd.value   = String(endVal);
  }

  judgeStringStart = startVal;
  judgeStringCount = endVal - startVal + 1;
  updateJudgeSliderVisual();
}

judgeRangeStart.addEventListener('input', () => applyJudgeRange('start'));
judgeRangeEnd.addEventListener('input',   () => applyJudgeRange('end'));

// 出題コード範囲プリセットボタン: data-range/data-tensionから2軸を一括セットする
chordPresetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    chordTypeRangeAll = btn.dataset.range === 'true';
    tensionEnabled    = btn.dataset.tension === 'true';
    syncChordSettingsUI();
  });
});

// テンションON/OFFトグル: 手動操作でプリセットと不一致になれば syncChordSettingsUI() が
// 自動的に全ボタン非active（カスタム状態）にする
btnTension.addEventListener('click', () => {
  tensionEnabled = !tensionEnabled;
  syncChordSettingsUI();
});

btnJudgeBack.addEventListener('click', () => showScreen('screen-home'));
btnJudgeConfirm.addEventListener('click', () => {
  if (pendingPracticeMode === 'chord') startChordPractice();
  else if (pendingPracticeMode === 'arpeggio') startChordArpeggio();
});

// 開放弦除外トグル
const btnOpenString = document.getElementById('btn-open-string');
btnOpenString.addEventListener('click', () => {
  excludeOpenStrings = !excludeOpenStrings;
  btnOpenString.dataset.excluded = String(excludeOpenStrings);
  btnOpenString.textContent = excludeOpenStrings ? '除外' : '含む';
});

// ヒント表示トグル（デフォルトON。LV.Maxでは常に無効）
const btnHint = document.getElementById('btn-hint');
btnHint.addEventListener('click', () => {
  hintEnabled = !hintEnabled;
  btnHint.dataset.enabled = String(hintEnabled);
  btnHint.textContent = hintEnabled ? 'ON' : 'OFF';
});

// ── 縦持ちオーバーレイ ──────────────────────────────────────
const portraitOverlay = document.getElementById('portrait-overlay');

function updatePortraitOverlay() {
  const isPortrait = window.innerHeight > window.innerWidth;
  portraitOverlay.classList.toggle('hidden', !isPortrait);
}

// リサイズ・回転時: オーバーレイ更新 + Canvas 再描画
window.addEventListener('resize', () => {
  updatePortraitOverlay();
  if (screenGame.classList.contains('active')) fretboard.resize();
});

window.addEventListener('orientationchange', () => {
  // ビューポートが確定してから実行
  setTimeout(() => {
    updatePortraitOverlay();
    if (screenGame.classList.contains('active')) fretboard.resize();
  }, 100);
});

// ── 初期化 ────────────────────────────────────────────────
(function init() {
  buildLvList();
  showScreen('screen-home');
  document.querySelector('.wave-btn[data-wave="square"]')?.classList.add('active');
  syncJudgeSliderUI();
  // PWAとしてホーム画面に追加済みの場合は横向きをロック
  screen.orientation?.lock?.('landscape').catch(() => {});
  // 初期向き判定
  updatePortraitOverlay();
})();
