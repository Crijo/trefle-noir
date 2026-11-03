import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLOT_CONFIG,
  PAYLINES,
  SlotMachine,
  buildStrip,
  evaluateLine,
  evaluateWindow,
  exactSlotStats,
  type Window,
} from '../src/games/slots/logic';
import { SLOT_LINE_PAYS, SLOT_REEL_COUNTS, SLOT_SCATTER_PAYS, type SlotSymbol } from '../src/config/balance';
import { BALANCE } from '../src/config/balance';
import { SeededRng } from '../src/core/rng';

const seq = (s: string) => s.split(' ') as SlotSymbol[];

describe('machine à sous', () => {
  it('évalue les lignes de gauche à droite avec les jokers', () => {
    expect(evaluateLine(seq('HAT HAT HAT DICE DICE'))).toEqual({ symbol: 'HAT', count: 3, multiplier: SLOT_LINE_PAYS.HAT[0] });
    expect(evaluateLine(seq('W HAT HAT HAT DICE'))).toEqual({ symbol: 'HAT', count: 4, multiplier: SLOT_LINE_PAYS.HAT[1] });
    expect(evaluateLine(seq('DICE HAT HAT HAT HAT'))).toBeNull();
    expect(evaluateLine(seq('S HAT HAT HAT HAT'))).toBeNull();
    expect(evaluateLine(seq('W W W W W'))).toEqual({ symbol: 'W', count: 5, multiplier: SLOT_LINE_PAYS.W[2] });
    // W W W CHERRY CHERRY : 3 jokers (50) < 5 cerises ? on garde le meilleur
    const w = evaluateLine(seq('W W W CHERRY CHERRY'))!;
    expect(w.multiplier).toBe(Math.max(SLOT_LINE_PAYS.W[0], SLOT_LINE_PAYS.CHERRY[2]));
    expect(evaluateLine(seq('CHERRY CHERRY S CHERRY CHERRY'))).toBeNull();
  });

  it('paie les dispersions n\'importe où, sur la mise totale', () => {
    const win: Window = [
      ['S', 'DICE', 'GLASS'],
      ['CIGAR', 'S', 'GLASS'],
      ['DICE', 'CIGAR', 'S'],
      ['GLASS', 'DICE', 'CIGAR'],
      ['CIGAR', 'GLASS', 'DICE'],
    ];
    const r = evaluateWindow(win, 2);
    expect(r.scatterCount).toBe(3);
    expect(r.scatterMultiplier).toBe(SLOT_SCATTER_PAYS[3]);
    expect(r.returned).toBe(SLOT_SCATTER_PAYS[3] * 2 * PAYLINES.length);
  });

  it('additionne les gains de plusieurs lignes', () => {
    const win: Window = Array.from({ length: 5 }, () => ['HAT', 'HAT', 'HAT'] as SlotSymbol[]);
    const r = evaluateWindow(win, 1);
    expect(r.lineWins).toHaveLength(PAYLINES.length);
    expect(r.returned).toBe(PAYLINES.length * SLOT_LINE_PAYS.HAT[2]);
  });

  it('construit des bandes conformes à la configuration', () => {
    const strip = buildStrip(SLOT_REEL_COUNTS[0]);
    const total = Object.values(SLOT_REEL_COUNTS[0]).reduce((a, b) => a + b, 0);
    expect(strip).toHaveLength(total);
    expect(strip.filter((s) => s === 'W')).toHaveLength(SLOT_REEL_COUNTS[0].W);
  });

  it('le RTP exact est dans la cible et confirmé par Monte-Carlo', () => {
    const exact = exactSlotStats(DEFAULT_SLOT_CONFIG).rtp;
    expect(exact).toBeGreaterThanOrEqual(BALANCE.targets.rtpMin);
    expect(exact).toBeLessThanOrEqual(BALANCE.targets.rtpMax);
    // Vérification croisée : moyenne des lignes seules (variance plus faible).
    const m = new SlotMachine();
    const rng = new SeededRng(11);
    let lineSum = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const r = m.spin(rng, 1);
      lineSum += r.lineWins.reduce((s, w) => s + w.multiplier, 0);
    }
    const lineRtp = lineSum / N / m.lines;
    expect(Math.abs(lineRtp - exactSlotStats().lineRtp)).toBeLessThan(0.06);
  });
});
