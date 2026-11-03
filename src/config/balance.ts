/**
 * TOUS les paramètres d'équilibrage du jeu sont regroupés ici.
 * Les simulations (sim/) et les tests lisent ce même fichier : modifier une valeur
 * ici puis relancer `npm run sim` suffit pour mesurer l'effet.
 */

export const BALANCE = {
  /** Progression des manches. Valeurs de la manche r = base × croissance^(r-1). */
  rounds: {
    debtBase: 1000,
    debtGrowth: 1.4,
    /** Avance de la mafia versée au début de chaque manche (s'ajoute à l'argent restant). */
    capitalBase: 650,
    capitalGrowth: 1.3,
    timeBaseSec: 180,
    timeStepSec: -10,
    timeMinSec: 120,
    /** Les limites de table suivent la dette pour que la difficulté reste comparable. */
    stakeGrowth: 1.4,
    /** Durée de l'alerte visuelle et sonore de fin de manche. */
    warningSec: 30,
  },

  /** Jetons proposés (tous pairs → les paiements 3:2 tombent toujours juste). */
  chips: [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000],

  /** Arrondi des limites de table (multiple de). */
  limitRounding: 10,

  roulette: {
    /** Mise totale par tour (tous paris confondus), manche 1. */
    minBet: 10,
    maxBet: 150,
    /** Paiements « pour 1 » hors mise. */
    payouts: { straight: 35, dozen: 2, column: 2, even: 1 },
    spinMs: 3400,
  },

  blackjack: {
    minBet: 10,
    maxBet: 150,
    decks: 6,
    /** Le sabot est remélangé quand il reste moins de cette fraction. */
    reshufflePenetration: 0.25,
    blackjackPays: 1.2,
    dealerHitsSoft17: true,
    /** Totaux durs sur lesquels doubler est permis ('any' = toute main de 2 cartes). */
    doubleOn: 'any' as number[] | 'any',
    doubleAfterSplit: true,
    /** Nombre maximal de séparations par main (1 = deux mains au plus). */
    maxSplits: 1,
    splitAcesOneCard: true,
    dealMs: 260,
  },

  slots: {
    lines: 10,
    /** Mises par ligne proposées en manche 1 (mise totale = ligne × 10). */
    lineBets: [1, 2, 5, 10, 15],
    spinMs: 1400,
    reelStaggerMs: 180,
  },

  videoPoker: {
    minBet: 10,
    maxBet: 150,
    /** Jacks or Better « 9/5 » : retour pour 1 (mise incluse). */
    paytable: {
      royalFlush: 800,
      straightFlush: 50,
      fourOfAKind: 25,
      fullHouse: 9,
      flush: 5,
      straight: 4,
      threeOfAKind: 3,
      twoPair: 2,
      jacksOrBetter: 1,
    },
    dealMs: 140,
  },

  /** Tempo estimé d'un joueur réel (secondes par coup), utilisé par la simulation des manches. */
  simTempoSec: { roulette: 8, blackjack: 11, slots: 3.5, videoPoker: 7 },

  /** Objectifs vérifiés par la simulation. */
  targets: {
    rtpMin: 0.95,
    rtpMax: 0.99,
    /** Écart maximal toléré entre le meilleur et le moins bon RTP. */
    rtpSpreadMax: 0.02,
  },
} as const;

export type Balance = typeof BALANCE;

/* ------------------------------------------------------------------ */
/* Machine à sous : rouleaux, symboles et table des gains              */
/* ------------------------------------------------------------------ */

export type SlotSymbol = 'W' | 'S' | 'SEVEN' | 'HAT' | 'GLASS' | 'CIGAR' | 'DICE' | 'CHERRY';

/** Nombre d'exemplaires de chaque symbole sur chaque rouleau (bande circulaire). */
export const SLOT_REEL_COUNTS: Record<SlotSymbol, number>[] = [
  { W: 1, S: 2, SEVEN: 3, HAT: 3, GLASS: 4, CIGAR: 5, DICE: 4, CHERRY: 6 },
  { W: 1, S: 2, SEVEN: 3, HAT: 3, GLASS: 4, CIGAR: 5, DICE: 4, CHERRY: 6 },
  { W: 1, S: 2, SEVEN: 3, HAT: 3, GLASS: 4, CIGAR: 5, DICE: 4, CHERRY: 6 },
  { W: 1, S: 2, SEVEN: 3, HAT: 3, GLASS: 4, CIGAR: 5, DICE: 4, CHERRY: 6 },
  { W: 1, S: 2, SEVEN: 3, HAT: 3, GLASS: 4, CIGAR: 5, DICE: 4, CHERRY: 6 },
];

/** Gains en multiple de la mise PAR LIGNE, pour 3, 4 ou 5 symboles alignés depuis la gauche. */
export const SLOT_LINE_PAYS: Record<Exclude<SlotSymbol, 'S'>, [number, number, number]> = {
  W: [50, 400, 5000],
  SEVEN: [20, 150, 1500],
  HAT: [12, 60, 400],
  GLASS: [8, 30, 150],
  CIGAR: [5, 15, 60],
  DICE: [3, 12, 40],
  CHERRY: [2, 5, 15],
};

/** Gains « dispersion » (n'importe où dans la fenêtre) en multiple de la MISE TOTALE. */
export const SLOT_SCATTER_PAYS: Record<number, number> = { 3: 2, 4: 25, 5: 250 };
