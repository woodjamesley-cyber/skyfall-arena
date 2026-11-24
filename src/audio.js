// Procedural WebAudio sound effects - no external audio assets needed.
import { settings } from './settings.js';

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.listener = { x: 0, y: 0, z: 0 };
    this.ambientStarted = false;
    this.lastFootstep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = settings.audio.master;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = settings.audio.sfx;
    this.sfx.connect(this.master);
    this.startAmbient();
    return this.ctx;
  }

  updateVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.audio.master;
    this.sfx.gain.value = settings.audio.sfx;
    if (this.ambientGain) this.ambientGain.gain.value = 0.14 * settings.audio.master;
  }

  setListener(pos) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z;
  }

  attenuation(pos) {
    if (!pos) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
    return Math.max(0.04, Math.min(1, 1 - d / 160));
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  noiseBuffer(duration = 0.3) {
    const ctx = this.ensure();
    if (!ctx) return null;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  noiseBurst({ duration = 0.2, freq = 1200, q = 1, gain = 0.5, type = 'lowpass', when = 0, pan = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(duration + 0.02);
    if (!src.buffer) return;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  tone({ freq = 440, duration = 0.2, gain = 0.2, type = 'sine', when = 0, slideTo = null } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    const t = ctx.currentTime + when;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  shoot(weaponId, pos) {
    if (!settings.audio.sfx) return;
    const vol = this.attenuation(pos);
    if (vol < 0.05) return;
    const heavy = ['sniper', 'shotgun', 'rocket'].includes(weaponId);
    this.noiseBurst({ duration: heavy ? 0.26 : 0.12, freq: heavy ? 900 : 1900, gain: 0.55 * vol });
    this.tone({ freq: heavy ? 120 : 190, duration: heavy ? 0.2 : 0.09, gain: 0.3 * vol, type: 'triangle', slideTo: 45 });
  }

  swing() { this.noiseBurst({ duration: 0.12, freq: 2600, type: 'highpass', gain: 0.18 }); }
  chop() { this.tone({ freq: 220, duration: 0.09, gain: 0.2, type: 'square', slideTo: 120 }); this.noiseBurst({ duration: 0.08, freq: 700, gain: 0.2 }); }
  build() { this.tone({ freq: 330, duration: 0.1, gain: 0.16, type: 'triangle', slideTo: 220 }); }
  edit() { this.tone({ freq: 620, duration: 0.09, gain: 0.12, type: 'sine', slideTo: 880 }); }
  pieceBreak() { this.noiseBurst({ duration: 0.3, freq: 500, gain: 0.35 }); }
  hit(headshot) { this.tone({ freq: headshot ? 1500 : 950, duration: 0.05, gain: headshot ? 0.18 : 0.1, type: 'square' }); }
  explosion(pos) {
    const vol = this.attenuation(pos);
    this.noiseBurst({ duration: 0.6, freq: 350, gain: 0.55 * vol, q: 0.6 });
    this.tone({ freq: 90, duration: 0.5, gain: 0.4 * vol, type: 'sine', slideTo: 28 });
  }
  reload() { this.noiseBurst({ duration: 0.06, freq: 1800, gain: 0.14 }); this.tone({ freq: 240, duration: 0.07, gain: 0.09, type: 'square', when: 0.12 }); }
  footstep(water) {
    const now = performance.now();
    if (now - this.lastFootstep < 220) return;
    this.lastFootstep = now;
    if (water) this.noiseBurst({ duration: 0.14, freq: 900, gain: 0.09, type: 'bandpass' });
    else this.noiseBurst({ duration: 0.07, freq: 320, gain: 0.07 });
  }
  chest() { [523, 659, 784].forEach((f, i) => this.tone({ freq: f, duration: 0.14, gain: 0.11, when: i * 0.07 })); }
  victory() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, duration: 0.5, gain: 0.14, when: i * 0.12, type: 'triangle' })); }
  defeat() { [392, 330, 262].forEach((f, i) => this.tone({ freq: f, duration: 0.6, gain: 0.12, when: i * 0.16, type: 'sine' })); }
  ui() { this.tone({ freq: 760, duration: 0.05, gain: 0.06, type: 'sine' }); }
  levelUp() { [660, 880, 1100].forEach((f, i) => this.tone({ freq: f, duration: 0.3, gain: 0.1, when: i * 0.1 })); }
  hurt() { this.noiseBurst({ duration: 0.12, freq: 400, gain: 0.18 }); }

  startAmbient() {
    if (this.ambientStarted || !this.ctx) return;
    this.ambientStarted = true;
    const ctx = this.ctx;
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.14 * settings.audio.master;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.ambientGain = gain;
  }

  playMusic() {
    if (!settings.audio.music) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.musicTimer) clearInterval(this.musicTimer);
    const chords = [[220, 277, 330], [196, 247, 294], [174, 220, 262], [196, 262, 330]];
    let i = 0;
    const play = () => {
      const chord = chords[i % chords.length];
      chord.forEach((f) => this.tone({ freq: f, duration: 3.6, gain: 0.03 * settings.audio.music, type: 'sine' }));
      i++;
    };
    play();
    this.musicTimer = setInterval(play, 6200);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
