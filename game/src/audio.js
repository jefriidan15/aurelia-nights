// Aurelia Nights — synthesised sound: WebAudio only, no assets.
// Engine hum, sirens, impacts, gunfire, jingles and a bassline loop.
// Everything is guarded: no audio context, no crash, just silence.
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.started = false;
  }

  ensure() {
    if (this.started) {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // engine: sawtooth through a lowpass
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 55;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp);
      lp.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // siren: triangle, pitch wobbles on an LFO
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = "triangle";
      this.sirenOsc.frequency.value = 750;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.type = "square";
      this.sirenLfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      this.sirenLfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
      this.started = true;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.value = m ? 0 : 0.5;
  }

  setEngine(speedFrac, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const target = driving ? 0.05 + speedFrac * 0.075 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + speedFrac * 95, this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.3);
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx || !this.master) return;
    try {
      const o = this.ctx.createOscillator();
      o.type = type || "sine";
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.18, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g);
      g.connect(this.master);
      o.start();
      o.stop(this.ctx.currentTime + dur);
    } catch { /* silent */ }
  }

  noise(dur, vol, low) {
    if (!this.ctx || !this.master) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = low || 900;
      const g = this.ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
    } catch { /* silent */ }
  }

  shot() { this.noise(0.12, 0.4, 2400); this.blip(140, 0.1, "square", 0.12); }
  punch() { this.noise(0.08, 0.25, 500); }
  crash() { this.noise(0.25, 0.35, 700); }
  pickup() { this.blip(660, 0.09, "sine", 0.2); this.blip(990, 0.12, "sine", 0.18); }
  denied() { this.blip(160, 0.16, "square", 0.15); }
  jingle() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, "triangle", 0.22), i * 110));
  }
  busted() {
    [392, 370, 349, 330].forEach((n, i) => setTimeout(() => this.blip(n, 0.3, "sawtooth", 0.14), i * 160));
  }

  // Tiny bassline: A minor groove, one note per beat slice.
  music(dt, playing) {
    if (!this.ctx || this.muted || !playing) return;
    this.musicTimer += dt;
    if (this.musicTimer < 0.21) return;
    this.musicTimer = 0;
    const bass = [110, 0, 110, 130.8, 0, 98, 0, 146.8, 110, 0, 110, 130.8, 164.8, 0, 146.8, 98];
    const n = bass[this.musicStep % bass.length];
    this.musicStep++;
    if (n) this.blip(n, 0.19, "triangle", 0.07);
    if (this.musicStep % 16 === 0) this.blip(220, 0.1, "sine", 0.04);
  }
}
