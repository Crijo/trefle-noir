import { describe, expect, it } from 'vitest';
import {
  BlackjackRound,
  DEFAULT_RULES,
  basicStrategy,
  dealerShouldHit,
  handValue,
  isBlackjack,
  type BlackjackRules,
  Shoe,
} from '../src/games/blackjack/logic';
import { parseCards, type Card } from '../src/games/shared/cards';
import { SeededRng } from '../src/core/rng';

/** Sabot truqué POUR LES TESTS : distribue les cartes dans l'ordre donné. */
class StackedShoe extends Shoe {
  private stack: Card[];
  constructor(order: string) {
    super(new SeededRng(1));
    this.stack = parseCards(order);
  }
  override prepare(): boolean {
    return false;
  }
  override draw(): Card {
    const c = this.stack.shift();
    if (!c) throw new Error('pile vide');
    return c;
  }
}

/** Ordre de donne : joueur, croupier, joueur, croupier, puis tirages. */
const round = (order: string, bet = 10, rules: BlackjackRules = DEFAULT_RULES) =>
  new BlackjackRound(new StackedShoe(order), bet, rules);

describe('valeur des mains', () => {
  it('compte les as comme 1 ou 11', () => {
    expect(handValue(parseCards('AS 6H'))).toEqual({ total: 17, soft: true });
    expect(handValue(parseCards('AS 6H 9C'))).toEqual({ total: 16, soft: false });
    expect(handValue(parseCards('AS AH 9C'))).toEqual({ total: 21, soft: true });
    expect(handValue(parseCards('KS QH 5C'))).toEqual({ total: 25, soft: false });
    expect(isBlackjack(parseCards('AS KD'))).toBe(true);
    expect(isBlackjack(parseCards('AS 5D 5C'))).toBe(false);
  });

  it('le croupier tire sur 16 et sur 17 souple (H17)', () => {
    expect(dealerShouldHit(parseCards('10S 6H'))).toBe(true);
    expect(dealerShouldHit(parseCards('AS 6H'))).toBe(DEFAULT_RULES.dealerHitsSoft17);
    expect(dealerShouldHit(parseCards('10S 7H'))).toBe(false);
  });
});

