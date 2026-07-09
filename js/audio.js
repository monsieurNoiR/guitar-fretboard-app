import { midiToFreq } from './music.js';

export class AudioEngine {
  constructor() {
    this._ctx      = null;
    this.waveType  = 'square'; // sine / triangle / sawtooth / square
    this.volume    = 0.7;
    this._activeVoice = null; // { osc, gain } 直前に鳴らした単音（後勝ちで即カット）
    this._chordVoices = null; // { osc, gain }[] 直前に鳴らしたコード（同時発音、まとめて停止）
  }

  _ensureContext() {
    if (!this._ctx) this._ctx = new AudioContext();
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  // アタック(8ms)→ディケイ→サステイン→リリース（ピアノ系エンベロープ）の単一ボイスを生成
  _createVoice(midi, duration, now) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type            = this.waveType;
    osc.frequency.value = midiToFreq(midi);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(this.volume * 0.45, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.05);

    return { osc, gain };
  }

  // 即座にフェードアウトしてボイスを止める（20ms）
  _fadeOutVoice({ osc, gain }, now) {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.02);
      osc.stop(now + 0.03);
    } catch { /* 既に停止済みの場合は無視 */ }
  }

  // 単音再生。直前の音が鳴っている場合は即座にフェードアウトして止め、
  // 後からタップ/再生された音を優先する（モノフォニック挙動）
  playNote(midi, duration = 0.8) {
    this._ensureContext();
    const now = this._ctx.currentTime;

    if (this._activeVoice) {
      this._fadeOutVoice(this._activeVoice, now);
      this._activeVoice = null;
    }

    const voice = this._createVoice(midi, duration, now);
    this._activeVoice = voice;
    voice.osc.onended = () => {
      if (this._activeVoice === voice) this._activeVoice = null;
    };
  }

  // ストローク: 複数音を同時に鳴らし続けるポリフォニック再生。
  // playNote の _activeVoice（単音カット用）とは別管理にし、互いに干渉しない
  playChord(midis, duration = 1.2) {
    this._ensureContext();
    const now = this._ctx.currentTime;

    if (this._chordVoices) {
      this._chordVoices.forEach(v => this._fadeOutVoice(v, now));
    }
    this._chordVoices = midis.map(midi => this._createVoice(midi, duration, now));
  }

  // 再生中のコードを即座にフェードアウトして止める（画面離脱時など）
  stopChord() {
    if (!this._chordVoices || !this._ctx) return;
    const now = this._ctx.currentTime;
    this._chordVoices.forEach(v => this._fadeOutVoice(v, now));
    this._chordVoices = null;
  }

  // アルペジオ: 順次再生
  playArpeggio(midis, interval = 80) {
    midis.forEach((midi, i) => {
      setTimeout(() => this.playNote(midi, 0.8), i * interval);
    });
  }

  // 正誤フィードバック音用の単一ボイス生成。playNote/playChordの音符再生とは無関係な
  // 効果音のため、waveTypeやmidi換算に依存せず周波数・波形を直接指定できるようにしている
  _createFxVoice(freq, type, now, duration) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
    return { osc, gain };
  }

  // 正解フィードバック音: 固定音色（sine）の明るい2音チャイム（「ピンポン」のイメージ）。
  // 波形設定（waveType）とは独立させ、常に同じ音色で聞き分けやすくする
  playCorrectChime() {
    this._ensureContext();
    const now = this._ctx.currentTime;

    [{ freq: 1046.5, delay: 0 }, { freq: 1568.0, delay: 0.09 }].forEach(({ freq, delay }) => {
      const t = now + delay;
      const { gain } = this._createFxVoice(freq, 'sine', t, 0.22);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.6, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    });
  }

  // 不正解フィードバック音: 固定音色（square）の低く短いブザー（下降グリッサンド）。
  // 周波数帯（420→260Hz）はギターの判定弦デフォルト（E2=82/A2=110/D3=147/G3=196Hz）と
  // 重ならないよう意図的に離してある。ゲインは _createVoice と同型のアタック→サステイン→
  // リリースの3段エンベロープにし、タップ音（playNote）の持続音量（this.volume*0.45）を
  // 上回るサステインを持続時間の大半でキープする（ピーク直後に0.001まで一気に減衰させると、
  // 持続音量の高いタップ音に埋もれて聞こえなくなる問題への対応、v1.16.2）
  playWrongBuzz() {
    this._ensureContext();
    const now = this._ctx.currentTime;
    const duration = 0.18;

    const { osc, gain } = this._createFxVoice(420, 'square', now, duration);
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.volume * 0.95, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(this.volume * 0.65, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  setWaveType(type) {
    if (['sine', 'triangle', 'sawtooth', 'square'].includes(type)) {
      this.waveType = type;
    }
  }
}
