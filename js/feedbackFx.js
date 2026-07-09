// 正解・不正解時の画面演出（大きな○/✗オーバーレイ）専属クラス。
// 音はAudioEngine、指板CanvasはFretboardが担当するのと同じ「1クラス1責務」の慣例に沿い、
// このクラスはDOMオーバーレイの表示のみを扱う（判定ロジックは一切持たない）
export class FeedbackFx {
  constructor(overlayEl, symbolEl) {
    this._overlay = overlayEl;
    this._symbol  = symbolEl;
  }

  showCorrect() { this._trigger('fx-correct', '○'); }
  showWrong()   { this._trigger('fx-wrong', '✗'); }

  _trigger(className, symbol) {
    this._symbol.textContent = symbol;
    this._overlay.classList.remove('fx-correct', 'fx-wrong');
    // 連続不正解時など短時間で再トリガーされてもCSSアニメーションが確実に頭から
    // 再生されるように、クラス除去後に強制reflowを挟んでから付け直す
    void this._overlay.offsetWidth;
    this._overlay.classList.add(className);
  }
}