describe('déroulé d\'une donne', () => {
  it('blackjack naturel payé selon la règle (3:2 ou 6:5)', () => {
    const r = round('AS 9H KD 7C', 10, { ...DEFAULT_RULES, blackjackPays: 1.5 });
    expect(r.settled).toBe(true);
    expect(r.hands[0].outcome).toBe('blackjack');
    expect(r.totalReturned).toBe(25);
    const r65 = round('AS 9H KD 7C', 10, { ...DEFAULT_RULES, blackjackPays: 1.2 });
    expect(r65.totalReturned).toBe(22);
  });

  it('doubler après séparation selon la règle', () => {
    const das = round('8S 10H 8D 7C 3H 2S', 10, { ...DEFAULT_RULES, doubleOn: 'any', doubleAfterSplit: true });
    das.split();
    expect(das.canDouble()).toBe(true);
    const noDas = round('8S 10H 8D 7C 3H 2S', 10, { ...DEFAULT_RULES, doubleOn: 'any', doubleAfterSplit: false });
    noDas.split();
    expect(noDas.canDouble()).toBe(false);
  });

  it('blackjack contre blackjack : égalité', () => {
    const r = round('AS AH KD KC');
    expect(r.hands[0].outcome).toBe('push');
    expect(r.totalReturned).toBe(10);
  });

  it('blackjack du croupier : le joueur perd sa mise initiale seulement', () => {
    const r = round('9S AH 9D KC');
    expect(r.settled).toBe(true);
    expect(r.hands[0].outcome).toBe('lose');
    expect(r.totalStaked).toBe(10);
  });

  it('tirer puis dépasser 21', () => {
    const r = round('10S 9H 6D 8C KH');
    r.hit();
    expect(r.hands[0].outcome).toBe('bust');
    expect(r.totalReturned).toBe(0);
    // Le croupier ne tire pas si toutes les mains ont sauté.
    expect(r.dealer).toHaveLength(2);
  });

  it('rester et gagner contre un croupier qui saute', () => {
    const r = round('10S 6H 9D 10C 8H');
    r.stand();
    expect(r.dealer).toHaveLength(3);
    expect(r.hands[0].outcome).toBe('win');
    expect(r.totalReturned).toBe(20);
  });

  it('égalité rend la mise', () => {
    const r = round('10S 10H 8D 8C');
    r.stand();
    expect(r.hands[0].outcome).toBe('push');
    expect(r.totalReturned).toBe(10);
  });

  it('doubler : une seule carte, mise doublée', () => {
    const r = round('6S 6H 5D 10C 10H 9S');
    expect(r.canDouble()).toBe(true);
    expect(r.extraStakeFor('double')).toBe(10);
    r.double();
    expect(r.hands[0].cards).toHaveLength(3);
    expect(r.hands[0].bet).toBe(20);
    // Joueur 21, croupier 6+10+9 = 25
    expect(r.hands[0].outcome).toBe('win');
    expect(r.totalReturned).toBe(40);
  });

  it('doubler interdit hors des totaux autorisés', () => {
    const r = round('9S 6H 7D 10C', 10, { ...DEFAULT_RULES, doubleOn: [10, 11] });
    expect(r.canDouble()).toBe(false);
    const any = round('9S 6H 7D 10C', 10, { ...DEFAULT_RULES, doubleOn: 'any' });
    expect(any.canDouble()).toBe(true);
  });

  it('séparer une paire : deux mains réglées séparément', () => {
    // Joueur 8-8, croupier 10-7 ; mains : 8+3 → tire 10 = 21 ; 8+K = 18
    const r = round('8S 10H 8D 7C 3H KS 10D', 10, { ...DEFAULT_RULES, maxSplits: 1 });
    expect(r.canSplit()).toBe(true);
    r.split();
    expect(r.hands).toHaveLength(2);
    expect(r.totalStaked).toBe(20);
    expect(r.canSplit()).toBe(false);
    r.hit(); // 8+3+10 = 21 → main terminée
    r.stand(); // 8+K = 18
    expect(r.settled).toBe(true);
    expect(r.hands.map((h) => h.outcome)).toEqual(['win', 'win']);
    expect(r.totalReturned).toBe(40);
  });

  it('21 après séparation n\'est pas un blackjack', () => {
    const r = round('AS 10H AD 7C KH QS', 10, { ...DEFAULT_RULES, splitAcesOneCard: true });
    r.split();
    expect(r.settled).toBe(true);
    expect(r.hands.map((h) => h.outcome)).toEqual(['win', 'win']);
    expect(r.totalReturned).toBe(40);
  });

  it('les as séparés ne reçoivent qu\'une carte', () => {
    const r = round('AS 10H AD 9C 2H 3S');
    r.split();
    expect(r.settled).toBe(true);
    expect(r.hands.every((h) => h.cards.length === 2)).toBe(true);
  });

  it('refuse les actions illégales', () => {
    const r = round('10S 6H 9D 10C 8H');
    expect(() => r.split()).toThrow();
    r.stand();
    expect(() => r.hit()).toThrow();
  });
});

describe('stratégie de base', () => {
  it('cas classiques', () => {
    expect(basicStrategy(round('8S 6H 8D 10C'))).toBe('split');
    expect(basicStrategy(round('6S 6H 5D 10C'))).toBe('double'); // 11 contre 6
    expect(basicStrategy(round('10S 7H 6D 10C'))).toBe('hit'); // 16 contre 7
    expect(basicStrategy(round('10S 5H 6D 10C'))).toBe('stand'); // 16 contre 5
    expect(basicStrategy(round('10S 10H 10D 10C'))).toBe('stand'); // 20, jamais séparer
  });
});
