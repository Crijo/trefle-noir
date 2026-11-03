import { BALANCE } from '../../config/balance';
import { chipsFor } from '../../core/rounds';
import { ChipRack, actionButton, cardEl } from '../../ui/components';
import { h, isAbort, money, motion, sleep } from '../../ui/dom';
import { videoPokerLimits } from '../limits';
import type { GameContext, GameModule, GameView } from '../types';
import { HAND_NAMES, HAND_ORDER, PokerHand, type HandRank } from './logic';

const ID = 'videoPoker';
const CFG = BALANCE.videoPoker;
const HOLD_KEYS = ['z', 'x', 'c', 'v', 'b'];

class VideoPokerView implements GameView {
  el: HTMLElement;
  private limits;
  private rack: ChipRack;
  private hand: PokerHand | null = null;
  private busy = false;
  private slots: HTMLButtonElement[] = [];
  private payRows = new Map<HandRank, HTMLTableRowElement>();
  private payCells: HTMLElement[] = [];
  private resultEl: HTMLElement;
  private dealBtn: HTMLButtonElement;
  private unsub: () => void;

  constructor(private ctx: GameContext) {
    this.limits = videoPokerLimits(ctx.round);
    this.rack = new ChipRack(chipsFor(this.limits), () => this.refresh(), 'Mise');

    const table = h('table', { class: 'vp__paytable', 'aria-label': 'Table des gains' });
    const tbody = h('tbody');
    for (const r of HAND_ORDER) {
      const cell = h('td', {});
      const row = h('tr', {}, h('td', {}, HAND_NAMES[r].toUpperCase()), cell);
      this.payCells.push(cell);
      this.payRows.set(r, row);
      tbody.append(row);
    }
    table.append(tbody);

    const cards = h('div', { class: 'vp__cards' });
    for (let i = 0; i < 5; i++) {
      const b = h(
        'button',
        { class: 'vp__slot', type: 'button', 'aria-pressed': 'false', onclick: () => this.toggle(i), disabled: true },
        cardEl(null),
        h('span', { class: 'vp__hold' }, 'GARDÉE'),
      );
      this.slots.push(b);
      cards.append(b);
    }
    this.resultEl = h('p', { class: 'vp__result', 'aria-live': 'polite' }, 'Jacks or Better');
    this.dealBtn = actionButton('Distribuer', 'Espace', () => void this.next(), 'btn--primary btn--big');

    this.el = h(
      'section',
      { class: 'game game--videopoker', 'aria-label': 'Vidéo poker Jacks or Better' },
      h('div', { class: 'vp__screen' }, table, cards, this.resultEl),
      h(
        'div',
        { class: 'controls' },
        h('div', { class: 'controls__row' }, h('span', { class: 'bet-total__label' }, 'Mise'), this.rack.el),
        this.dealBtn,
      ),
    );
    this.unsub = ctx.wallet.subscribe(() => this.refresh());
    this.refresh();
  }

  private get bet(): number {
    return this.hand && !this.hand.drawn ? this.hand.bet : this.rack.selected;
  }

  private toggle(i: number): void {
    if (this.busy || !this.hand || this.hand.drawn) return;
    this.hand.toggle(i);
    this.ctx.sound.play('click');
    this.renderHolds();
  }

  private renderHolds(): void {
    this.slots.forEach((s, i) => {
      const held = !!this.hand && !this.hand.drawn && this.hand.held[i];
      s.classList.toggle('is-held', held);
      s.setAttribute('aria-pressed', String(held));
      s.disabled = this.busy || !this.hand || this.hand.drawn;
      const card = this.hand?.cards[i];
      s.setAttribute('aria-label', card ? `Carte ${i + 1}${held ? ', gardée' : ''} — toucher pour ${held ? 'relâcher' : 'garder'}` : `Carte ${i + 1}`);
    });
  }

  private refresh(): void {
    const bet = this.bet;
    HAND_ORDER.forEach((r, i) => (this.payCells[i].textContent = money(CFG.paytable[r] * bet)));
    const inHand = !!this.hand && !this.hand.drawn;
    this.rack.setDisabled(inHand || this.busy ? 0 : this.ctx.wallet.balance);
    const label = this.dealBtn.querySelector('span')!;
    label.textContent = inHand ? 'Tirer' : 'Distribuer';
    this.dealBtn.disabled = this.busy || (!inHand && this.rack.selected > this.ctx.wallet.balance);
  }

  private async next(): Promise<void> {
    if (this.busy) return;
    if (this.hand && !this.hand.drawn) return this.draw();
    return this.deal();
  }

