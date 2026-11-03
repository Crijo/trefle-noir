import { BALANCE } from '../config/balance';
import { niceRound, roundParams, tableLimits, type TableLimits } from '../core/rounds';

/** Limites de table par manche, partagées par l'interface et la simulation. */
export const rouletteLimits = (round: number): TableLimits =>
  tableLimits(BALANCE.roulette.minBet, BALANCE.roulette.maxBet, round);

export const blackjackLimits = (round: number): TableLimits =>
  tableLimits(BALANCE.blackjack.minBet, BALANCE.blackjack.maxBet, round);

export const videoPokerLimits = (round: number): TableLimits =>
  tableLimits(BALANCE.videoPoker.minBet, BALANCE.videoPoker.maxBet, round);

/** Mises par ligne disponibles (mise totale = mise par ligne × nombre de lignes). */
export function slotLineBets(round: number): number[] {
  const scale = roundParams(round).stakeScale;
  const list = BALANCE.slots.lineBets.map((b) => niceRound(b * scale, 1));
  return [...new Set(list)].sort((a, b) => a - b);
}

export const slotLimits = (round: number): TableLimits => {
  const lb = slotLineBets(round);
  return { min: lb[0] * BALANCE.slots.lines, max: lb[lb.length - 1] * BALANCE.slots.lines };
};
