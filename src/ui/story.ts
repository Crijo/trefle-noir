/** Textes d'ambiance : les mafieux et leurs messages. Personnages originaux. */
import { money } from './dom';

export interface Mobster {
  name: string;
  title: string;
}

export const MOBSTERS: Mobster[] = [
  { name: 'Carmine Valetti', title: 'le Don' },
  { name: 'Frankie « Deux-Doigts »', title: 'le recouvreur' },
  { name: 'Louie Malacarne', title: 'le comptable' },
  { name: 'Mama Rosa', title: 'la banque de la Famille' },
  { name: 'Sal « le Tailleur »', title: 'l\'homme de main' },
];

export function mobsterFor(round: number): Mobster {
  return MOBSTERS[(round - 1) % MOBSTERS.length];
}

const INTRO: ((d: string, t: string) => string)[] = [
  (d, t) => `Tu me dois ${d}, petit. Je te laisse ${t} et une avance pour te refaire au tapis. Pas une minute de plus.`,
  (d, t) => `Le Don a revu ses taux. Maintenant c'est ${d}. Tu as ${t}. Je repasserai… avec des amis.`,
  (d, t) => `${d}. C'est le chiffre. ${t}, c'est le délai. Le reste, c'est ton problème — et tes rotules.`,
  (d, t) => `Je n'aime pas attendre. ${d} sur ma table dans ${t}. Joue vite, joue bien.`,
  (d, t) => `Un costume sur mesure, ça coûte cher. Un cercueil aussi. ${d}, ${t}. Choisis.`,
];

const PAID = [
  'Ça, c\'est un homme de parole. Pour cette fois.',
  'Le compte est bon. Mais la Famille a toujours faim.',
  'Joli. Ne prends pas l\'habitude de nous faire attendre.',
  'Tu as de la chance. Et la chance, ça s\'use.',
  'Payé rubis sur l\'ongle. On se reverra très vite.',
];

const LOST_TIME = 'Le temps est écoulé. Frankie a garé la voiture devant le casino…';
const LOST_BROKE = 'Plus un sou, même pas de quoi miser un jeton. La Famille n\'aime pas les fauchés.';

export function introMessage(round: number, debt: number, timeSec: number): string {
  const t = timeSec >= 60 ? `${Math.floor(timeSec / 60)} min${timeSec % 60 ? ` ${timeSec % 60} s` : ''}` : `${timeSec} s`;
  return INTRO[(round - 1) % INTRO.length](money(debt), t);
}

export const paidMessage = (round: number): string => PAID[(round - 1) % PAID.length];
export const lostMessage = (reason: 'time' | 'broke'): string => (reason === 'time' ? LOST_TIME : LOST_BROKE);
