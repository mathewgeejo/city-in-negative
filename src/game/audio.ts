import type { Era } from '../core/types';

/** Synthesised, spatial audio. Each era has its own bus; the inactive era is heard faintly, and
 * clearly while the viewfinder is raised, so a tram bell can be followed through the camera. */
export class Audio {
  ctx?: AudioContext;
  private master?: GainNode;
  private bus: Partial<Record<Era, GainNode>> = {};
  private noise?: AudioBuffer;
  private tramRumble?: { src: AudioBufferSourceNode; gain: GainNode; pan: PannerNode };
  private trickle?: { gain: GainNode; pan: PannerNode };
  private clerkPan?: PannerNode;
  volume = 0.8;

  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    for (const e of ['present', 'past'] as Era[]) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.bus[e] = g;
    }
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ambience();
  }

  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v; }

  private loopNoise(bus: GainNode, type: BiquadFilterType, freq: number, q: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(bus);
    src.start();
    return { src, gain: g, filter: f };
  }

  private ambience() {
    const ctx = this.ctx!;
    // present: rain hiss and low city wash
    this.loopNoise(this.bus.present!, 'highpass', 1800, 0.3, 0.09);
    this.loopNoise(this.bus.present!, 'lowpass', 300, 0.5, 0.05);
    // past: warm air, distant street murmur
    this.loopNoise(this.bus.past!, 'bandpass', 500, 0.4, 0.05);
    this.loopNoise(this.bus.past!, 'lowpass', 160, 0.4, 0.05);
    // tram rumble (spatial, past)
    const pan = this.panner(this.bus.past!, 1.5);
    const src = ctx.createBufferSource(); src.buffer = this.noise!; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 120;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(pan); src.start();
    this.tramRumble = { src, gain: g, pan };
    // water trickle at the archive window (past)
    const tp = this.panner(this.bus.past!, 1);
    const ts = ctx.createBufferSource(); ts.buffer = this.noise!; ts.loop = true;
    const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 2400; tf.Q.value = 2;
    const tg = ctx.createGain(); tg.gain.value = 0;
    ts.connect(tf); tf.connect(tg); tg.connect(tp); ts.start();
    this.trickle = { gain: tg, pan: tp };
    this.clerkPan = this.panner(this.bus.past!, 1);
  }

  private panner(dest: AudioNode, ref = 1): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.1;
    p.connect(dest);
    return p;
  }

  private setPos(p: PannerNode, x: number, y: number, z: number) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else (p as any).setPosition(x, y, z);
  }

  /** Per frame: listener pose and era mix. */
  update(era: Era, viewfinder: boolean, x: number, y: number, z: number, fx: number, fz: number, tramX: number, tramActive: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { (L as any).setPosition(x, y, z); (L as any).setOrientation(fx, 0, fz, 0, 1, 0); }
    const other = era === 'present' ? 'past' : 'present';
    const t = ctx.currentTime;
    this.bus[era]!.gain.setTargetAtTime(viewfinder ? 0.55 : 1, t, 0.12);
    this.bus[other]!.gain.setTargetAtTime(viewfinder ? 1 : 0.1, t, 0.12);
    if (this.tramRumble) {
      this.setPos(this.tramRumble.pan, tramX, 1, 0);
      this.tramRumble.gain.gain.setTargetAtTime(tramActive ? 0.7 : 0, t, 0.3);
    }
  }

  setTrickle(on: boolean, x: number, y: number, z: number) {
    if (!this.trickle || !this.ctx) return;
    this.setPos(this.trickle.pan, x, y, z);
    this.trickle.gain.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, 0.4);
  }

  /** Inharmonic bell partials, anchored to the tram. */
  bell(era: Era, x: number, y: number, z: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const pan = this.panner(this.bus[era]!, 3);
    this.setPos(pan, x, y, z);
    const t = ctx.currentTime;
    for (const [k, [ratio, amp]] of [[1, 0.5], [2.76, 0.28], [5.4, 0.12], [8.93, 0.06]].entries()) {
      for (const strike of [0, 0.32]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1180 * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + strike);
        g.gain.linearRampToValueAtTime(amp * 0.6, t + strike + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + strike + 1.6 / (1 + k * 0.6));
        o.connect(g); g.connect(pan);
        o.start(t + strike); o.stop(t + strike + 1.8);
      }
    }
    setTimeout(() => pan.disconnect(), 2500);
  }

  /** Short percussive click (clock relay, stamp, latch). */
  click(era: Era, x: number, y: number, z: number, freq = 2200, gain = 0.5, decay = 0.05) {
    const ctx = this.ctx;
    if (!ctx) return;
    const pan = this.panner(this.bus[era]!, 2);
    this.setPos(pan, x, y, z);
    const src = ctx.createBufferSource(); src.buffer = this.noise!;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 4;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f); f.connect(g); g.connect(pan);
    src.start(t, Math.random()); src.stop(t + decay + 0.02);
    setTimeout(() => pan.disconnect(), 500);
  }

  drip(x: number, y: number, z: number) { this.click('present', x, y, z, 3200 + Math.random() * 1500, 0.18, 0.03); }

  /** A soft whoosh for the passage and a shutter for the camera, non-spatial. */
  ui(kind: 'shutter' | 'cross' | 'page' | 'solve') {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.master!;
    if (kind === 'shutter') {
      for (const [dt, fr] of [[0, 3000], [0.07, 1800]]) {
        const src = ctx.createBufferSource(); src.buffer = this.noise!;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr; f.Q.value = 3;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t + dt); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.05);
        src.connect(f); f.connect(g); g.connect(out); src.start(t + dt); src.stop(t + dt + 0.08);
      }
    } else if (kind === 'cross' || kind === 'page') {
      const src = ctx.createBufferSource(); src.buffer = this.noise!;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(kind === 'cross' ? 200 : 900, t); f.frequency.exponentialRampToValueAtTime(kind === 'cross' ? 3000 : 2500, t + 0.5);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(kind === 'cross' ? 0.35 : 0.12, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      src.connect(f); f.connect(g); g.connect(out); src.start(t); src.stop(t + 1);
    } else {
      for (const [i, fr] of [523.25, 659.25, 783.99, 1046.5].entries()) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t + i * 0.18); g.gain.linearRampToValueAtTime(0.12, t + i * 0.18 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 2.2);
        o.connect(g); g.connect(out); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 2.4);
      }
    }
  }

  clerkSound(x: number, z: number, kind: 'squeak' | 'stamp') {
    if (!this.clerkPan || !this.ctx) return;
    this.click('past', x, 1, z, kind === 'stamp' ? 300 : 4200, kind === 'stamp' ? 0.9 : 0.12, kind === 'stamp' ? 0.12 : 0.08);
  }

  dispose() { void this.ctx?.close(); this.ctx = undefined; }
}
