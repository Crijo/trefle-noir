import {
  BALANCE,
  SLOT_LINE_PAYS,
  SLOT_REEL_COUNTS,
  SLOT_SCATTER_PAYS,
  type SlotSymbol,
} from '../../config/balance';
import type { Rng } from '../../core/rng';

export const SYMBOLS: SlotSymbol[] = ['W', 'S', 'SEVEN', 'HAT', 'GLASS', 'CIGAR', 'DICE', 'CHERRY'];
export const ROWS = 3;
export const REELS = 5;

/** Lignes de paiement : rangée (0 = haut) utilisée sur chacun des 5 rouleaux. */
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 2, 1, 0, 1],
].slice(0, BALANCE.slots.lines);

export interface SlotConfig {
  counts: Record<SlotSymbol, number>[];
  linePays: Record<Exclude<SlotSymbol, 'S'>, readonly [number, number, number]>;
  scatterPays: Record<number, number>;
  lines: number[][];
}

export const DEFAULT_SLOT_CONFIG: SlotConfig = {
  counts: SLOT_REEL_COUNTS,
  linePays: SLOT_LINE_PAYS,
  scatterPays: SLOT_SCATTER_PAYS,
  lines: PAYLINES,
};

/**
 * Construit une bande de rouleau déterministe en répartissant chaque symbole
 * régulièrement. Les dispersions sont espacées d'au moins 3 cases pour qu'un
 * rouleau n'en affiche jamais deux à la fois.
 */
export function buildStrip(counts: Record<SlotSymbol, number>): SlotSymbol[] {
  const items: { s: SlotSymbol; pos: number }[] = [];
  SYMBOLS.forEach((s, si) => {
    const n = counts[s];
    for (let k = 0; k < n; k++) items.push({ s, pos: (k + 0.5 + si * 0.071) / n });
  });
  items.sort((a, b) => a.pos - b.pos);
  const strip = items.map((i) => i.s);
  const L = strip.length;
  const sc = strip.flatMap((s, i) => (s === 'S' ? [i] : []));
  for (let a = 0; a < sc.length; a++) {
    const next = sc[(a + 1) % sc.length];
    const gap = (next - sc[a] + L) % L || L;
    if (sc.length > 1 && gap < ROWS) throw new Error('dispersions trop proches sur la bande');
  }
  return strip;
}

export function buildStrips(cfg: SlotConfig = DEFAULT_SLOT_CONFIG): SlotSymbol[][] {
  return cfg.counts.map(buildStrip);
}

export type Window = SlotSymbol[][]; // [rouleau][rangée]

export function windowAt(strips: SlotSymbol[][], stops: number[]): Window {
  return strips.map((strip, r) => {
    const L = strip.length;
    return [0, 1, 2].map((row) => strip[(stops[r] + row) % L]);
  });
}

export interface LineWin {
  line: number;
  symbol: Exclude<SlotSymbol, 'S'>;
  count: number;
  /** Multiple de la mise par ligne. */
  multiplier: number;
}

/** Gain d'une suite de 5 symboles lus de gauche à droite (W remplace tout sauf S). */
export function evaluateLine(
  seq: SlotSymbol[],
  pays: SlotConfig['linePays'] = SLOT_LINE_PAYS,
): { symbol: Exclude<SlotSymbol, 'S'>; count: number; multiplier: number } | null {
  if (seq[0] === 'S') return null;
  let wildRun = 0;
  while (wildRun < seq.length && seq[wildRun] === 'W') wildRun++;
  let best: { symbol: Exclude<SlotSymbol, 'S'>; count: number; multiplier: number } | null = null;
  if (wildRun >= 3) best = { symbol: 'W', count: wildRun, multiplier: pays.W[wildRun - 3] };
  const target = seq[wildRun];
  if (target !== undefined && target !== 'S') {
    let n = wildRun;
    while (n < seq.length && (seq[n] === target || seq[n] === 'W')) n++;
    if (n >= 3) {
      const m = pays[target as Exclude<SlotSymbol, 'S'>][n - 3];
      if (!best || m > best.multiplier) best = { symbol: target as Exclude<SlotSymbol, 'S'>, count: n, multiplier: m };
    }
  }
  return best;
}

