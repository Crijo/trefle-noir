import { shuffle, type Rng } from '../../core/rng';

export type Suit = 'S' | 'H' | 'D' | 'C';
/** 2..10, 11 = Valet, 12 = Dame, 13 = Roi, 14 = As. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SUIT_GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' };

export function rankLabel(r: Rank): string {
  const faces: Record<number, string> = { 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
  return faces[r] ?? String(r);
}

export function cardLabel(c: Card): string {
  return rankLabel(c.rank) + SUIT_GLYPH[c.suit];
}

export function isRed(c: Card): boolean {
  return c.suit === 'H' || c.suit === 'D';
}

export function newDeck(decks = 1): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++)
    for (const suit of SUITS) for (const rank of RANKS) out.push({ rank, suit });
  return out;
}

export function shuffledDeck(rng: Rng, decks = 1): Card[] {
  return shuffle(newDeck(decks), rng);
}

/** Notation compacte pour les tests : "AS", "10H", "KD", "2C"… (R/D/V acceptés). */
export function parseCard(s: string): Card {
  const suit = s.slice(-1).toUpperCase() as Suit;
  const r = s.slice(0, -1).toUpperCase();
  const map: Record<string, Rank> = { A: 14, K: 13, R: 13, Q: 12, D: 12, J: 11, V: 11, T: 10 };
  const rank = (map[r] ?? Number(r)) as Rank;
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) throw new Error(`carte invalide: ${s}`);
  return { rank, suit };
}

export function parseCards(s: string): Card[] {
  return s.trim().split(/\s+/).map(parseCard);
}
