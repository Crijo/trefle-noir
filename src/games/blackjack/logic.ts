import { BALANCE } from '../../config/balance';
import type { Rng } from '../../core/rng';
import { shuffledDeck, type Card } from '../shared/cards';

export interface BlackjackRules {
  decks: number;
  reshufflePenetration: number;
  blackjackPays: number;
  dealerHitsSoft17: boolean;
  doubleOn: readonly number[] | 'any';
  doubleAfterSplit: boolean;
  maxSplits: number;
  splitAcesOneCard: boolean;
}

export const DEFAULT_RULES: BlackjackRules = BALANCE.blackjack;

export function cardPoints(c: Card): number {
  if (c.rank === 14) return 11;
  return c.rank >= 10 ? 10 : c.rank;
}

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c);
    if (c.rank === 14) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** Sabot de plusieurs jeux, remélangé quand il descend sous la pénétration fixée. */
export class Shoe {
  private cards: Card[] = [];
  constructor(
    private readonly rng: Rng,
    private readonly rules: BlackjackRules = DEFAULT_RULES,
  ) {
    this.reshuffle();
  }

  reshuffle(): void {
    this.cards = shuffledDeck(this.rng, this.rules.decks);
  }

  get remaining(): number {
    return this.cards.length;
  }

  /** À appeler avant chaque donne. */
  prepare(): boolean {
    if (this.cards.length < this.rules.decks * 52 * this.rules.reshufflePenetration) {
      this.reshuffle();
      return true;
    }
    return false;
  }

  draw(): Card {
    const c = this.cards.pop();
    if (!c) throw new Error('sabot vide');
    return c;
  }
}

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface PlayerHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  fromSplit: boolean;
  outcome?: HandOutcome;
  returned?: number;
}

export type Action = 'hit' | 'stand' | 'double' | 'split';

/** Une donne de blackjack, de la distribution jusqu'au règlement. */
export class BlackjackRound {
  readonly dealer: Card[] = [];
  readonly hands: PlayerHand[] = [];
  active = 0;
  settled = false;
  /** Le croupier a-t-il retourné sa carte cachée ? */
  revealed = false;
  private splits = 0;

  constructor(
    private readonly shoe: Shoe,
    bet: number,
    readonly rules: BlackjackRules = DEFAULT_RULES,
  ) {
    shoe.prepare();
    const hand: PlayerHand = { cards: [], bet, doubled: false, done: false, fromSplit: false };
    this.hands.push(hand);
    hand.cards.push(shoe.draw());
    this.dealer.push(shoe.draw());
    hand.cards.push(shoe.draw());
    this.dealer.push(shoe.draw());

    const dealerBj = isBlackjack(this.dealer);
    if (dealerBj || isBlackjack(hand.cards)) {
      // Le croupier vérifie immédiatement son blackjack (pas d'assurance).
      hand.done = true;
      this.finish();
    }
  }

  get current(): PlayerHand | undefined {
    return this.settled ? undefined : this.hands[this.active];
  }

  get dealerUp(): Card {
    return this.dealer[0];
  }

  /** Total des mises engagées (doublements et séparations compris). */
  get totalStaked(): number {
    return this.hands.reduce((s, h) => s + h.bet, 0);
  }

  get totalReturned(): number {
    return this.hands.reduce((s, h) => s + (h.returned ?? 0), 0);
  }

  canHit(): boolean {
    return !!this.current && handValue(this.current.cards).total < 21;
  }

  canStand(): boolean {
    return !!this.current;
  }

  canDouble(): boolean {
    const h = this.current;
    if (!h || h.cards.length !== 2) return false;
    if (h.fromSplit && !this.rules.doubleAfterSplit) return false;
    if (this.rules.doubleOn === 'any') return true;
    const v = handValue(h.cards);
    return !v.soft && this.rules.doubleOn.includes(v.total);
  }

  canSplit(): boolean {
    const h = this.current;
    if (!h || h.cards.length !== 2 || this.splits >= this.rules.maxSplits) return false;
    return cardPoints(h.cards[0]) === cardPoints(h.cards[1]);
  }

  /** Montant supplémentaire à miser pour doubler ou séparer (0 sinon). */
  extraStakeFor(action: Action): number {
    if (action === 'double' && this.canDouble()) return this.current!.bet;
    if (action === 'split' && this.canSplit()) return this.current!.bet;
    return 0;
  }

  legalActions(): Action[] {
    const out: Action[] = [];
    if (this.canHit()) out.push('hit');
    if (this.canStand()) out.push('stand');
    if (this.canDouble()) out.push('double');
    if (this.canSplit()) out.push('split');
    return out;
  }

  hit(): void {
    const h = this.need(this.canHit());
    h.cards.push(this.shoe.draw());
    if (handValue(h.cards).total >= 21) this.endHand();
  }

  stand(): void {
    this.need(this.canStand());
    this.endHand();
  }

  double(): void {
    const h = this.need(this.canDouble());
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(this.shoe.draw());
    this.endHand();
  }

  split(): void {
    const h = this.need(this.canSplit());
    this.splits++;
    const aces = h.cards[0].rank === 14;
    const second: PlayerHand = {
      cards: [h.cards.pop()!],
      bet: h.bet,
      doubled: false,
      done: false,
      fromSplit: true,
    };
    h.fromSplit = true;
    h.cards.push(this.shoe.draw());
    second.cards.push(this.shoe.draw());
    this.hands.splice(this.active + 1, 0, second);
    if (aces && this.rules.splitAcesOneCard) {
      h.done = true;
      second.done = true;
      this.active = this.hands.length;
      this.finish();
      return;
    }
    if (handValue(h.cards).total === 21) this.endHand();
  }

