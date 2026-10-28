export class AudioManager {
  private ctx: AudioContext | null = null;
  private muted: boolean;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AnyWindow = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? AnyWindow.webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType, delay = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const startAt = ctx.currentTime + delay;
    osc.start(startAt);
    gain.gain.exponentialRampToValueAtTime(0.15, startAt + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.stop(startAt + duration + 0.02);
  }

  playCorrect(): void {
    this.tone(523.25, 0.18, "sine", 0);
    this.tone(659.25, 0.22, "sine", 0.12);
    this.tone(783.99, 0.28, "sine", 0.24);
  }

  playWrong(): void {
    this.tone(200, 0.2, "sawtooth", 0);
  }

  playInteract(): void {
    this.tone(440, 0.12, "triangle", 0);
  }

  playUnlock(): void {
    this.tone(392, 0.2, "sine", 0);
    this.tone(523.25, 0.2, "sine", 0.1);
    this.tone(659.25, 0.35, "sine", 0.2);
  }
}
