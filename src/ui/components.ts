import { h } from './dom';
import { SUIT_GLYPH, SUIT_NAME, isRed, rankLabel, type Card } from '../games/shared/cards';

export function shortMoney(v: number): string {
  if (v >= 1000) return `${+(v / 1000).toFixed(v % 1000 ? 1 : 0)}k`;
  return String(v);
}

const CHIP_COLORS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

/** Couleur d'un jeton selon sa position dans la gamme de jetons. */
export function chipClass(value: number, all: readonly number[]): string {
  const i = Math.max(0, all.indexOf(value));
  return `chip chip--${CHIP_COLORS[i % CHIP_COLORS.length]}`;
}

/** Sélecteur de jetons : un bouton par valeur, un seul actif. */
export class ChipRack {
  readonly el: HTMLElement;
  private buttons: HTMLButtonElement[] = [];
  selected: number;

  constructor(
    private values: number[],
    private onPick: (v: number) => void,
    label = 'Valeur du jeton',
  ) {
    this.selected = values[0];
    this.el = h('div', { class: 'chip-rack', role: 'radiogroup', 'aria-label': label });
    this.render();
  }

  private render(): void {
    this.el.replaceChildren();
    this.buttons = this.values.map((v) => {
      const b = h(
        'button',
        {
          class: chipClass(v, this.values),
          type: 'button',
          role: 'radio',
          'aria-checked': String(v === this.selected),
          'aria-label': `Jeton de ${v} $`,
          onclick: () => this.pick(v),
        },
        h('span', {}, shortMoney(v)),
      );
      return b;
    });
    this.el.append(...this.buttons);
  }

  pick(v: number): void {
    if (!this.values.includes(v)) return;
    this.selected = v;
    this.buttons.forEach((b, i) => b.setAttribute('aria-checked', String(this.values[i] === v)));
    this.onPick(v);
  }

  /** Jeton suivant / précédent (raccourcis clavier). */
  step(dir: 1 | -1): void {
    const i = this.values.indexOf(this.selected);
    const j = Math.min(this.values.length - 1, Math.max(0, i + dir));
    this.pick(this.values[j]);
  }

  setDisabled(maxAffordable: number): void {
    this.buttons.forEach((b, i) => (b.disabled = this.values[i] > maxAffordable));
  }
}

/** Carte à jouer dessinée en CSS. `null` = dos de carte. */
export function cardEl(card: Card | null, extra = ''): HTMLElement {
  if (!card) return h('div', { class: `card card--back ${extra}`, 'aria-label': 'Carte cachée' });
  const r = rankLabel(card.rank);
  const s = SUIT_GLYPH[card.suit];
  const face = card.rank >= 11 && card.rank <= 13;
  return h(
    'div',
    {
      class: `card ${isRed(card) ? 'card--red' : 'card--black'} ${face ? 'card--face' : ''} ${extra}`,
      role: 'img',
      'aria-label': `${r} de ${SUIT_NAME[card.suit]}`,
    },
    h('span', { class: 'card__corner card__corner--tl' }, h('b', {}, r), h('i', {}, s)),
    h('span', { class: 'card__pip' }, face ? r : s),
    h('span', { class: 'card__corner card__corner--br' }, h('b', {}, r), h('i', {}, s)),
  );
}

/** Bouton d'action standard (≥ 44 px), avec raccourci affiché. */
export function actionButton(
  label: string,
  key: string | null,
  onClick: () => void,
  cls = '',
  /** Icône affichée à la place du texte sur petit écran (classe btn--compact). */
  icon?: string,
): HTMLButtonElement {
  return h(
    'button',
    { class: `btn ${cls}`, type: 'button', onclick: onClick, 'data-icon': icon, title: icon ? label : undefined, 'aria-label': icon ? label : undefined },
    h('span', {}, label),
    key ? h('kbd', { 'aria-hidden': 'true' }, key) : null,
  );
}
