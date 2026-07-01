import { midiToFreq } from './music.js';

export class AudioEngine {
  constructor() {
    this._ctx      = null;
    this.waveType  = 'square'; // sine / triangle / sawtooth / square
    this.volume    = 0.7;
    this._activeVoice = null; // { osc, gain } 直前に鳴らした音（後勝ちで即カット）
  }

  _ensureContext() {
    if (!this._ctx) this._ctx = new AudioContext();
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  // 単音再生（エンベロープ付き）。直前の音が鳴っている場合は即座にフェードアウトして
  // 止め、後からタップ/再生された音を優先する（モノフォニック挙動）
  playNote(midi, duration = 0.8) {
    this._ensureContext();
    const ctx  = this._ctx;
    const now  = ctx.currentTime;

    if (this._activeVoice) {
      const { osc: prevOsc, gain: prevGain } = this._activeVoice;
      try {
        prevGain.gain.cancelScheduledValues(now);
        prevGain.gain.setValueAtTime(prevGain.gain.value, now);
        prevGain.gain.linearRampToValueAtTime(0, now + 0.02);
        prevOsc.stop(now + 0.03);
      } catch { /* 既に停止済みの場合は無視 */ }
      this._activeVoice = null;
    }

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type            = this.waveType;
    osc.frequency.value = midiToFreq(midi);

    // アタック(8ms)→ディケイ→サステイン→リリース（ピアノ系エンベロープ）
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(this.volume * 0.45, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.05);

    this._activeVoice = { osc, gain };
    osc.onended = () => {
      if (this._activeVoice?.osc === osc) this._activeVoice = null;
    };
  }

  // ストローク: 複数音を同時再生
  playChord(midis, duration = 1.2) {
    midis.forEach(midi => this.playNote(midi, duration));
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
