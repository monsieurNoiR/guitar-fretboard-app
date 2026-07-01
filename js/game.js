import {
  getPitchClass, getMidi,
  pickRootPc, pickInterval,
  isIntervalHit,
  calcDisplayRange,
  ALL_INTERVALS,
  noteName,
  MAX_FRET,
} from './music.js';

const QUESTIONS_PER_SET = 10;

export class Game {
  constructor({ level, audio, fretboard, excludeOpenStrings = false,
                onQuestion, onCorrect, onWrong, onComplete }) {
    this._level              = level;
    this._audio              = audio;
    this._fb                 = fretboard;
    this._excludeOpenStrings = excludeOpenStrings;
    this._onQ                = onQuestion;
    this._onCorrect          = onCorrect;
    this._onWrong            = onWrong;
    this._onComplete         = onComplete;

    this._fb.onTap(({ stringIdx, fret }) => this.handleTap({ stringIdx, fret }));

    this._qIndex    = 0;   // 現在の問題番号（0始まり）
    this._correct   = 0;
    this._qStartTime= null;
    this._totalTime = 0;   // 回答中の累計時間（タイマーは回答中のみ動作）
    this._playTimer         = null; // _playQuestion の 700ms 遅延タイマー
    this._nextQuestionTimer = null;
    this._currentQ  = null;
    this._answered  = false;
    this._phase     = 'root'; // 'root' | 'interval'
    this._isPractice = (level.id === 'practice');
  }

  // ── 公開API ──────────────────────────────────────────────

  start() {
    this._qIndex   = 0;
    this._correct  = 0;
    this._totalTime= 0;
    this._nextQuestion();
  }

  // 「もう一度聞く」
  replay() {
    if (this._currentQ) this._playQuestion(this._currentQ);
  }

  handleTap({ stringIdx, fret }) {
    if (!this._currentQ || this._answered) return;

    // 判定対象弦チェック
    if (!this._level.judgeStrings.includes(stringIdx)) return;

    // 開放弦除外設定
    if (this._excludeOpenStrings && fret === 0) return;

    const q    = this._currentQ;
    const pc   = getPitchClass(stringIdx, fret);
    const midi = getMidi(stringIdx, fret);

    // タップ位置の音を常に再生（正誤問わず）
    this._audio.playNote(midi, 0.7);

    if (this._phase === 'root') {
      if (pc === q.rootPc) {
        // ルート正解: オレンジ確定マーカーを置いて度数フェーズへ
        this._fb.setConfirmedRoot(stringIdx, fret);
        this._fb.clearFeedback();
        this._phase = 'interval';
        this._onQ?.({
          qNum:         this._isPractice ? null : this._qIndex + 1,
          total:        this._isPractice ? null : QUESTIONS_PER_SET,
          intervalName: q.intervalInfo.name,
          rootName:     noteName(q.rootPc),
          phase:        'interval',
        });
      } else {
        this._fb.showFeedback(stringIdx, fret, false);
      }
    } else {
      // 度数フェーズ
      const hit = isIntervalHit(q.rootPc, q.rootMidi, pc, midi, q.semitones);
      this._fb.showFeedback(stringIdx, fret, hit);
      if (hit) {
        this._stopTimer();
        this._answered = true;
        this._correct++;
        this._onCorrect?.({ score: this._correct, total: this._qIndex + 1 });
        if (this._isPractice) {
          this._nextQuestionTimer = setTimeout(() => this._nextQuestion(), 800);
        } else {
          this._nextQuestionTimer = setTimeout(() => {
            this._qIndex++;
            if (this._qIndex >= QUESTIONS_PER_SET) this._finish();
            else this._nextQuestion();
          }, 500);
        }
      } else {
        this._onWrong?.();
      }
    }
  }

  getResults() {
    return {
      correct:   this._correct,
      total:     QUESTIONS_PER_SET,
      totalTime: Math.round(this._totalTime * 10) / 10,
      levelId:   this._level.id,
    };
  }

  stop() {
    this._stopTimer();
    clearTimeout(this._playTimer);
    clearTimeout(this._nextQuestionTimer);
  }

  // ── 内部メソッド ──────────────────────────────────────────

