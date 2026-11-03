import { BALANCE } from '../../config/balance';
import { chipsFor } from '../../core/rounds';
import { actionButton, cardEl, chipClass, shortMoney } from '../../ui/components';
import { h, isAbort, money, motion, sleep } from '../../ui/dom';
import { blackjackLimits } from '../limits';
import type { GameContext, GameModule, GameView } from '../types';
import { BlackjackRound, Shoe, cardPoints, handValue, type Action, type HandOutcome } from './logic';

const ID = 'blackjack';
const RULES = BALANCE.blackjack;

const OUTCOME_LABEL: Record<HandOutcome, string> = {
  blackjack: 'Blackjack !',
  win: 'Gagné',
  push: 'Égalité',
  lose: 'Perdu',
  bust: 'Sauté',
};

/** 1.5 → « 3:2 », 1.2 → « 6:5 ». */
function ratio(x: number): string {
  for (let d = 1; d <= 10; d++) if (Number.isInteger(+(x * d).toFixed(6))) return `${Math.round(x * d)}:${d}`;
  return String(x);
}

export function rulesSummary(): string[] {
  const d = RULES.doubleOn === 'any' ? 'Doubler sur n\'importe quelles 2 cartes' : `Doubler sur ${RULES.doubleOn.join(', ')} uniquement`;
  return [
    `Le blackjack paie ${ratio(RULES.blackjackPays)}`,
    RULES.dealerHitsSoft17 ? 'Le croupier tire sur 17 souple' : 'Le croupier reste sur tous les 17',
    d,
    `${RULES.maxSplits === 1 ? 'Une seule séparation' : `Jusqu'à ${RULES.maxSplits} séparations`}${RULES.doubleAfterSplit ? '' : ', sans doubler ensuite'}`,
    'Pas d\'assurance',
  ];
}

class BlackjackView implements GameView {
  el: HTMLElement;
  private limits;
  private chips: number[];
  private shoe: Shoe;
  private round: BlackjackRound | null = null;
  private bet: number;
  private busy = false;
  private shown: number[] = [];
  private dealerShown = 0;
  private holeShown = false;

  private dealerCards: HTMLElement;
  private dealerTotal: HTMLElement;
  private handsEl: HTMLElement;
  private messageEl: HTMLElement;
  private betEl: HTMLElement;
  private betRow: HTMLElement;
  private actionRow: HTMLElement;
  private chipButtons: HTMLButtonElement[] = [];
  private dealBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private btn: Record<Action, HTMLButtonElement>;
  private unsub: () => void;

  constructor(private ctx: GameContext) {
    this.limits = blackjackLimits(ctx.round);
    this.chips = chipsFor(this.limits);
    this.bet = this.limits.min;
    this.shoe = new Shoe(ctx.rng);

    this.dealerCards = h('div', { class: 'bj__cards' });
    this.dealerTotal = h('span', { class: 'badge' }, '–');
    this.handsEl = h('div', { class: 'bj__hands' });
    this.messageEl = h('p', { class: 'bj__message', 'aria-live': 'polite' }, 'Choisissez votre mise puis distribuez.');

    this.betEl = h('div', { class: 'bet-total' });
    this.chipButtons = this.chips.map((v) =>
      h(
        'button',
        { class: chipClass(v, this.chips), type: 'button', 'aria-label': `Ajouter ${v} $ à la mise`, onclick: () => this.addChip(v) },
        h('span', {}, shortMoney(v)),
      ),
    );
    this.clearBtn = actionButton('Effacer', 'C', () => this.setBet(0), 'btn--ghost');
    this.dealBtn = actionButton('Distribuer', 'Espace', () => void this.deal(), 'btn--primary btn--big');
    this.betRow = h(
      'div',
      { class: 'controls__group' },
      h('div', { class: 'chip-rack' }, ...this.chipButtons),
      h('div', { class: 'controls__row' }, this.betEl, this.clearBtn),
      this.dealBtn,
    );
    this.btn = {
      hit: actionButton('Tirer', 'H', () => void this.act('hit'), 'btn--neon'),
      stand: actionButton('Rester', 'S', () => void this.act('stand'), 'btn--neon'),
      double: actionButton('Doubler', 'D', () => void this.act('double')),
      split: actionButton('Séparer', 'X', () => void this.act('split')),
    };
    this.actionRow = h(
      'div',
      { class: 'controls__row controls__row--actions', hidden: true },
      this.btn.hit,
      this.btn.stand,
      this.btn.double,
      this.btn.split,
    );

    this.el = h(
      'section',
      { class: 'game game--blackjack', 'aria-label': 'Blackjack' },
      h(
        'div',
        { class: 'felt bj__table' },
        h('p', { class: 'rules-strip' }, rulesSummary().slice(0, 3).join(' · ')),
        h('div', { class: 'bj__area' }, h('div', { class: 'bj__meta' }, h('span', { class: 'bj__label' }, 'CROUPIER'), this.dealerTotal), this.dealerCards),
        this.messageEl,
        h('div', { class: 'bj__area' }, this.handsEl, h('span', { class: 'bj__label' }, `MISE ${money(this.limits.min)} – ${money(this.limits.max)}`)),
      ),
      h('div', { class: 'controls' }, this.betRow, this.actionRow),
    );
    this.unsub = ctx.wallet.subscribe(() => this.refreshControls());
    this.render();
  }

