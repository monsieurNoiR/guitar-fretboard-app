import { INTERVAL_LEVELS, PRACTICE_LEVEL, STRING_COUNT } from './music.js';
import { AudioEngine }  from './audio.js';
import { Fretboard }    from './fretboard.js';
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
const audio             = new AudioEngine();

// 「開始弦インデックス, 本数」→ 判定弦域の配列（例: 0,3 → [0,1,2]）
function computeStringRange() {
  return Array.from({ length: judgeStringCount }, (_, i) => judgeStringStart + i);
}

const STRING_LABELS = ['6弦', '5弦', '4弦', '3弦', '2弦', '1弦'];

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
const judgeCountBtns = document.querySelectorAll('#judge-count-btns .wave-btn');
const judgeStartBtns = document.querySelectorAll('#judge-start-btns .wave-btn');
const elJudgeStringSummary = document.getElementById('judge-string-summary');

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
      onProgress({ chordName, progressText }) {
        elIntervalName.textContent = chordName;
        elRootName.textContent     = progressText;
      },
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
      onProgress({ chordName, progressText }) {
        elIntervalName.textContent = chordName;
        elRootName.textContent     = progressText;
      },
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
btnChordPractice.addEventListener('click', startChordPractice);
btnChordArpeggioPractice.addEventListener('click', startChordArpeggio);

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

// コードトーン編：判定弦域（開始弦＋本数）。設定変更は次に「練習をはじめる」を
// 押した時点で反映される（hintEnabled等、既存の設定項目と同じ反映タイミング）
function updateJudgeStringUI() {
  judgeCountBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.count) === judgeStringCount));
  judgeStartBtns.forEach(b => {
    const start = Number(b.dataset.start);
    const valid = start + judgeStringCount <= STRING_COUNT;
    b.disabled = !valid;
    b.classList.toggle('active', valid && start === judgeStringStart);
  });
  const endLabel = STRING_LABELS[judgeStringStart + judgeStringCount - 1];
  elJudgeStringSummary.textContent = `${STRING_LABELS[judgeStringStart]}〜${endLabel}`;
}

judgeCountBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    judgeStringCount = Number(btn.dataset.count);
    // 本数変更で現在の開始弦が無効になった場合、選べる最大の開始弦に丸める
    if (judgeStringStart + judgeStringCount > STRING_COUNT) {
      judgeStringStart = STRING_COUNT - judgeStringCount;
    }
    updateJudgeStringUI();
  });
});

judgeStartBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    judgeStringStart = Number(btn.dataset.start);
    updateJudgeStringUI();
  });
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
  updateJudgeStringUI();
  // PWAとしてホーム画面に追加済みの場合は横向きをロック
  screen.orientation?.lock?.('landscape').catch(() => {});
  // 初期向き判定
  updatePortraitOverlay();
})();
