/**
 * Son entièrement synthétisé avec Web Audio (aucun fichier externe, aucune licence à gérer) :
 * sabots selon la surface, glissade, corde parfaite, élan, bramé de victoire, ours, castor,
 * compte à rebours et petite musique par biome. Retour haptique quand le navigateur le permet.
 */

type Surface = 'sentier' | 'herbe' | 'boue' | 'neige' | 'glace' | 'racines';

const HOOF: Record<Surface, { freq: number; q: number; gain: number; dur: number }> = {
  sentier: { freq: 900, q: 1.2, gain: 0.5, dur: 0.07 },
  herbe: { freq: 600, q: 0.8, gain: 0.35, dur: 0.08 },
  boue: { freq: 260, q: 1.5, gain: 0.55, dur: 0.12 },
  neige: { freq: 2200, q: 0.6, gain: 0.25, dur: 0.1 },
  glace: { freq: 3200, q: 3, gain: 0.3, dur: 0.04 },
  racines: { freq: 450, q: 2.5, gain: 0.6, dur: 0.06 },
};

/** Gammes pentatoniques (demi-tons depuis la tonique) et tempo par biome. */
const MUSIC: Record<string, { root: number; scale: number[]; bpm: number }> = {
  plaine: { root: 57, scale: [0, 2, 4, 7, 9], bpm: 92 },
  foret: { root: 55, scale: [0, 3, 5, 7, 10], bpm: 100 },
  rocheuses: { root: 52, scale: [0, 2, 5, 7, 9], bpm: 84 },
  test: { root: 60, scale: [0, 2, 4, 7, 9], bpm: 96 },
  menu: { root: 60, scale: [0, 4, 7, 9, 12], bpm: 76 },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private driftGain: GainNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private musicTimer = 0;
  private musicStyle = 'menu';
  private nextNote = 0;
  private step = 0;
  sfxOn = true;
  musicOn = true;
  hapticsOn = true;

  /** À appeler sur un geste de l'utilisateur (exigence d'iOS). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.1;
    this.music.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyToggles();
    this.startMusicLoop();
  }

  applyToggles(): void {
    if (!this.ctx) return;
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.music.gain.value = this.musicOn ? 0.1 : 0;
  }

  /** Le jeu passe en arrière-plan : tout se met en pause. */
  suspend(on: boolean): void {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private noiseBurst(dest: AudioNode, at: number, dur: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.connect(dest);
    src.start(at, Math.random() * 0.5, dur + 0.05);
    return src;
  }

  private env(at: number, peak: number, attack: number, release: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
    g.connect(this.sfx);
    return g;
  }

  hoof(surface: string, intensity: number): void {
    if (!this.ctx || !this.sfxOn) return;
    const h = HOOF[(surface as Surface) in HOOF ? (surface as Surface) : 'sentier'];
    const t = this.ctx.currentTime;
    const g = this.env(t, h.gain * Math.min(1, 0.4 + intensity), 0.005, h.dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = h.freq * (0.9 + Math.random() * 0.2);
    f.Q.value = h.q;
    f.connect(g);
    this.noiseBurst(f, t, h.dur);
    // Petit coup sourd sous le sabot.
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    const og = this.env(t, 0.25 * Math.min(1, intensity + 0.3), 0.003, 0.06);
    o.connect(og);
    o.start(t);
    o.stop(t + 0.1);
  }

  private rainGain: GainNode | null = null;

  /** Pluie : bruit continu filtré, doux. */
  rain(on: boolean): void {
    if (!this.ctx) return;
    if (!this.rainGain) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1500;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      f.connect(this.rainGain);
      this.rainGain.connect(this.sfx);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.connect(f);
      src.start();
    }
    this.rainGain.gain.setTargetAtTime(on ? 0.08 : 0, this.ctx.currentTime, 0.4);
  }

  /** Glissade : souffle filtré continu, d'autant plus aigu que l'élan est chargé. */
  drift(on: boolean, charge: number): void {
    if (!this.ctx) return;
    if (!this.driftGain) {
      this.driftFilter = this.ctx.createBiquadFilter();
      this.driftFilter.type = 'bandpass';
      this.driftFilter.Q.value = 1.5;
      this.driftGain = this.ctx.createGain();
      this.driftGain.gain.value = 0;
      this.driftFilter.connect(this.driftGain);
      this.driftGain.connect(this.sfx);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.connect(this.driftFilter);
      src.start();
    }
    const t = this.ctx.currentTime;
    this.driftGain.gain.setTargetAtTime(on ? 0.22 : 0, t, 0.05);
    this.driftFilter!.frequency.setTargetAtTime(700 + charge * 1800, t, 0.1);
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, peak: number): void {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.env(at, peak, 0.01, dur);
    o.connect(g);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  corde(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.25, 'sine', 0.25);
    this.tone(1320, t + 0.08, 0.35, 'sine', 0.22);
    this.vibrate(15);
  }

  boost(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + 0.5);
    const g = this.env(t, 0.35, 0.05, 0.6);
    f.connect(g);
    this.noiseBurst(f, t, 0.7);
  }

  pickup(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((s, i) => this.tone(midi(72 + s), t + i * 0.06, 0.15, 'triangle', 0.2));
  }

  beep(go: boolean): void {
    if (!this.ctx) return;
    this.tone(go ? 990 : 660, this.ctx.currentTime, go ? 0.45 : 0.18, 'square', 0.12);
  }

  thud(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = this.env(t, 0.5, 0.005, 0.2);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.25);
    this.vibrate(30);
  }

  growl(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(85, t);
    o.frequency.linearRampToValueAtTime(60, t + 0.7);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = this.env(t, 0.45, 0.05, 0.75);
    o.connect(f);
    f.connect(g);
    o.start(t);
    o.stop(t + 0.9);
    this.vibrate([40, 30, 60]);
  }

  /** Bramé de l'orignal : note grave qui glisse vers le bas, avec vibrato. */
  brame(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(230, t);
    o.frequency.linearRampToValueAtTime(260, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(120, t + 1.6);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 6;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    f.Q.value = 4;
    const g = this.env(t, 0.4, 0.15, 1.6);
    o.connect(f);
    f.connect(g);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.9);
    lfo.stop(t + 1.9);
    this.vibrate([60, 40, 60]);
  }

  vibrate(pattern: number | number[]): void {
    if (this.hapticsOn && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  }

  setMusic(style: string): void {
    this.musicStyle = style in MUSIC ? style : 'test';
  }

  /** Séquenceur simple : basse et arpège pentatonique, planifiés un peu en avance. */
  private startMusicLoop(): void {
    if (!this.ctx) return;
    this.nextNote = this.ctx.currentTime + 0.2;
    clearInterval(this.musicTimer);
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const m = MUSIC[this.musicStyle];
      const beat = 60 / m.bpm / 2;
      while (this.nextNote < this.ctx.currentTime + 0.3) {
        const i = this.step % 16;
        const deg = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 5, 3, 2, 1, 0][i];
        const oct = Math.floor(deg / m.scale.length);
        const note = m.root + 12 + m.scale[deg % m.scale.length] + 12 * oct;
        this.musicNote(midi(note), this.nextNote, beat * 0.9, 'triangle', 0.5);
        if (i % 4 === 0) this.musicNote(midi(m.root - 12 + (i === 8 ? m.scale[3] : 0)), this.nextNote, beat * 3.5, 'sine', 0.8);
        this.nextNote += beat;
        this.step++;
      }
    }, 100);
  }

  private musicNote(freq: number, at: number, dur: number, type: OscillatorType, peak: number): void {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(this.music);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}