export interface SpinResult {
  stops: number[];
  window: Window;
  lineWins: LineWin[];
  scatterCount: number;
  /** Multiple de la mise totale pour les dispersions. */
  scatterMultiplier: number;
  /** Total rendu (mise comprise dans le calcul : 0 si perdu). */
  returned: number;
}

export function evaluateWindow(
  window: Window,
  lineBet: number,
  cfg: SlotConfig = DEFAULT_SLOT_CONFIG,
): Omit<SpinResult, 'stops' | 'window'> {
  const lineWins: LineWin[] = [];
  cfg.lines.forEach((rows, li) => {
    const w = evaluateLine(
      rows.map((row, reel) => window[reel][row]),
      cfg.linePays,
    );
    if (w) lineWins.push({ line: li, ...w });
  });
  let scatterCount = 0;
  for (const reel of window) for (const s of reel) if (s === 'S') scatterCount++;
  const scatterMultiplier = cfg.scatterPays[scatterCount] ?? 0;
  const totalBet = lineBet * cfg.lines.length;
  const returned =
    lineWins.reduce((s, w) => s + w.multiplier * lineBet, 0) + scatterMultiplier * totalBet;
  return { lineWins, scatterCount, scatterMultiplier, returned };
}

export class SlotMachine {
  readonly strips: SlotSymbol[][];
  constructor(readonly cfg: SlotConfig = DEFAULT_SLOT_CONFIG) {
    this.strips = buildStrips(cfg);
  }

  get lines(): number {
    return this.cfg.lines.length;
  }

  spin(rng: Rng, lineBet: number): SpinResult {
    const stops = this.strips.map((s) => rng.int(s.length));
    const window = windowAt(this.strips, stops);
    return { stops, window, ...evaluateWindow(window, lineBet, this.cfg) };
  }
}

/**
 * RTP exact : chaque ligne lit, sur chaque rouleau, une case uniforme de la bande,
 * indépendamment des autres rouleaux → on énumère les 8^5 combinaisons de symboles.
 */
export function exactSlotStats(cfg: SlotConfig = DEFAULT_SLOT_CONFIG): {
  rtp: number;
  lineRtp: number;
  scatterRtp: number;
  lineHitRate: number;
} {
  const probs = cfg.counts.map((c) => {
    const L = SYMBOLS.reduce((s, k) => s + c[k], 0);
    return SYMBOLS.map((k) => c[k] / L);
  });
  let lineRtp = 0;
  let lineHit = 0;
  const seq: SlotSymbol[] = new Array(REELS);
  const rec = (reel: number, p: number) => {
    if (p === 0) return;
    if (reel === REELS) {
      const w = evaluateLine(seq, cfg.linePays);
      if (w) {
        lineRtp += p * w.multiplier;
        lineHit += p;
      }
      return;
    }
    for (let i = 0; i < SYMBOLS.length; i++) {
      seq[reel] = SYMBOLS[i];
      rec(reel + 1, p * probs[reel][i]);
    }
  };
  rec(0, 1);
  // Dispersions : au plus une par rouleau, visible avec probabilité 3·n/L.
  let dist = [1];
  for (const c of cfg.counts) {
    const L = SYMBOLS.reduce((s, k) => s + c[k], 0);
    const q = Math.min(1, (ROWS * c.S) / L);
    const nd = new Array(dist.length + 1).fill(0);
    dist.forEach((v, k) => {
      nd[k] += v * (1 - q);
      nd[k + 1] += v * q;
    });
    dist = nd;
  }
  const scatterRtp = dist.reduce((s, v, k) => s + v * (cfg.scatterPays[k] ?? 0), 0);
  return { rtp: lineRtp + scatterRtp, lineRtp, scatterRtp, lineHitRate: lineHit };
}
