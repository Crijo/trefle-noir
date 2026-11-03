import type { GameModule } from './types';
import { rouletteModule } from './roulette/view';
import { blackjackModule } from './blackjack/view';
import { slotsModule } from './slots/view';
import { videoPokerModule } from './videopoker/view';

/** Liste des jeux du casino, dans l'ordre des onglets. Ajouter un jeu ici suffit. */
export const GAMES: GameModule[] = [rouletteModule, blackjackModule, slotsModule, videoPokerModule];

export const globalMinBet = (round: number): number =>
  Math.min(...GAMES.map((g) => g.minBet(round)));
