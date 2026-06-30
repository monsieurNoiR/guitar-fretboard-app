import { INTERVAL_LEVELS, PRACTICE_LEVEL } from './music.js';
import { AudioEngine }  from './audio.js';
import { Fretboard }    from './fretboard.js';
import { Game }         from './game.js';

// ── 状態 ──────────────────────────────────────────────────
let currentGame         = null;
let currentLevel        = null;
let excludeOpenStrings  = false;
const audio             = new AudioEngine();

// ── DOM参照 ───────────────────────────────────────────────
// ── ホーム画面 ──
const screenHome   = document.getElementById('screen-home');
const btnInterval  = document.getElementById('btn-interval');
const btnChord     = document.getElementById('btn-chord');
const lvList       = document.getElementById('lv-list');
const btnPractice  = document.getElementById('btn-practice');

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
const waveButtons  = document.querySelectorAll('.wave-btn');

// ── 指板 ──────────────────────────────────────────────────
const fretboard = new Fretboard(canvas);

// ── 画面遷移 ──────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── ホーム画面初期化 ──────────────────────────────────────
function buildLvList() {
  lvList.replaceChildren();
  INTERVAL_LEVELS.forEach(lv => {
    const btn = document.createElement('button');
    btn.className   = 'lv-btn';
    btn.textContent = lv.label;
    btn.dataset.lvId = lv.id;
    btn.addEventListener('click', () => startGame(lv));
    lvList.appendChild(btn);
  });
}

// ── ゲーム開始 ────────────────────────────────────────────
function startGame(level) {
  currentLevel = level;
  currentGame?.stop();

  // 先に表示してからレイアウト確定を待つ（display:none 中は clientWidth/Height が 0）
  showScreen('screen-game');

  elTimer.textContent = '0.0';
  elQNum.textContent  = level.id === 'practice' ? '練習' : '1 / 10';

  requestAnimationFrame(() => {
    fretboard.resize();

    currentGame = new Game({
      level,
      audio,
      fretboard,
      excludeOpenStrings,
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
      onCorrect() {},
      onWrong() {},
      onComplete(results) {
        showResult(results);
      },
    });

    currentGame.start();
    startTimerDisplay();
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

// ── スコア永続化（localStorage）────────────────────────────
const MAX_RECORDS = 20;

function scoreKey(levelId) {
  return `score_interval_${levelId}`;
}

function saveScore(levelId, time) {
  const key    = scoreKey(levelId);
  const scores = JSON.parse(localStorage.getItem(key) || '[]');
  scores.push(time);
  scores.sort((a, b) => a - b);
  if (scores.length > MAX_RECORDS) scores.splice(MAX_RECORDS);
  localStorage.setItem(key, JSON.stringify(scores));
}

function renderRanking(levelId) {
  const key    = scoreKey(levelId);
  const scores = JSON.parse(localStorage.getItem(key) || '[]');
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

// モード選択（v1はインターバル編のみ）
btnInterval.addEventListener('click', () => {
  lvList.parentElement.classList.remove('hidden');
});
btnChord.addEventListener('click', () => {
  // コードトーン編はv1では準備中表示
  alert('コードトーン編は準備中です。');
});

btnPractice.addEventListener('click', () => startGame(PRACTICE_LEVEL));

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

// 開放弦除外トグル
const btnOpenString = document.getElementById('btn-open-string');
btnOpenString.addEventListener('click', () => {
  excludeOpenStrings = !excludeOpenStrings;
  btnOpenString.dataset.excluded = String(excludeOpenStrings);
  btnOpenString.textContent = excludeOpenStrings ? '除外' : '含む';
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
  // PWAとしてホーム画面に追加済みの場合は横向きをロック
  screen.orientation?.lock?.('landscape').catch(() => {});
  // 初期向き判定
  updatePortraitOverlay();
})();
