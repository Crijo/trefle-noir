/**
 * « Moteurs » de simulation : jouent un coup d'un jeu avec une mise donnée en
 * réutilisant exactement la logique du jeu (aucune réimplémentation).
 */
import type { Rng } from '../src/core/rng';
import { BlackjackRound, Shoe, basicStrategy } from '../src/games/blackjack/logic';
import { resolve, spin, type BetKind } from '../src/games/roulette/logic';
import { SlotMachine } from '../src/games/slots/logic';
import { PokerHand, simpleStrategy } from '../src/games/videopoker/logic';
import { BALANCE } from '../src/config/balance';

export interface PlayResult {
  staked: number;
  returned: number;
}

export function playRoulette(rng: Rng, kind: BetKind, bet: number): PlayResult {
  const r = resolve([{ kind, amount: bet }], spin(rng));
  return { staked: r.staked, returned: r.returned };
}

export class BlackjackEngine {
  private shoe: Shoe;
  constructor(rng: Rng) {
    this.shoe = new Shoe(rng);
  }
  /** `bankroll` limite les doublements/séparations à ce que le joueur peut payer. */
  play(bet: number, bankroll = Infinity): PlayResult {
    const round = new BlackjackRound(this.shoe, bet);
    let available = bankroll - bet;
    while (!round.settled) {
      let a = basicStrategy(round);
      const extra = round.extraStakeFor(a);
      if (extra > available) a = a === 'split' ? fallback(round) : 'hit';
      available -= round.extraStakeFor(a);
      round.apply(a);
    }
    return { staked: round.totalStaked, returned: round.totalReturned };
  }
}

/** Si on ne peut pas payer la séparation : jouer la main comme un total ordinaire. */
function fallback(round: BlackjackRound): 'hit' | 'stand' {
  const up = round.dealerUp.rank >= 10 && round.dealerUp.rank <= 13 ? 10 : round.dealerUp.rank;
  const c = round.current!.cards;
  const pts = c.reduce((s, x) => s + (x.rank === 14 ? 11 : Math.min(10, x.rank)), 0);
  if (pts >= 17) return 'stand';
  if (pts >= 13 && up <= 6) return 'stand';
  return 'hit';
}

export class SlotEngine {
  readonly machine = new SlotMachine();
  constructor(private rng: Rng) {}
  /** `bet` = mise totale (multiple du nombre de lignes). */
  play(bet: number): PlayResult {
    const lineBet = bet / this.machine.lines;
    const r = this.machine.spin(this.rng, lineBet);
    return { staked: bet, returned: r.returned };
  }
}

export function playVideoPoker(rng: Rng, bet: number): PlayResult {
  const h = new PokerHand(rng, bet);
  h.setHolds(simpleStrategy(h.cards));
  return { staked: bet, returned: h.draw().returned };
}

export const LINES = BALANCE.slots.lines;