  private addChip(v: number): void {
    if (this.round && !this.round.settled) return;
    const next = Math.min(this.limits.max, this.bet + v);
    if (next > this.ctx.wallet.balance) return this.ctx.toast('Pas assez d\'argent pour cette mise.');
    if (this.bet + v > this.limits.max) this.ctx.toast(`Mise maximale : ${money(this.limits.max)}`);
    this.setBet(next);
    this.ctx.sound.play('chip');
  }

  private setBet(v: number): void {
    if (this.busy || (this.round && !this.round.settled)) return;
    this.bet = v;
    this.refreshControls();
  }

  private async deal(): Promise<void> {
    if (this.busy || (this.round && !this.round.settled)) return;
    const bal = this.ctx.wallet.balance;
    if (this.bet > bal) this.bet = Math.floor(bal / 10) * 10;
    if (this.bet < this.limits.min) return this.ctx.toast(`Mise minimale : ${money(this.limits.min)}`);
    this.ctx.wallet.take(ID, this.bet);
    this.round = new BlackjackRound(this.shoe, this.bet);
    this.shown = [0];
    this.dealerShown = 0;
    this.holeShown = false;
    this.messageEl.textContent = '';
    await this.animate(true);
  }

  private async act(a: Action): Promise<void> {
    const r = this.round;
    if (this.busy || !r || r.settled) return;
    if (!r.legalActions().includes(a)) return;
    const extra = r.extraStakeFor(a);
    if (extra > 0) {
      if (!this.ctx.wallet.canAfford(extra)) return this.ctx.toast('Pas assez d\'argent pour ça.');
      this.ctx.wallet.take(ID, extra);
    }
    const active = r.active;
    r.apply(a);
    if (a === 'split') {
      this.shown[active] = 1;
      this.shown.splice(active + 1, 0, 1);
    }
    this.ctx.sound.play(a === 'stand' ? 'click' : 'chip');
    await this.animate(false);
  }

  /** Révèle progressivement les cartes déjà tirées par la logique. */
  private async animate(initial: boolean): Promise<void> {
    const r = this.round!;
    this.busy = true;
    this.refreshControls();
    const step = motion(RULES.dealMs, 0);
    const signal = this.ctx.signal;
    const show = async () => {
      this.render();
      this.ctx.sound.play('card');
      if (step) await sleep(step, signal);
    };
    try {
      if (initial) {
        this.shown[0] = 1;
        await show();
        this.dealerShown = 1;
        await show();
        this.shown[0] = 2;
        await show();
        this.dealerShown = 2;
        await show();
      }
      for (let i = 0; i < r.hands.length; i++) {
        while ((this.shown[i] ?? 0) < r.hands[i].cards.length) {
          this.shown[i] = (this.shown[i] ?? 0) + 1;
          await show();
        }
      }
      if (r.revealed && !this.holeShown) {
        this.holeShown = true;
        await show();
        while (this.dealerShown < r.dealer.length) {
          this.dealerShown++;
          await show();
        }
      }
    } catch (e) {
      if (isAbort(e)) return;
      throw e;
    }
    this.busy = false;
    if (r.settled) this.finish();
    this.render();
  }

