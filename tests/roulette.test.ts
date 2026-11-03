import { describe, expect, it } from 'vitest';
import {
  RED_NUMBERS,
  WHEEL_ORDER,
  betKey,
  colorOf,
  covers,
  parseBetKey,
  resolve,
  spin,
  theoreticalRtp,
  type BetKind,
} from '../src/games/roulette/logic';
import { SeededRng } from '../src/core/rng';

describe('roulette européenne', () => {
  it('a 37 cases, 18 rouges, chaque numéro une fois sur la roue', () => {
    expect(WHEEL_ORDER).toHaveLength(37);
    expect(new Set(WHEEL_ORDER).size).toBe(37);
    expect(RED_NUMBERS.size).toBe(18);
    expect(colorOf(0)).toBe('green');
    expect(colorOf(1)).toBe('red');
    expect(colorOf(2)).toBe('black');
  });

  it('les paris extérieurs perdent sur le 0', () => {
    const kinds: BetKind[] = [
      { type: 'red' },
      { type: 'black' },
      { type: 'even' },
      { type: 'odd' },
      { type: 'low' },
      { type: 'high' },
      { type: 'dozen', d: 1 },
      { type: 'column', c: 3 },
    ];
    for (const k of kinds) expect(covers(k, 0)).toBe(false);
    expect(covers({ type: 'straight', n: 0 }, 0)).toBe(true);
  });

  it('douzaines et colonnes couvrent 12 numéros chacune', () => {
    for (const d of [1, 2, 3] as const) {
      const n = Array.from({ length: 37 }, (_, i) => i).filter((i) => covers({ type: 'dozen', d }, i));
      expect(n).toHaveLength(12);
    }
    expect(covers({ type: 'column', c: 1 }, 34)).toBe(true);
    expect(covers({ type: 'column', c: 3 }, 36)).toBe(true);
    expect(covers({ type: 'dozen', d: 3 }, 25)).toBe(true);
  });

  it('calcule les paiements : plein 35:1, douzaine 2:1, chances simples 1:1', () => {
    const r = resolve(
      [
        { kind: { type: 'straight', n: 17 }, amount: 10 },
        { kind: { type: 'black' }, amount: 20 },
        { kind: { type: 'dozen', d: 2 }, amount: 30 },
        { kind: { type: 'even' }, amount: 40 },
      ],
      17,
    );
    expect(r.staked).toBe(100);
    // 17 est noir, impair, 2e douzaine
    expect(r.returned).toBe(10 * 36 + 20 * 2 + 30 * 3);
    expect(r.winners).toHaveLength(3);
  });

  it('chaque pari a un RTP théorique de 36/37', () => {
    for (const k of [
      { type: 'straight', n: 5 },
      { type: 'red' },
      { type: 'dozen', d: 1 },
      { type: 'column', c: 2 },
    ] as BetKind[])
      expect(theoreticalRtp(k)).toBeCloseTo(36 / 37, 10);
  });

  it('les clés de paris sont réversibles', () => {
    for (const k of [
      { type: 'straight', n: 36 },
      { type: 'dozen', d: 2 },
      { type: 'column', c: 1 },
      { type: 'odd' },
    ] as BetKind[])
      expect(parseBetKey(betKey(k))).toEqual(k);
  });

  it('le tirage est uniforme (graine fixe)', () => {
    const rng = new SeededRng(42);
    const counts = new Array(37).fill(0);
    for (let i = 0; i < 74_000; i++) counts[spin(rng)]++;
    for (const c of counts) expect(Math.abs(c - 2000)).toBeLessThan(250);
  });
});
