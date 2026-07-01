import { STRING_COUNT, MAX_FRET, getPitchClass, getMidi } from './music.js';

const POSITION_MARKS = new Set([3, 5, 7, 9, 12, 15, 17]);
const DOUBLE_MARKS   = new Set([12]);

// 弦の太さ（6弦=太い, 1弦=細い）px
const STRING_WIDTHS = [3.5, 3.0, 2.5, 2.0, 1.5, 1.0];

// カラー定数
const COLOR = {
  bg:          '#1a1a1a',
  fret:        '#555',
  nut:         '#aaa',
  string:      '#c8a96e',
  posMark:     'rgba(255,255,255,0.18)',
  maskStr:     'rgba(0,0,0,0.78)',
  activeStr:   'rgba(232,150,58,0.08)',
  correct:     '#4caf50',
  wrong:       '#f44336',
  root:        '#ff9800',
  tapHint:     'rgba(255,255,255,0.12)',
  hint:        'rgba(255,255,255,0.5)',
};

export class Fretboard {
  constructor(canvas) {
    this._canvas  = canvas;
    this._ctx     = canvas.getContext('2d');
    this._tapCb        = null;
    this._feedback     = null; // { stringIdx, fret, isCorrect }
    this._confirmedRoot = null; // ユーザーが正解タップしたルート音位置

    // 現在の表示状態
    this._displayRange  = { start: 0, end: 5 };
    this._maskStrings   = new Set();   // 半透明マスクを掛ける弦インデックス集合
    this._rootInfo      = null;        // { stringIdx, fret } ルート音表示用

    // ヒント（詰まった時にフェードイン表示する候補ポジション）
    this._hintPositions = [];
    this._hintAlpha     = 0;
    this._hintRAF       = null;

    this._bindEvents();
  }

  // ── 公開API ──────────────────────────────────────────────

  draw({ displayRange, maskStrings = new Set(), rootInfo = null } = {}) {
    if (displayRange) this._displayRange = displayRange;
    if (maskStrings)  this._maskStrings  = maskStrings;
    this._rootInfo = rootInfo;
    this._render();
  }

  onTap(callback) {
    this._tapCb = callback;
  }

  showFeedback(stringIdx, fret, isCorrect) {
    this._feedback = { stringIdx, fret, isCorrect };
    this._render();
  }

  clearFeedback() {
    this._feedback = null;
    this._render();
  }

  setConfirmedRoot(stringIdx, fret) {
    this._confirmedRoot = { stringIdx, fret };
    this._render();
  }

  clearConfirmedRoot() {
    this._confirmedRoot = null;
    this._render();
  }

  // ヒント表示（フェードイン）。positions: [{ stringIdx, fret }, ...]
  showHints(positions) {
    cancelAnimationFrame(this._hintRAF);
    this._hintPositions = positions;
    this._hintAlpha     = 0;
    const DURATION = 400;
    const start = performance.now();
    const step = () => {
      this._hintAlpha = Math.min(1, (performance.now() - start) / DURATION);
      this._render();
      this._hintRAF = this._hintAlpha < 1 ? requestAnimationFrame(step) : null;
    };
    this._hintRAF = requestAnimationFrame(step);
  }

  clearHints() {
    cancelAnimationFrame(this._hintRAF);
    this._hintRAF       = null;
    this._hintPositions = [];
    this._hintAlpha     = 0;
    this._render();
  }

  resize() {
    this._canvas.width  = this._canvas.clientWidth  * devicePixelRatio;
    this._canvas.height = this._canvas.clientHeight * devicePixelRatio;
    this._render();
  }

  // ── 内部描画 ──────────────────────────────────────────────

  _render() {
    const canvas = this._canvas;
    const ctx    = this._ctx;
    const W      = canvas.width;
    const H      = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, W, H);

    const layout = this._calcLayout(W, H);