  private finish(): void {
    const r = this.round!;
    this.ctx.wallet.settle(ID, r.totalReturned);
    const net = r.totalReturned - r.totalStaked;
    const natural = r.hands.some((x) => x.outcome === 'blackjack');
    if (net > 0) {
      this.ctx.sound.play(natural ? 'bigWin' : 'win');
      this.messageEl.textContent = `Vous gagnez ${money(net)}.`;
    } else if (net === 0) {
      this.messageEl.textContent = 'Égalité, mise rendue.';
    } else {
      this.ctx.sound.play('lose');
      this.messageEl.textContent = `Le croupier empoche ${money(-net)}.`;
    }
    // La mise suivante reste la même si on peut se la permettre.
    this.bet = Math.min(this.bet, Math.floor(this.ctx.wallet.balance / 10) * 10);
    this.ctx.changed();
  }

  private render(): void {
    const r = this.round;
    // Croupier
    const dealerEls: HTMLElement[] = [];
    if (r) {
      for (let i = 0; i < this.dealerShown; i++) {
        const hidden = i === 1 && !this.holeShown;
        const isNew = this.dealerCards.children.length <= i;
        const flip = i === 1 && this.holeShown && this.dealerCards.children[1]?.classList.contains('card--back');
        dealerEls.push(cardEl(hidden ? null : r.dealer[i], isNew ? 'card--deal' : flip ? 'card--flip' : ''));
      }
    }
    this.dealerCards.replaceChildren(...dealerEls);
    if (r && this.dealerShown > 0) {
      const visible = this.holeShown ? r.dealer.slice(0, this.dealerShown) : [r.dealer[0]];
      this.dealerTotal.textContent = this.holeShown ? String(handValue(visible).total) : String(cardPoints(visible[0]));
    } else this.dealerTotal.textContent = '–';

    // Joueur
    const prev = [...this.handsEl.querySelectorAll('.bj__cards')].map((c) => c.children.length);
    const hands = r
      ? r.hands.map((hand, i) => {
          const n = this.shown[i] ?? 0;
          const cards = h('div', { class: 'bj__cards' });
          for (let k = 0; k < n; k++) cards.append(cardEl(hand.cards[k], k >= (prev[i] ?? 0) ? 'card--deal' : ''));
          const v = handValue(hand.cards.slice(0, n));
          const done = r.settled && !this.busy && hand.outcome;
          return h(
            'div',
            { class: `bj__hand ${!r.settled && i === r.active && r.hands.length > 1 ? 'bj__hand--active' : ''}` },
            cards,
            h(
              'div',
              { class: 'bj__meta' },
              h('span', { class: 'badge' }, n ? `${v.soft && v.total < 21 ? 'souple ' : ''}${v.total}` : '–'),
              h('span', { class: `${chipClass(this.chips[0], this.chips)} chip--mini` }, h('span', {}, shortMoney(hand.bet))),
              done ? h('span', { class: `outcome outcome--${hand.outcome}` }, OUTCOME_LABEL[hand.outcome!]) : null,
            ),
          );
        })
      : [h('div', { class: 'bj__hand' }, h('div', { class: 'bj__cards' }))];
    this.handsEl.replaceChildren(...hands);

    if (r && !r.settled && !this.busy) {
      const h0 = r.current!;
      const v = handValue(h0.cards);
      this.messageEl.textContent = `${r.hands.length > 1 ? `Main ${r.active + 1} : ` : ''}${v.total} contre ${cardPoints(r.dealerUp) === 11 ? 'un as' : cardPoints(r.dealerUp)}`;
    }
    this.refreshControls();
  }