  apply(action: Action): void {
    switch (action) {
      case 'hit':
        return this.hit();
      case 'stand':
        return this.stand();
      case 'double':
        return this.double();
      case 'split':
        return this.split();
    }
  }

  private need(ok: boolean): PlayerHand {
    if (!ok || !this.current) throw new Error('action impossible');
    return this.current;
  }

  private endHand(): void {
    const h = this.hands[this.active];
    h.done = true;
    this.active++;
    // La main suivante (après séparation) peut déjà valoir 21.
    while (this.active < this.hands.length && handValue(this.hands[this.active].cards).total === 21) {
      this.hands[this.active].done = true;
      this.active++;
    }
    if (this.active >= this.hands.length) this.finish();
  }

  private finish(): void {
    this.revealed = true;
    const playerNatural = this.hands.length === 1 && isBlackjack(this.hands[0].cards);
    const dealerNatural = isBlackjack(this.dealer);
    const anyLive = this.hands.some((h) => handValue(h.cards).total <= 21);
    if (anyLive && !playerNatural && !dealerNatural) {
      while (dealerShouldHit(this.dealer, this.rules)) this.dealer.push(this.shoe.draw());
    }
    const d = handValue(this.dealer).total;
    for (const h of this.hands) {
      const p = handValue(h.cards).total;
      const natural = playerNatural && !h.fromSplit;
      if (p > 21) settle(h, 'bust', 0);
      else if (natural && dealerNatural) settle(h, 'push', h.bet);
      else if (natural) settle(h, 'blackjack', h.bet * (1 + this.rules.blackjackPays));
      else if (dealerNatural) settle(h, 'lose', 0);
      else if (d > 21 || p > d) settle(h, 'win', h.bet * 2);
      else if (p === d) settle(h, 'push', h.bet);
      else settle(h, 'lose', 0);
    }
    this.settled = true;
  }
}

function settle(h: PlayerHand, outcome: HandOutcome, returned: number): void {
  h.outcome = outcome;
  h.returned = returned;
  h.done = true;
}

export function dealerShouldHit(cards: Card[], rules: BlackjackRules = DEFAULT_RULES): boolean {
  const v = handValue(cards);
  return v.total < 17 || (v.total === 17 && v.soft && rules.dealerHitsSoft17);
}

/* ------------------------------------------------------------------ */
/* Stratégie de base (sabot multi-jeux, H17) — utilisée par la simu    */
/* ------------------------------------------------------------------ */

type Move = 'H' | 'S' | 'D' | 'Ds' | 'P';

/** Renvoie l'action recommandée parmi les actions légales de la donne. */
export function basicStrategy(round: BlackjackRound): Action {
  const h = round.current;
  if (!h) throw new Error('aucune main active');
  const up = cardPoints(round.dealerUp) === 11 ? 11 : cardPoints(round.dealerUp);
  const move = strategyMove(h.cards, up, round.rules, round.canSplit());
  const canD = round.canDouble();
  if (move === 'P') return 'split';
  if (move === 'D') return canD ? 'double' : 'hit';
  if (move === 'Ds') return canD ? 'double' : 'stand';
  return move === 'H' ? 'hit' : 'stand';
}

function strategyMove(cards: Card[], up: number, rules: BlackjackRules, canSplit: boolean): Move {
  const das = rules.doubleAfterSplit;
  if (canSplit && cards.length === 2) {
    const p = cardPoints(cards[0]);
    const inR = (a: number, b: number) => up >= a && up <= b;
    switch (p) {
      case 11:
      case 8:
        return 'P';
      case 9:
        if (inR(2, 6) || up === 8 || up === 9) return 'P';
        break;
      case 7:
        if (inR(2, 7)) return 'P';
        break;
      case 6:
        if (das ? inR(2, 6) : inR(3, 6)) return 'P';
        break;
      case 4:
        if (das && inR(5, 6)) return 'P';
        break;
      case 3:
      case 2:
        if (das ? inR(2, 7) : inR(4, 7)) return 'P';
        break;
    }
  }
  const { total, soft } = handValue(cards);
  if (soft) {
    if (total >= 20) return 'S';
    if (total === 19) return up === 6 && rules.dealerHitsSoft17 ? 'Ds' : 'S';
    if (total === 18) {
      if (up >= 2 && up <= 6) return up === 2 && !rules.dealerHitsSoft17 ? 'S' : 'Ds';
      return up <= 8 ? 'S' : 'H';
    }
    if (total === 17) return up >= 3 && up <= 6 ? 'D' : 'H';
    if (total >= 15) return up >= 4 && up <= 6 ? 'D' : 'H';
    return up >= 5 && up <= 6 ? 'D' : 'H';
  }
  if (total >= 17) return 'S';
  if (total >= 13) return up <= 6 ? 'S' : 'H';
  if (total === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
  if (total === 11) return up === 11 && !rules.dealerHitsSoft17 ? 'H' : 'D';
  if (total === 10) return up <= 9 ? 'D' : 'H';
  if (total === 9) return up >= 3 && up <= 6 ? 'D' : 'H';
  return 'H';
}
