import { BALANCE } from '../../config/balance';
import type { Rng } from '../../core/rng';
import { shuffledDeck, type Card } from '../shared/cards';

export type HandRank =
  | 'royalFlush'
  | 'straightFlush'
  | 'fourOfAKind'
  | 'fullHouse'
  | 'flush'
  | 'straight'
  | 'threeOfAKind'
  | 'twoPair'
  | 'jacksOrBetter'
  | 'nothing';

export const HAND_ORDER: Exclude<HandRank, 'nothing'>[] = [
  'royalFlush',
  'straightFlush',
  'fourOfAKind',
  'fullHouse',
  'flush',
  'straight',
  'threeOfAKind',
  'twoPair',
  'jacksOrBetter',
];

export const HAND_NAMES: Record<HandRank, string> = {
  royalFlush: 'Quinte flush royale',
  straightFlush: 'Quinte flush',
  fourOfAKind: 'Carré',
  fullHouse: 'Full',
  flush: 'Couleur',
  straight: 'Quinte',
  threeOfAKind: 'Brelan',
  twoPair: 'Deux paires',
  jacksOrBetter: 'Paire de valets ou mieux',
  nothing: 'Rien',
};

export type Paytable = Record<Exclude<HandRank, 'nothing'>, number>;
export const DEFAULT_PAYTABLE: Paytable = BALANCE.videoPoker.paytable;