  private refreshControls(): void {
    const r = this.round;
    const inHand = !!r && !r.settled;
    this.betRow.hidden = inHand;
    this.actionRow.hidden = !inHand;
    const bal = this.ctx.wallet.balance;
    this.betEl.replaceChildren(h('span', { class: 'bet-total__label' }, 'Mise'), h('strong', {}, money(this.bet)));
    this.chipButtons.forEach((b, i) => (b.disabled = this.busy || this.bet >= this.limits.max || this.bet + this.chips[i] > bal));
    this.dealBtn.disabled = this.busy || this.bet < this.limits.min || this.bet > bal;
    this.clearBtn.disabled = this.busy || this.bet === 0;
    if (inHand) {
      const legal = r!.legalActions();
      for (const a of Object.keys(this.btn) as Action[]) {
        const extra = r!.extraStakeFor(a);
        this.btn[a].disabled = this.busy || !legal.includes(a) || extra > bal;
      }
    }
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') {
      void this.deal();
      return true;
    }
    const map: Record<string, Action> = { h: 'hit', s: 'stand', d: 'double', x: 'split' };
    if (map[k]) {
      void this.act(map[k]);
      return true;
    }
    if (k === 'c') {
      this.setBet(0);
      return true;
    }
    if (k === '+' || k === 'arrowup') {
      this.addChip(this.chips[0]);
      return true;
    }
    if (k === '-' || k === 'arrowdown') {
      this.setBet(Math.max(0, this.bet - this.chips[0]));
      return true;
    }
    return false;
  }

  rules(): Node {
    return h(
      'div',
      { class: 'rules' },
      h('p', {}, 'Approchez 21 sans le dépasser et battez le croupier. Les figures valent 10, l\'as vaut 1 ou 11.'),
      h('ul', {}, ...rulesSummary().map((t) => h('li', {}, t))),
      h(
        'ul',
        {},
        h('li', {}, h('strong', {}, 'Tirer'), ' : prendre une carte.'),
        h('li', {}, h('strong', {}, 'Rester'), ' : garder sa main.'),
        h('li', {}, h('strong', {}, 'Doubler'), ' : doubler la mise, recevoir une seule carte.'),
        h('li', {}, h('strong', {}, 'Séparer'), ' : une paire devient deux mains, chacune avec la mise initiale. Les as séparés ne reçoivent qu\'une carte ; 21 après séparation n\'est pas un blackjack.'),
      ),
      h('p', {}, `Gain normal 1:1, égalité = mise rendue. Sabot de ${RULES.decks} jeux. Retour au joueur ≈ 98,3 % avec la stratégie de base. Mise ${money(this.limits.min)} – ${money(this.limits.max)}.`),
    );
  }

  destroy(): void {
    this.unsub();
  }
}

export const blackjackModule: GameModule = {
  id: ID,
  name: 'Blackjack',
  risk: 'low',
  icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="11" height="16" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(-10 8.5 12)"/><rect x="10" y="4" width="11" height="16" rx="1.6" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="1.5" transform="rotate(8 15.5 12)"/><path d="M15.6 9.2c-1.4 1.3-2.6 2.2-2.6 3.3 0 .9.7 1.4 1.4 1.4.5 0 .9-.2 1.2-.6-.1.7-.4 1.3-.9 1.7h1.8c-.5-.4-.8-1-.9-1.7.3.4.7.6 1.2.6.7 0 1.4-.5 1.4-1.4 0-1.1-1.2-2-2.6-3.3z" fill="currentColor"/></svg>`,
  minBet: (round) => blackjackLimits(round).min,
  keys: [
    ['Espace', 'Distribuer'],
    ['H', 'Tirer'],
    ['S', 'Rester'],
    ['D', 'Doubler'],
    ['X', 'Séparer'],
    ['+ / −', 'Ajuster la mise'],
    ['C', 'Effacer la mise'],
  ],
  create: (ctx) => new BlackjackView(ctx),
};
