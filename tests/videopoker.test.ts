import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYTABLE,
  PokerHand,
  evaluate,
  payout,
  simpleStrategy,
} from '../src/games/videopoker/logic';
import { parseCards } from '../src/games/shared/cards';
import { SeededRng } from '../src/core/rng';

const ev = (s: string) => evaluate(parseCards(s));
const keep = (s: string) =>
  simpleStrategy(parseCards(s))
    .map((h, i) => (h ? s.split(' ')[i] : null))
    .filter(Boolean)
    .join(' ');

describe('évaluation Jacks or Better', () => {
  it('reconnaît toutes les combinaisons', () => {
    expect(ev('AS KS QS JS 10S')).toBe('royalFlush');
    expect(ev('9H KH QH JH 10H')).toBe('straightFlush');
    expect(ev('AD 2D 3D 4D 5D')).toBe('straightFlush');
    expect(ev('7S 7H 7D 7C 2S')).toBe('fourOfAKind');
    expect(ev('7S 7H 7D 2C 2S')).toBe('fullHouse');
    expect(ev('2H 9H QH JH 5H')).toBe('flush');
    expect(ev('AS 2H 3D 4C 5S')).toBe('straight');
    expect(ev('10S JH QD KC AS')).toBe('straight');
    expect(ev('9S 9H 9D KC 2S')).toBe('threeOfAKind');
    expect(ev('9S 9H 4D 4C 2S')).toBe('twoPair');
    expect(ev('JS JH 4D 5C 2S')).toBe('jacksOrBetter');
    expect(ev('10S 10H 4D 5C 2S')).toBe('nothing');
    expect(ev('QS KH AD 2C 3S')).toBe('nothing');
  });

  it('paie selon la table 9/5 (mise incluse)', () => {
    expect(payout('royalFlush', 10)).toBe(8000);
    expect(payout('fullHouse', 10)).toBe(90);
    expect(payout('flush', 10)).toBe(50);
    expect(payout('jacksOrBetter', 10)).toBe(10);
    expect(payout('nothing', 10)).toBe(0);
    expect(DEFAULT_PAYTABLE.fullHouse).toBe(9);
  });

  it('le tirage remplace uniquement les cartes non gardées, sans doublon', () => {
    const h = new PokerHand(new SeededRng(3), 10);
    const before = [...h.cards];
    h.toggle(0);
    h.toggle(2);
    h.draw();
    expect(h.cards[0]).toEqual(before[0]);
    expect(h.cards[2]).toEqual(before[2]);
    const keys = h.cards.map((c) => `${c.rank}${c.suit}`);
    expect(new Set(keys).size).toBe(5);
    for (const i of [1, 3, 4]) expect(before.map((c) => `${c.rank}${c.suit}`)).not.toContain(keys[i]);
    expect(() => h.draw()).toThrow();
  });
});

describe('stratégie simple', () => {
  it('garde les bonnes cartes', () => {
    expect(keep('AS KS QS JS 3H')).toBe('AS KS QS JS'); // 4 à la royale
    expect(keep('AS KS QS JS 10H')).toBe('AS KS QS JS'); // casse la quinte pour la royale
    expect(keep('JS JH 4D 5C 2S')).toBe('JS JH');
    expect(keep('9S 9H 4D 4C 2S')).toBe('9S 9H 4D 4C');
    expect(keep('2H 9H QH 3H 5S')).toBe('2H 9H QH 3H'); // 4 à la couleur
    expect(keep('5S 6H 7D 8C KS')).toBe('5S 6H 7D 8C'); // quinte ouverte
    expect(keep('3S 3H 7D 8C KS')).toBe('3S 3H'); // petite paire
    expect(keep('2S 4H 7D 9C 6S').length).toBe(0); // tout jeter
  });
});
