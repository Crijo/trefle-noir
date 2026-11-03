/**
 * Compte à rebours fiable : le temps restant est calculé à partir d'une horloge
 * monotone (performance.now), jamais en comptant des images. La pause n'est
 * utilisée que lorsque l'onglet passe en arrière-plan.
 */
export type Clock = () => number;

const defaultClock: Clock = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export class Countdown {
  private remainingAtStart: number;
  private startedAt: number | null = null;

  constructor(
    durationMs: number,
    private readonly clock: Clock = defaultClock,
  ) {
    this.remainingAtStart = durationMs;
  }

  start(): void {
    if (this.startedAt === null) this.startedAt = this.clock();
  }

  pause(): void {
    if (this.startedAt === null) return;
    this.remainingAtStart = this.remainingMs();
    this.startedAt = null;
  }

  get running(): boolean {
    return this.startedAt !== null;
  }

  remainingMs(): number {
    if (this.startedAt === null) return Math.max(0, this.remainingAtStart);
    return Math.max(0, this.remainingAtStart - (this.clock() - this.startedAt));
  }

  expired(): boolean {
    return this.remainingMs() <= 0;
  }
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
