import type { Rng } from '../core/rng';
import type { Wallet } from '../core/wallet';
import type { Sound } from '../ui/sound';

export type Risk = 'low' | 'medium' | 'high' | 'variable';

export const RISK_LABEL: Record<Risk, string> = {
  low: 'Risque faible',
  medium: 'Risque moyen',
  high: 'Risque élevé',
  variable: 'Risque au choix',
};

/** Services offerts par l'application à un jeu, pour une manche donnée. */
export interface GameContext {
  wallet: Wallet;
  rng: Rng;
  sound: Sound;
  round: number;
  /** Interrompu quand la manche se termine : les animations en cours s'arrêtent. */
  signal: AbortSignal;
  /** Demande à l'application de revérifier l'état de la partie (après un coup). */
  changed(): void;
  toast(message: string, kind?: 'win' | 'lose' | 'info'): void;
  openModal(title: string, body: Node): void;
}

/** Instance d'un jeu affichée dans la zone de jeu. */
export interface GameView {
  el: HTMLElement;
  /** Contenu de la fenêtre « Règles ». */
  rules(): Node;
  /** Raccourci clavier propre au jeu ; renvoie true s'il a été traité. */
  onKey?(e: KeyboardEvent): boolean;
  onShow?(): void;
  destroy?(): void;
}

/**
 * Définition d'un jeu. Pour ajouter un jeu : écrire sa logique pure (logic.ts),
 * sa vue (view.ts) puis l'ajouter à la liste de `registry.ts`.
 */
export interface GameModule {
  id: string;
  name: string;
  risk: Risk;
  /** Icône SVG (balisage) pour l'onglet. */
  icon: string;
  /** Mise minimale à la manche donnée (sert à détecter la faillite). */
  minBet(round: number): number;
  /** Raccourcis affichés dans l'aide : [touche, description]. */
  keys: [string, string][];
  create(ctx: GameContext): GameView;
}
