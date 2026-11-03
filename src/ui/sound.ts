/**
 * Effets sonores synthétisés avec la Web Audio API (aucun fichier externe).
 * Le contexte audio n'est créé qu'après un premier geste de l'utilisateur.
 */
export type SoundName =
  | 'chip'
  | 'card'
  | 'tick'
  | 'reel'
  | 'win'
  | 'bigWin'
  | 'lose'
  | 'alarm'
  | 'alarmHigh'
  | 'pay'
  | 'gameOver'
  | 'click'
  | 'coin'
  | 'cashIn'
  | 'drain'
  | 'ready';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor(public muted = false) {}

  /** À appeler sur un geste utilisateur (clic, touche). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; // bruit décoratif, sans lien avec le jeu
  }

  play(name: SoundName): void {
    if (this.muted || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'click':
        this.tone(1400, t, 0.03, 'square', 0.08);
        break;
      case 'chip':
        this.burst(t, 0.05, 3500, 0.35);
        this.tone(2200, t, 0.05, 'sine', 0.12);
        break;
      case 'card':
        this.burst(t, 0.07, 1800, 0.3, 'bandpass');
        break;
      case 'tick':
        this.burst(t, 0.015, 5000, 0.15);
        break;
      case 'reel':
        this.tone(90, t, 0.09, 'sine', 0.5);
        this.burst(t, 0.03, 900, 0.2);
        break;
      case 'win':
        [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.08, 0.16, 'triangle', 0.25));
        break;
      case 'bigWin':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
          this.tone(f, t + i * 0.09, 0.2, 'triangle', 0.3),
        );
        break;
      case 'lose':
        this.slide(220, 110, t, 0.3, 'sawtooth', 0.12);
        break;
      case 'alarm':
        this.tone(880, t, 0.08, 'square', 0.12);
        break;
      case 'alarmHigh':
        this.tone(1175, t, 0.07, 'square', 0.14);
        this.tone(1175, t + 0.14, 0.07, 'square', 0.14);
        break;
      case 'pay':
        this.tone(1568, t, 0.25, 'sine', 0.25);
        this.tone(2093, t + 0.1, 0.35, 'sine', 0.2);
        this.burst(t, 0.12, 4000, 0.25);
        break;
      case 'coin':
        // Petite pièce qui tombe dans la caisse : deux harmoniques brillantes.
        this.tone(2637, t, 0.09, 'sine', 0.16);
        this.tone(3951, t + 0.025, 0.12, 'sine', 0.1);
        break;
      case 'cashIn':
        // « Ka-ching » : clochette + tiroir-caisse.
        this.burst(t, 0.05, 2500, 0.3);
        this.tone(1319, t + 0.04, 0.12, 'triangle', 0.22);
        this.tone(2637, t + 0.1, 0.35, 'sine', 0.2);
        this.tone(3520, t + 0.1, 0.3, 'sine', 0.12);
        break;
      case 'drain':
        // L'argent qui s'en va : glissando descendant feutré.
        this.slide(660, 330, t, 0.22, 'triangle', 0.1);
        break;
      case 'ready':
        // Assez pour payer : fanfare courte.
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.07, 0.25, 'square', 0.08));
        break;
      case 'gameOver':
        [392, 349, 311, 262].forEach((f, i) => this.tone(f, t + i * 0.22, 0.3, 'sawtooth', 0.12));
        break;
    }
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private slide(f1: number, f2: number, at: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, at);
    o.frequency.exponentialRampToValueAtTime(f2, at + dur);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private burst(at: number, dur: number, freq: number, vol: number, type: BiquadFilterType = 'highpass'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}
