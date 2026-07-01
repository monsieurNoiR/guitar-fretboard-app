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

  // アルペジオ: 順次再生
  playArpeggio(midis, interval = 80) {
    midis.forEach((midi, i) => {
      setTimeout(() => this.playNote(midi, 0.8), i * interval);
    });
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
