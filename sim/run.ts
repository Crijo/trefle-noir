/**
 * Simulation Monte-Carlo : RTP et volatilité de chaque jeu (≥ 1 000 000 coups),
 * puis taux de réussite des premières manches avec des stratégies simples.
 *   npm run sim          → simulation complète (écrit sim/results.md)
 *   npm run sim:quick    → version rapide (100 000 coups) pour itérer
 */
import { writeFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { SeededRng, type Rng } from '../src/core/rng';
import { roundParams } from '../src/core/rounds';
import { theoreticalRtp, type BetKind } from '../src/games/roulette/logic';
import { exactSlotStats } from '../src/games/slots/logic';
import {
  blackjackLimits,
  rouletteLimits,
  slotLimits,
  videoPokerLimits,
} from '../src/games/limits';
import {
  BlackjackEngine,
  SlotEngine,
  playRoulette,
  playVideoPoker,
  type PlayResult,
} from './engines';

const QUICK = process.argv.includes('--quick');
const N = QUICK ? 100_000 : 1_000_000;
const TRIALS = QUICK ? 4_000 : 20_000;
const SEED = 20261103;

/* --------------------------- 1. RTP / volatilité --------------------------- */

interface GameStats {
  name: string;
  risk: string;
  n: number;
  rtp: number;
  ci95: number;
  sd: number;
  hitRate: number;
  winRate: number;
  maxWin: number;
  theoretical?: number;
}

function measure(name: string, risk: string, play: () => PlayResult, theoretical?: number): GameStats {
  let sum = 0;
  let sq = 0;
  let staked = 0;
  let hits = 0;
  let wins = 0;
  let maxWin = 0;
  for (let i = 0; i < N; i++) {
    const r = play();
    // Multiple de la mise totale engagée sur ce coup.
    const x = r.returned / r.staked;
    staked += r.staked;
    sum += r.returned;
    // Écart-type exprimé en mises initiales (UNIT).
    const net = (r.returned - r.staked) / UNIT;
    sq += net * net;
    if (r.returned > 0) hits++;
    if (r.returned > r.staked) wins++;
    if (x > maxWin) maxWin = x;
  }
  const rtp = sum / staked;
  const meanNet = (sum - staked) / UNIT / N;
  const sd = Math.sqrt(sq / N - meanNet * meanNet);
  return {
    name,
    risk,
    n: N,
    rtp,
    ci95: (1.96 * sd) / Math.sqrt(N) / (staked / UNIT / N),
    sd,
    hitRate: hits / N,
    winRate: wins / N,
    maxWin,
    theoretical,
  };
}

const UNIT = 10;

function gameStats(): GameStats[] {
  const rng = new SeededRng(SEED);
  const bj = new BlackjackEngine(rng);
  const slots = new SlotEngine(rng);
  const kinds: [string, string, BetKind][] = [
    ['Roulette – rouge/noir', 'faible', { type: 'red' }],
    ['Roulette – douzaine', 'moyen', { type: 'dozen', d: 2 }],
    ['Roulette – numéro plein', 'élevé', { type: 'straight', n: 17 }],
  ];
  const out: GameStats[] = [];
  for (const [name, risk, k] of kinds)
    out.push(measure(name, risk, () => playRoulette(rng, k, UNIT), theoreticalRtp(k)));
  out.push(measure('Blackjack (stratégie de base)', 'faible', () => bj.play(UNIT)));
  out.push(measure('Vidéo poker 9/5 (stratégie simple)', 'moyen', () => playVideoPoker(rng, UNIT)));
  out.push(
    measure('Machine à sous 5×3, 10 lignes', 'élevé', () => slots.play(UNIT), exactSlotStats().rtp),
  );
  return out;
}

/* --------------------------- 2. Manches simulées --------------------------- */

type Game = 'roulette' | 'blackjack' | 'slots' | 'videoPoker';

interface Ctx {
  money: number;
  debt: number;
  round: number;
  rng: Rng;
  bj: BlackjackEngine;
  slots: SlotEngine;
}

interface Strategy {
  name: string;
  /** Choisit un jeu et une mise, ou null pour ne rien faire. */
  next(c: Ctx): { game: Game; bet: number; kind?: BetKind } | null;
}

const limitsOf = (g: Game, round: number) =>
  g === 'roulette'
    ? rouletteLimits(round)
    : g === 'blackjack'
      ? blackjackLimits(round)
      : g === 'slots'
        ? slotLimits(round)
        : videoPokerLimits(round);

/** Plus grande mise permise ≤ souhait, multiple de `step`. */
function clampBet(g: Game, round: number, money: number, wish: number): number {
  const { min, max } = limitsOf(g, round);
  const step = g === 'slots' ? slotLimits(round).min : BALANCE.limitRounding;
  let b = Math.min(max, money, Math.max(min, wish));
  b = Math.floor(b / step) * step;
  return b >= min ? b : 0;
}

const flat = (name: string, game: Game, kind?: BetKind, fraction = 1): Strategy => ({
  name,
  next: (c) => {
    const max = limitsOf(game, c.round).max;
    const bet = clampBet(game, c.round, c.money, max * fraction);
    return bet ? { game, bet, kind } : null;
  },
});

const STRATEGIES: Strategy[] = [
  flat('Rouge, mise max', 'roulette', { type: 'red' }),
  flat('Douzaine, mise max', 'roulette', { type: 'dozen', d: 1 }),
  flat('Numéro plein, ¼ de la mise max', 'roulette', { type: 'straight', n: 7 }, 0.25),
  flat('Blackjack, mise max', 'blackjack'),
  flat('Blackjack, mise min (prudent)', 'blackjack', undefined, 0),
  flat('Vidéo poker, mise max', 'videoPoker'),
  flat('Machine à sous, mise max', 'slots'),
  flat('Machine à sous, ⅓ de la mise max', 'slots', undefined, 1 / 3),
  {
    name: 'Adaptatif (douzaine, puis rouge pour la somme manquante)',
    next: (c) => {
      const need = c.debt - c.money;
      const rl = rouletteLimits(c.round);
      if (need <= rl.max) {
        const bet = clampBet('roulette', c.round, c.money, need);
        if (bet) return { game: 'roulette', bet, kind: { type: 'red' } };
      }
      const bet = clampBet('roulette', c.round, c.money, rl.max);
      return bet ? { game: 'roulette', bet, kind: { type: 'dozen', d: 3 } } : null;
    },
  },
];

function playOnce(c: Ctx, g: Game, bet: number, kind?: BetKind): PlayResult {
  switch (g) {
    case 'roulette':
      return playRoulette(c.rng, kind ?? { type: 'red' }, bet);
    case 'blackjack':
      return c.bj.play(bet, c.money);
    case 'slots':
      return c.slots.play(bet);
    case 'videoPoker':
      return playVideoPoker(c.rng, bet);
  }
}

/** Joue une manche ; renvoie l'argent restant après remboursement, ou null si perdue. */
function simulateRound(s: Strategy, c: Ctx): number | null {
  const p = roundParams(c.round);
  c.debt = p.debt;
  let time = p.timeSec;
  for (;;) {
    if (c.money >= c.debt) return c.money - c.debt;
    const move = s.next(c);
    if (!move) return null; // plus assez pour la mise minimale
    const tempo = BALANCE.simTempoSec[move.game];
    if (time < tempo) return null; // le temps est écoulé
    time -= tempo;
    const r = playOnce(c, move.game, move.bet, move.kind);
    c.money += r.returned - r.staked;
  }
}

interface RoundStats {
  strategy: string;
  /** Réussite de la manche r en partant seulement de l'avance (sans report). */
  isolated: number[];
  /** Probabilité d'avoir remboursé les manches 1..r d'affilée. */
  campaign: number[];
}

const MAX_ROUND = 6;

function roundStats(): RoundStats[] {
  return STRATEGIES.map((s, si) => {
    const rng = new SeededRng(SEED + 100 + si);
    const mk = (round: number, money: number): Ctx => ({
      money,
      debt: 0,
      round,
      rng,
      bj: new BlackjackEngine(rng),
      slots: new SlotEngine(rng),
    });
    const isolated: number[] = [];
    for (let r = 1; r <= MAX_ROUND; r++) {
      let ok = 0;
      for (let t = 0; t < TRIALS; t++)
        if (simulateRound(s, mk(r, roundParams(r).capital)) !== null) ok++;
      isolated.push(ok / TRIALS);
    }
    const reached = new Array(MAX_ROUND).fill(0);
    const ctx = mk(1, 0);
    for (let t = 0; t < TRIALS; t++) {
      let money = 0;
      for (let r = 1; r <= MAX_ROUND; r++) {
        ctx.round = r;
        ctx.money = money + roundParams(r).capital;
        const left = simulateRound(s, ctx);
        if (left === null) break;
        reached[r - 1]++;
        money = left;
      }
    }
    return { strategy: s.name, isolated, campaign: reached.map((v) => v / TRIALS) };
  });
}

/* ------------------------------- Rapport ---------------------------------- */

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)} %`;

function report(games: GameStats[], rounds: RoundStats[]): string {
  const L: string[] = [];
  L.push(`# Résultats de simulation`);
  L.push('');
  L.push(`Graine ${SEED} · ${N.toLocaleString('fr-FR')} coups par jeu · ${TRIALS.toLocaleString('fr-FR')} manches par stratégie et par manche.`);
  L.push('');
  L.push('## RTP et volatilité');
  L.push('');
  L.push('| Jeu | Risque | RTP mesuré | IC 95 % | RTP théorique | Écart-type / coup (× mise) | Coups gagnants | Gain max (× mise) |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const g of games)
    L.push(
      `| ${g.name} | ${g.risk} | ${pct(g.rtp)} | ± ${pct(g.ci95)} | ${g.theoretical ? pct(g.theoretical) : '—'} | ${g.sd.toFixed(2)} | ${pct(g.winRate, 1)} | ${g.maxWin.toFixed(0)} |`,
    );
  const rtps = games.map((g) => g.theoretical ?? g.rtp);
  const spread = Math.max(...rtps) - Math.min(...rtps);
  L.push('');
  L.push(`Écart entre le meilleur et le moins bon RTP : **${pct(spread)}** (objectif ≤ ${pct(BALANCE.targets.rtpSpreadMax, 0)}).`);
  const { rtpMin, rtpMax, rtpSpreadMax } = BALANCE.targets;
  const inRange = rtps.every((r) => r >= rtpMin && r <= rtpMax);
  const sds = games.map((g) => g.sd);
  const ok = inRange && spread <= rtpSpreadMax;
  L.push('');
  L.push(
    `Objectifs : RTP de chaque jeu dans [${pct(rtpMin, 0)} ; ${pct(rtpMax, 0)}] → ${inRange ? '✅' : '❌'} · écart → ${spread <= rtpSpreadMax ? '✅' : '❌'} · volatilité de ${Math.min(...sds).toFixed(2)} à ${Math.max(...sds).toFixed(2)} mise(s) par coup selon le profil de risque.`,
  );
  if (!ok) process.exitCode = 1;
  L.push('');
  L.push('## Paramètres des manches');
  L.push('');
  L.push('| Manche | Dette | Avance | Délai | Mise max roulette / blackjack / poker | Mise max machine à sous |');
  L.push('|---|---|---|---|---|---|');
  for (let r = 1; r <= MAX_ROUND; r++) {
    const p = roundParams(r);
    L.push(
      `| ${r} | ${p.debt} $ | ${p.capital} $ | ${p.timeSec} s | ${rouletteLimits(r).max} / ${blackjackLimits(r).max} / ${videoPokerLimits(r).max} $ | ${slotLimits(r).max} $ |`,
    );
  }
  L.push('');
  L.push('## Taux de réussite par manche (manche jouée seule, avec la seule avance)');
  L.push('');
  L.push(`| Stratégie | ${Array.from({ length: MAX_ROUND }, (_, i) => `M${i + 1}`).join(' | ')} |`);
  L.push(`|---|${'---|'.repeat(MAX_ROUND)}`);
  for (const r of rounds) L.push(`| ${r.strategy} | ${r.isolated.map((x) => pct(x, 1)).join(' | ')} |`);
  L.push('');
  L.push('## Campagne : probabilité d\'avoir remboursé les manches 1 à r d\'affilée (argent restant reporté)');
  L.push('');
  L.push(`| Stratégie | ${Array.from({ length: MAX_ROUND }, (_, i) => `≤M${i + 1}`).join(' | ')} |`);
  L.push(`|---|${'---|'.repeat(MAX_ROUND)}`);
  for (const r of rounds) L.push(`| ${r.strategy} | ${r.campaign.map((x) => pct(x, 1)).join(' | ')} |`);
  L.push('');
  L.push(`Hypothèses de tempo (s/coup) : ${Object.entries(BALANCE.simTempoSec).map(([k, v]) => `${k} ${v}`).join(', ')}. Paiement de la dette dès que l'argent suffit.`);
  return L.join('\n');
}

const t0 = Date.now();
const games = gameStats();
const rounds = roundStats();
const md = report(games, rounds);
console.log(md);
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (!QUICK) writeFileSync(new URL('./results.md', import.meta.url), md + '\n');
