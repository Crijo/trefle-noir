import { BALANCE } from '../../config/balance';
import type { Rng } from '../../core/rng';

/** Ordre des cases sur une roue européenne (sens horaire, à partir du 0). */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type NumberColor = 'red' | 'black' | 'green';

export function colorOf(n: number): NumberColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export type BetKind =
  | { type: 'straight'; n: number }
  | { type: 'red' }
  | { type: 'black' }
  | { type: 'even' }
  | { type: 'odd' }
  | { type: 'low' }
  | { type: 'high' }
  | { type: 'dozen'; d: 1 | 2 | 3 }
  | { type: 'column'; c: 1 | 2 | 3 };

export interface Bet {
  kind: BetKind;
  amount: number;
}

/** Clé stable pour regrouper les jetons posés sur une même case. */
export function betKey(k: BetKind): string {
  switch (k.type) {
    case 'straight':
      return `n${k.n}`;
    case 'dozen':
      return `d${k.d}`;
    case 'column':
      return `c${k.c}`;
    default:
      return k.type;
  }
}

export function parseBetKey(key: string): BetKind {
  const v = Number(key.slice(1));
  if (key[0] === 'n' && /^n\d+$/.test(key)) return { type: 'straight', n: v };
  if (/^d[123]$/.test(key)) return { type: 'dozen', d: v as 1 | 2 | 3 };
  if (/^c[123]$/.test(key)) return { type: 'column', c: v as 1 | 2 | 3 };
  if (['red', 'black', 'even', 'odd', 'low', 'high'].includes(key))
    return { type: key } as BetKind;
  throw new Error(`pari inconnu: ${key}`);
}

export function covers(k: BetKind, n: number): boolean {
  if (k.type === 'straight') return k.n === n;
  if (n === 0) return false;
  switch (k.type) {
    case 'red':
      return RED_NUMBERS.has(n);
    case 'black':
      return !RED_NUMBERS.has(n);
    case 'even':
      return n % 2 === 0;
    case 'odd':
      return n % 2 === 1;
    case 'low':
      return n <= 18;
    case 'high':
      return n >= 19;
    case 'dozen':
      return Math.ceil(n / 12) === k.d;
    case 'column':
      return ((n - 1) % 3) + 1 === k.c;
  }
}

/** Gain « pour 1 » (hors mise) d'un pari gagnant. */
export function payoutOdds(k: BetKind, p = BALANCE.roulette.payouts): number {
  if (k.type === 'straight') return p.straight;
  if (k.type === 'dozen') return p.dozen;
  if (k.type === 'column') return p.column;
  return p.even;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export function betRisk(k: BetKind): RiskLevel {
  if (k.type === 'straight') return 'high';
  if (k.type === 'dozen' || k.type === 'column') return 'medium';
  return 'low';
}

export function spin(rng: Rng): number {
  return rng.int(37);
}

export interface Resolution {
  result: number;
  staked: number;
  /** Total rendu au joueur (mises gagnantes comprises). */
  returned: number;
  winners: { bet: Bet; returned: number }[];
}

export function resolve(bets: Bet[], result: number): Resolution {
  let staked = 0;
  let returned = 0;
  const winners: Resolution['winners'] = [];
  for (const bet of bets) {
    staked += bet.amount;
    if (covers(bet.kind, result)) {
      const r = bet.amount * (payoutOdds(bet.kind) + 1);
      returned += r;
      winners.push({ bet, returned: r });
    }
  }
  return { result, staked, returned, winners };
}

/** RTP théorique exact d'un pari (indépendant de la mise). */
export function theoreticalRtp(k: BetKind): number {
  let win = 0;
  for (let n = 0; n <= 36; n++) if (covers(k, n)) win++;
  return (win * (payoutOdds(k) + 1)) / 37;
}