  _nextQuestion() {
    this._fb.clearFeedback();
    this._fb.clearConfirmedRoot();
    this._phase    = 'root';
    this._answered = false;

    // 表示窓内に正解ポジションが存在しない組み合わせを避けるため最大30回リトライ
    let rootPc, rootString, rootFret, rootMidi, semitones, targetPc, intervalInfo;
    let attempts = 0;
    do {
      rootPc    = pickRootPc(this._level.rootPcs);
      semitones = pickInterval(this._level.intervals);
      targetPc  = (rootPc + semitones) % 12;
      const pos = this._pickRootPosition(rootPc);
      rootString = pos.stringIdx;
      rootFret   = pos.fret;
      rootMidi   = getMidi(rootString, rootFret);
      intervalInfo = ALL_INTERVALS.find(i => i.semitones === semitones)
                  || { name: String(semitones), isTension: semitones >= 12 };
      attempts++;
    } while (!this._hasValidAnswer(rootPc, rootMidi, semitones, rootFret) && attempts < 30);

    this._currentQ = { rootPc, rootString, rootFret, rootMidi, semitones, targetPc, intervalInfo };

    // 表示範囲を更新
    const range = calcDisplayRange(rootFret);
    const maskStrings = this._buildMask(this._level.judgeStrings);
    this._fb.draw({ displayRange: range, maskStrings });

    // コールバック（ルートフェーズの開始を通知）
    this._onQ?.({
      qNum:         this._isPractice ? null : this._qIndex + 1,
      total:        this._isPractice ? null : QUESTIONS_PER_SET,
      intervalName: intervalInfo.name,
      rootName:     noteName(rootPc),
      phase:        'root',
    });

    // 音再生後にタイマー開始
    this._playQuestion(this._currentQ);
  }

  _playQuestion(q) {
    clearTimeout(this._playTimer);
    this._audio.playNote(q.rootMidi, 0.8);
    this._playTimer = setTimeout(() => {
      const targetMidi = q.rootMidi + q.semitones;
      this._audio.playNote(targetMidi, 1.0);
      if (!this._isPractice) this._startTimer();
    }, 800);
  }

  // 「もう一度」で再生し直すと _playQuestion 経由で再度呼ばれるため、
  // 前回の開始時刻からの経過分を _totalTime に加算してから計り直す
  // （加算しないと聞き直すたびに経過時間が消えてしまう）
  _startTimer() {
    if (this._qStartTime !== null) {
      this._totalTime += (performance.now() - this._qStartTime) / 1000;
    }
    this._qStartTime = performance.now();
  }

  _stopTimer() {
    if (this._qStartTime !== null) {
      this._totalTime += (performance.now() - this._qStartTime) / 1000;
      this._qStartTime = null;
    }
  }

  _finish() {
    this._stopTimer();
    this._onComplete?.(this.getResults());
  }

  // ルート音ポジション選択
  // level.rootStrings / rootOctaves が定義されている場合は候補からランダム選択
  // 未定義の場合は従来通り 6弦の最低フレット
  _pickRootPosition(rootPc) {
    const rootStrings = this._level.rootStrings ?? [0];
    const rootOctaves = this._level.rootOctaves ?? [0];

    const candidates = [];
    for (const s of rootStrings) {
      // 弦 s 上で rootPc に最初に一致するフレット（0〜11）を探す
      let baseFret = -1;
      for (let f = 0; f <= 11; f++) {
        if (getPitchClass(s, f) === rootPc) { baseFret = f; break; }
      }
      if (baseFret < 0) continue;

      for (const oct of rootOctaves) {
        const fret = baseFret + oct * 12;
        if (fret <= MAX_FRET) {
          candidates.push({ stringIdx: s, fret });
        }
      }
    }

    if (candidates.length === 0) {
      // フォールバック: 6弦の最低フレット
      const fret = this._findRootFret6th(rootPc);
      return { stringIdx: 0, fret };
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // 実際にタップ可能な表示窓（calcDisplayRange）内に正解ポジションが存在するか確認
  _hasValidAnswer(rootPc, rootMidi, semitones, rootFret) {
    const { start, end } = calcDisplayRange(rootFret);
    for (const s of this._level.judgeStrings) {
      // 開放弦ゾーン（start=0 かつ除外設定なし）
      if (start === 0 && !this._excludeOpenStrings) {
        if (isIntervalHit(rootPc, rootMidi, getPitchClass(s, 0), getMidi(s, 0), semitones)) {
          return true;
        }
      }
      // 表示フレット窓内（start+1 〜 end+1）
      for (let f = start + 1; f <= end + 1; f++) {
        if (isIntervalHit(rootPc, rootMidi, getPitchClass(s, f), getMidi(s, f), semitones)) {
          return true;
        }
      }
    }
    return false;
  }

  // フォールバック用: 6弦上で rootPc に最初に一致するフレット
  _findRootFret6th(rootPc) {
    for (let f = 0; f <= 12; f++) {
      if (getPitchClass(0, f) === rootPc) return f;
    }
    return 0;
  }

  // 判定対象外弦のマスクセットを生成
  _buildMask(judgeStrings) {
    const mask = new Set();
    for (let s = 0; s < 6; s++) {
      if (!judgeStrings.includes(s)) mask.add(s);
    }
    return mask;
  }
}