  private async deal(): Promise<void> {
    let bet = this.rack.selected;
    if (bet > this.ctx.wallet.balance) {
      const fit = chipsFor(this.limits).filter((c) => c <= this.ctx.wallet.balance).pop();
      if (!fit) return this.ctx.toast('Pas assez d\'argent pour miser.');
      this.rack.pick(fit);
      bet = fit;
    }
    this.ctx.wallet.take(ID, bet);
    this.hand = new PokerHand(this.ctx.rng, bet);
    for (const row of this.payRows.values()) row.classList.remove('is-win');
    this.resultEl.textContent = 'Touchez les cartes à garder';
    await this.reveal([0, 1, 2, 3, 4]);
  }

  private async draw(): Promise<void> {
    const hand = this.hand!;
    const replaced = [0, 1, 2, 3, 4].filter((i) => !hand.held[i]);
    const res = hand.draw();
    await this.reveal(replaced);
    this.ctx.wallet.settle(ID, res.returned);
    if (res.rank !== 'nothing') {
      this.payRows.get(res.rank)?.classList.add('is-win');
      this.resultEl.textContent = `${HAND_NAMES[res.rank]} — ${money(res.returned)}`;
      this.ctx.sound.play(res.returned >= hand.bet * 5 ? 'bigWin' : 'win');
    } else {
      this.resultEl.textContent = 'Perdu — rejouez';
      this.ctx.sound.play('lose');
    }
    this.renderHolds();
    this.refresh();
    this.ctx.changed();
  }

  private async reveal(indices: number[]): Promise<void> {
    const hand = this.hand!;
    this.busy = true;
    this.renderHolds();
    this.refresh();
    const step = motion(CFG.dealMs, 0);
    try {
      if (step) {
        for (const i of indices) this.slots[i].replaceChildren(cardEl(null), h('span', { class: 'vp__hold' }, 'GARDÉE'));
        await sleep(step, this.ctx.signal);
      }
      for (const i of indices) {
        this.slots[i].replaceChildren(cardEl(hand.cards[i], 'card--flip'), h('span', { class: 'vp__hold' }, 'GARDÉE'));
        this.ctx.sound.play('card');
        if (step) await sleep(step, this.ctx.signal);
      }
    } catch (e) {
      if (isAbort(e)) return;
      throw e;
    }
    this.busy = false;
    this.renderHolds();
    this.refresh();
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') {
      void this.next();
      return true;
    }
    const idx = HOLD_KEYS.indexOf(k);
    if (idx >= 0) {
      this.toggle(idx);
      return true;
    }
    if (k === '+' || k === 'arrowup') {
      if (!this.hand || this.hand.drawn) this.rack.step(1);
      return true;
    }
    if (k === '-' || k === 'arrowdown') {
      if (!this.hand || this.hand.drawn) this.rack.step(-1);
      return true;
    }
    return false;
  }

  rules(): Node {
    return h(
      'div',
      { class: 'rules' },
      h('p', {}, 'Vidéo poker « Jacks or Better ». Vous recevez 5 cartes, gardez celles que vous voulez (touchez-les), puis tirez une seule fois pour remplacer les autres. La main finale est payée selon la table.'),
      h(
        'table',
        { class: 'paytable' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Main'), h('th', {}, 'Retour pour 1'))),
        h('tbody', {}, ...HAND_ORDER.map((r) => h('tr', {}, h('td', {}, HAND_NAMES[r]), h('td', { class: 'num' }, `×${CFG.paytable[r]}`)))),
      ),
      h('p', {}, 'Le retour inclut la mise : une paire de valets ou mieux rend la mise. Table « 9/5 » : retour au joueur ≈ 98,4 % avec une stratégie optimale. Risque moyen : beaucoup de petites mains, quelques gros gains rares (quinte flush royale ×800).'),
      h('p', {}, `Mise ${money(this.limits.min)} – ${money(this.limits.max)}.`),
    );
  }

  destroy(): void {
    this.unsub();
  }
}

export const videoPokerModule: GameModule = {
  id: ID,
  name: 'Vidéo poker',
  risk: 'medium',
  icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3.5" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4.5" y="6.5" width="4" height="6" rx=".6" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1"/><rect x="10" y="6.5" width="4" height="6" rx=".6" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1"/><rect x="15.5" y="6.5" width="4" height="6" rx=".6" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1"/><path d="M8 21h8M12 17.5V21" stroke="currentColor" stroke-width="1.5"/></svg>`,
  minBet: (round) => videoPokerLimits(round).min,
  keys: [
    ['Espace', 'Distribuer / tirer'],
    ['Z X C V B', 'Garder la carte 1 à 5'],
    ['+ / −', 'Changer la mise'],
  ],
  create: (ctx) => new VideoPokerView(ctx),
};