    this._drawLayer1(ctx, layout, W, H);   // 背景レイヤー
    this._drawLayer2(ctx, layout);          // 判定レイヤー（マスク・フィードバック）
  }

  _calcLayout(W, H) {
    const { start, end } = this._displayRange;
    const fretCount = end - start + 1;

    // start=0 のとき、ナット左側に開放弦ゾーンを確保
    const BASE_LEFT = W * 0.04;               // 弦の描画開始X（常に一定）
    const OPEN_ZONE = (start === 0) ? W * 0.065 : 0; // 開放弦ゾーン幅
    const PAD_LEFT  = BASE_LEFT + OPEN_ZONE;  // ナット（fretX(0)）のX位置

    const PAD_RIGHT = W * 0.03;
    const PAD_TOP   = H * 0.10;
    const PAD_BOT   = H * 0.10;

    const boardW = W - PAD_LEFT - PAD_RIGHT;
    const boardH = H - PAD_TOP  - PAD_BOT;

    const fretStep = boardW / fretCount;
    const strStep  = boardH / (STRING_COUNT - 1);

    const fretX = (f) => PAD_LEFT + (f - start) * fretStep;
    const strY  = (s) => PAD_TOP + (STRING_COUNT - 1 - s) * strStep;

    return { BASE_LEFT, OPEN_ZONE, PAD_LEFT, PAD_RIGHT, PAD_TOP, PAD_BOT,
             boardW, boardH, fretStep, strStep, fretX, strY, start, end };
  }

  _drawLayer1(ctx, layout, W, H) {
    const { BASE_LEFT, OPEN_ZONE, PAD_LEFT, PAD_TOP, boardW, boardH,
            fretStep, strStep, fretX, strY, start, end } = layout;

    // ─ 判定対象弦のハイライト帯（マスクとのコントラストを上げるため先に敷く）─
    if (this._maskStrings.size > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, PAD_TOP, W, boardH);
      ctx.clip();
      for (let s = 0; s < STRING_COUNT; s++) {
        if (this._maskStrings.has(s)) continue;
        ctx.fillStyle = COLOR.activeStr;
        ctx.fillRect(0, strY(s) - strStep / 2, W, strStep);
      }
      ctx.restore();
    }

    // ─ ポジションマーク（フレット間に丸）─
    // ゾーンfの中心は fretX(f)-fretStep/2。表示ゾーンは start+1〜end+1
    for (let f = start + 1; f <= end + 1; f++) {
      if (!POSITION_MARKS.has(f)) continue;
      const cx  = fretX(f) - fretStep / 2;
      const r   = Math.min(fretStep, strStep) * 0.18;
      ctx.fillStyle = COLOR.posMark;
      if (DOUBLE_MARKS.has(f)) {
        // 12Fは上下2つ
        const y1 = strY(1);
        const y2 = strY(STRING_COUNT - 2);
        ctx.beginPath(); ctx.arc(cx, y1, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, y2, r, 0, Math.PI * 2); ctx.fill();
      } else {
        const cy = PAD_TOP + boardH / 2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    // ─ フレット番号ラベル ─
    ctx.fillStyle    = 'rgba(255,255,255,0.4)';
    ctx.font         = `${Math.max(10, fretStep * 0.22)}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    // 0フレット（開放弦）ラベル: 開放弦ゾーン中央に表示
    if (start === 0 && OPEN_ZONE > 0) {
      ctx.fillText('0', PAD_LEFT - OPEN_ZONE / 2, PAD_TOP * 0.85);
    }
    for (let f = start + 1; f <= end + 1; f++) {
      ctx.fillText(String(f), fretX(f) - fretStep / 2, PAD_TOP * 0.85);
    }

    // ─ フレット線 ─
    for (let f = start; f <= end + 1; f++) {
      const x   = fretX(f);
      const isNut = (f === 0);
      ctx.strokeStyle = isNut ? COLOR.nut : COLOR.fret;
      ctx.lineWidth   = isNut ? 4 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, strY(0));
      ctx.lineTo(x, strY(STRING_COUNT - 1));
      ctx.stroke();
    }

    // ─ 弦（開放弦ゾーン含む BASE_LEFT から描画）─
    for (let s = 0; s < STRING_COUNT; s++) {
      const y = strY(s);
      ctx.strokeStyle = COLOR.string;
      ctx.lineWidth   = STRING_WIDTHS[s] * devicePixelRatio * 0.5;
      ctx.beginPath();
      ctx.moveTo(BASE_LEFT, y);
      ctx.lineTo(PAD_LEFT + boardW + fretStep, y);
      ctx.stroke();
    }
  }

  _drawLayer2(ctx, layout) {
    const { fretStep, strStep, fretX, strY, start, PAD_TOP, boardH } = layout;

    // マスク（判定対象外の弦を半透明で覆う）
    // 盤面エリア内にクリップし、上端弦のマスク帯がフレット番号ラベル（PAD_TOP上部の余白）
    // にはみ出さないようにする
    if (this._maskStrings.size > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, PAD_TOP, this._canvas.width, boardH);
      ctx.clip();
      for (const s of this._maskStrings) {
        const y = strY(s) - strStep / 2;
        const h = strStep;
        ctx.fillStyle = COLOR.maskStr;
        ctx.fillRect(0, y, this._canvas.width, h);
      }
      ctx.restore();
    }

    // ルート音ハイライト（ヒント表示用、通常はnull）
    if (this._rootInfo) {
      const { stringIdx: rs, fret: rf } = this._rootInfo;
      this._drawCircle(ctx, layout, rs, rf, COLOR.root);
    }

    // 詰まった時のヒント（候補ポジションにフェードインする半透明ドット）
    if (this._hintPositions.length > 0) {
      for (const { stringIdx, fret } of this._hintPositions) {
        this._drawCircle(ctx, layout, stringIdx, fret, COLOR.hint, 0.32, this._hintAlpha);
      }
    }

    // ユーザーが正解タップしたルート音マーカー（オレンジ）
    if (this._confirmedRoot) {
      const { stringIdx, fret } = this._confirmedRoot;
      this._drawCircle(ctx, layout, stringIdx, fret, COLOR.root);
    }

    // タップフィードバック（正誤・最前面）
    if (this._feedback) {
      const { stringIdx, fret, isCorrect } = this._feedback;
      this._drawCircle(ctx, layout, stringIdx, fret,
        isCorrect ? COLOR.correct : COLOR.wrong);
    }
  }

  _drawCircle(ctx, layout, stringIdx, fret, color, radiusScale = 0.32, alpha = 1) {
    const { fretX, strY, fretStep, strStep, PAD_LEFT, OPEN_ZONE } = layout;
    // fret=0（開放弦）は開放弦ゾーンの中央に描画
    const x = (fret === 0 && OPEN_ZONE > 0)
      ? PAD_LEFT - OPEN_ZONE / 2
      : fretX(fret) - fretStep / 2;
    const y = strY(stringIdx);
    const r = Math.min(fretStep, strStep) * radiusScale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  // ── イベント ──────────────────────────────────────────────

  _bindEvents() {
    // touchend 後にブラウザが合成する click を1回だけ抑止するフラグ
    let suppressNextClick = false;

    this._canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      suppressNextClick = true;
      const t    = e.changedTouches[0];
      const rect = this._canvas.getBoundingClientRect();
      this._handleTap(
        (t.clientX - rect.left) * (this._canvas.width  / rect.width),
        (t.clientY - rect.top)  * (this._canvas.height / rect.height),
      );
    }, { passive: false });

    this._canvas.addEventListener('click', (e) => {
      if (suppressNextClick) { suppressNextClick = false; return; }
      const rect = this._canvas.getBoundingClientRect();
      this._handleTap(
        (e.clientX - rect.left) * (this._canvas.width  / rect.width),
        (e.clientY - rect.top)  * (this._canvas.height / rect.height),
      );
    });
  }

  _handleTap(x, y) {
    if (!this._tapCb) return;
    const layout = this._calcLayout(this._canvas.width, this._canvas.height);
    const { PAD_LEFT, PAD_TOP, boardH, fretX, strY, fretStep, strStep, start, end } = layout;

    // 指板描画エリア外（上下余白）のタップは無視
    if (y < PAD_TOP - strStep / 2 || y > PAD_TOP + boardH + strStep / 2) return;

    // 弦: 最近接
    let closestStr = 0, minDist = Infinity;
    for (let s = 0; s < STRING_COUNT; s++) {
      const d = Math.abs(y - strY(s));
      if (d < minDist) { minDist = d; closestStr = s; }
    }

    // フレット: ゾーンfは [fretX(f)-fretStep, fretX(f))、表示ゾーンは start+1〜end+1
    let tappedFret = -1;
    if (start === 0 && x < PAD_LEFT) {
      tappedFret = 0; // 開放弦
    } else {
      for (let f = start + 1; f <= end + 1; f++) {
        if (f > MAX_FRET) break;
        if (x >= fretX(f) - fretStep && x < fretX(f)) {
          tappedFret = f;
          break;
        }
      }
    }

    if (tappedFret >= 0) this._tapCb({ stringIdx: closestStr, fret: tappedFret });
  }
}