function rankCounts(cards: Card[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

function isStraightRanks(ranks: number[]): boolean {
  const u = [...new Set(ranks)].sort((a, b) => a - b);
  if (u.length !== 5) return false;
  if (u[4] - u[0] === 4) return true;
  // Quinte basse A-2-3-4-5
  return u[4] === 14 && u[0] === 2 && u[3] === 5;
}

export function evaluate(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error('5 cartes requises');
  const counts = [...rankCounts(cards).entries()];
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const ranks = cards.map((c) => c.rank);
  const straight = isStraightRanks(ranks);
  if (flush && straight) {
    const min = Math.min(...ranks);
    return min === 10 ? 'royalFlush' : 'straightFlush';
  }
  const shape = counts.map(([, n]) => n).sort((a, b) => b - a);
  if (shape[0] === 4) return 'fourOfAKind';
  if (shape[0] === 3 && shape[1] === 2) return 'fullHouse';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (shape[0] === 3) return 'threeOfAKind';
  if (shape[0] === 2 && shape[1] === 2) return 'twoPair';
  if (shape[0] === 2) {
    const pair = counts.find(([, n]) => n === 2)![0];
    if (pair >= 11) return 'jacksOrBetter';
  }
  return 'nothing';
}

/** Retour total (mise incluse) pour une main finale. */
export function payout(rank: HandRank, bet: number, table: Paytable = DEFAULT_PAYTABLE): number {
  return rank === 'nothing' ? 0 : table[rank] * bet;
}

/** Une main de vidéo poker : donne de 5 cartes puis un seul tirage. */
export class PokerHand {
  private deck: Card[];
  cards: Card[];
  held: boolean[] = [false, false, false, false, false];
  drawn = false;

  constructor(
    rng: Rng,
    readonly bet: number,
    readonly table: Paytable = DEFAULT_PAYTABLE,
  ) {
    this.deck = shuffledDeck(rng, 1);
    this.cards = this.deck.splice(0, 5);
  }

  toggle(i: number): void {
    if (this.drawn) return;
    this.held[i] = !this.held[i];
  }

  setHolds(mask: boolean[]): void {
    if (this.drawn) return;
    this.held = mask.slice(0, 5);
  }

  draw(): { rank: HandRank; returned: number } {
    if (this.drawn) throw new Error('déjà tiré');
    this.drawn = true;
    this.cards = this.cards.map((c, i) => (this.held[i] ? c : this.deck.shift()!));
    return this.result();
  }

  result(): { rank: HandRank; returned: number } {
    const rank = evaluate(this.cards);
    return { rank, returned: payout(rank, this.bet, this.table) };
  }
}

/* ------------------------------------------------------------------ */
/* Stratégie simple « Jacks or Better » (proche de l'optimale)          */
/* ------------------------------------------------------------------ */

const HIGH = (r: number) => r >= 11;

function idx(cards: Card[], pred: (c: Card) => boolean): number[] {
  const out: number[] = [];
  cards.forEach((c, i) => pred(c) && out.push(i));
  return out;
}

function mask(indices: number[]): boolean[] {
  const m = [false, false, false, false, false];
  for (const i of indices) m[i] = true;
  return m;
}

/** Meilleure sous-main de n cartes de même couleur parmi les rangs donnés. */
function suitedSubset(cards: Card[], n: number, ok: (ranks: number[]) => boolean): number[] | null {
  let best: number[] | null = null;
  let bestScore = -1;
  const combos = combinations([0, 1, 2, 3, 4], n);
  for (const c of combos) {
    const s = cards[c[0]].suit;
    if (!c.every((i) => cards[i].suit === s)) continue;
    const ranks = c.map((i) => cards[i].rank);
    if (!ok(ranks)) continue;
    const score = ranks.filter(HIGH).length * 10 + Math.max(...ranks);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function combinations(arr: number[], k: number): number[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [h, ...t] = arr;
  return [...combinations(t, k - 1).map((c) => [h, ...c]), ...combinations(t, k)];
}

/** Les rangs (A compté haut ou bas) tiennent-ils dans une fenêtre de 5 ? */
function straightWindow(ranks: number[]): boolean {
  if (new Set(ranks).size !== ranks.length) return false;
  const span = (rs: number[]) => Math.max(...rs) - Math.min(...rs) <= 4;
  return span(ranks) || (ranks.includes(14) && span(ranks.map((r) => (r === 14 ? 1 : r))));
}

const ROYAL = (ranks: number[]) => ranks.every((r) => r >= 10);

/** Retourne le masque de cartes à garder. */
export function simpleStrategy(cards: Card[]): boolean[] {
  const rank = evaluate(cards);
  const all = [true, true, true, true, true];
  if (rank === 'royalFlush' || rank === 'straightFlush' || rank === 'fourOfAKind') {
    if (rank === 'fourOfAKind') {
      const quad = [...rankCounts(cards)].find(([, n]) => n === 4)![0];
      return mask(idx(cards, (c) => c.rank === quad));
    }
    return all;
  }
  const r4 = suitedSubset(cards, 4, ROYAL);
  if (r4) return mask(r4);
  if (rank === 'fullHouse' || rank === 'flush' || rank === 'straight') return all;
  const counts = rankCounts(cards);
  if (rank === 'threeOfAKind') {
    const t = [...counts].find(([, n]) => n === 3)![0];
    return mask(idx(cards, (c) => c.rank === t));
  }
  const sf4 = suitedSubset(cards, 4, straightWindow);
  if (sf4) return mask(sf4);
  if (rank === 'twoPair') {
    return mask(idx(cards, (c) => counts.get(c.rank) === 2));
  }
  if (rank === 'jacksOrBetter') {
    const p = [...counts].find(([, n]) => n === 2)![0];
    return mask(idx(cards, (c) => c.rank === p));
  }
  const r3 = suitedSubset(cards, 3, ROYAL);
  if (r3) return mask(r3);
  const fl4 = suitedSubset(cards, 4, () => true);
  if (fl4) return mask(fl4);
  const lowPair = [...counts].find(([, n]) => n === 2);
  if (lowPair) return mask(idx(cards, (c) => c.rank === lowPair[0]));
  const outside = outsideStraight4(cards);
  if (outside) return mask(outside);
  const hs2 = suitedSubset(cards, 2, (rs) => rs.every(HIGH));
  if (hs2) return mask(hs2);
  const sf3 = suitedSubset(cards, 3, straightWindow);
  if (sf3) return mask(sf3);
  const highs = idx(cards, (c) => HIGH(c.rank)).sort((a, b) => cards[a].rank - cards[b].rank);
  if (highs.length >= 2) {
    // Plusieurs hautes cartes dépareillées : garder les deux plus basses.
    return mask(highs.slice(0, 2));
  }
  const t10 = suitedSubset(cards, 2, (rs) => rs.includes(10) && rs.some((r) => r >= 11 && r <= 13));
  if (t10) return mask(t10);
  if (highs.length === 1) return mask(highs);
  return [false, false, false, false, false];
}

/** 4 cartes consécutives ouvertes des deux côtés (ex. 5-6-7-8, pas A-2-3-4 ni V-D-R-A). */
function outsideStraight4(cards: Card[]): number[] | null {
  for (const c of combinations([0, 1, 2, 3, 4], 4)) {
    const rs = c.map((i) => cards[i].rank).sort((a, b) => a - b);
    if (new Set(rs).size === 4 && rs[3] - rs[0] === 3 && rs[0] >= 2 && rs[3] <= 13) return c;
  }
  return null;
}
