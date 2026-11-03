import { BALANCE } from '../config/balance';

export interface RoundParams {
  round: number;
  debt: number;
  /** Avance versée au début de la manche. */
  capital: number;
  timeSec: number;
  /** Multiplicateur appliqué aux limites de table de la manche 1. */
  stakeScale: number;
}

/** Arrondi « joli » : 2 chiffres significatifs, multiple de `step`. */
export function niceRound(value: number, step = 10): number {
  if (value <= step) return step;
  const mag = Math.pow(10, Math.floor(Math.log10(value)) - 1);
  const q = Math.max(step, mag);
  return Math.round(value / q) * q;
}

export function roundParams(round: number, cfg = BALANCE.rounds): RoundParams {
  const k = round - 1;
  return {
    round,
    debt: niceRound(cfg.debtBase * Math.pow(cfg.debtGrowth, k), 50),
    capital: niceRound(cfg.capitalBase * Math.pow(cfg.capitalGrowth, k), 50),
    timeSec: Math.max(cfg.timeMinSec, cfg.timeBaseSec + cfg.timeStepSec * k),
    stakeScale: Math.pow(cfg.stakeGrowth, k),
  };
}

/** Limites d'une table pour une manche donnée (multiples de `limitRounding`). */
export function scaleLimit(base: number, round: number): number {
  const scaled = base * roundParams(round).stakeScale;
  return niceRound(scaled, BALANCE.limitRounding);
}

export interface TableLimits {
  min: number;
  max: number;
}

export function tableLimits(baseMin: number, baseMax: number, round: number): TableLimits {
  const min = scaleLimit(baseMin, round);
  const max = Math.max(min, scaleLimit(baseMax, round));
  return { min, max };
}

/** Jetons utilisables entre min et max (on garde au moins un jeton). */
export function chipsFor(limits: TableLimits): number[] {
  const list = BALANCE.chips.filter((c) => c >= limits.min && c <= limits.max);
  return list.length ? list : [limits.min];
}
