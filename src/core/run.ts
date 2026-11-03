import { Countdown, type Clock } from './timer';
import { roundParams, type RoundParams } from './rounds';
import { Wallet } from './wallet';

export type Phase = 'intro' | 'playing' | 'won' | 'lost';
export type LossReason = 'time' | 'broke';

/**
 * Déroulé d'une partie (indépendant de l'interface) :
 * intro → playing → won → intro (manche suivante) … ou → lost.
 */
export class Run {
  round = 1;
  phase: Phase = 'intro';
  params: RoundParams;
  readonly wallet = new Wallet(0);
  timer: Countdown;
  totalRepaid = 0;
  lossReason: LossReason | null = null;

  constructor(
    /** Mise minimale la plus basse parmi tous les jeux, pour une manche. */
    private readonly minBetFor: (round: number) => number,
    private readonly clock?: Clock,
  ) {
    this.params = roundParams(1);
    this.timer = new Countdown(this.params.timeSec * 1000, clock);
    this.beginRound();
  }

  get debt(): number {
    return this.params.debt;
  }

  /** Prépare la manche courante : verse l'avance, arme le chrono (sans le lancer). */
  private beginRound(): void {
    this.params = roundParams(this.round);
    this.timer = new Countdown(this.params.timeSec * 1000, this.clock);
    this.wallet.deposit(this.params.capital);
    this.phase = 'intro';
  }

  start(): void {
    if (this.phase !== 'intro') return;
    this.phase = 'playing';
    this.timer.start();
  }

  canPay(): boolean {
    return this.phase === 'playing' && this.wallet.balance >= this.debt && this.wallet.inPlay === 0;
  }

  pay(): boolean {
    if (!this.canPay()) return false;
    this.timer.pause();
    this.wallet.withdraw(this.debt);
    this.totalRepaid += this.debt;
    this.phase = 'won';
    return true;
  }

  nextRound(): void {
    if (this.phase !== 'won') return;
    this.round += 1;
    this.beginRound();
  }

  /** Vérifie les conditions de défaite ; à appeler régulièrement et après chaque coup. */
  update(): Phase {
    if (this.phase !== 'playing') return this.phase;
    if (this.timer.expired()) return this.lose('time');
    const w = this.wallet;
    if (w.inPlay === 0 && w.balance < this.debt && w.balance < this.minBetFor(this.round)) {
      return this.lose('broke');
    }
    return this.phase;
  }

  /** Manches entièrement remboursées. */
  get roundsCleared(): number {
    return this.phase === 'won' ? this.round : this.round - 1;
  }

  private lose(reason: LossReason): Phase {
    this.timer.pause();
    this.wallet.forfeitAll();
    this.lossReason = reason;
    this.phase = 'lost';
    return this.phase;
  }
}
