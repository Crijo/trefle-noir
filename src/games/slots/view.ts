import { BALANCE, SLOT_LINE_PAYS, SLOT_SCATTER_PAYS, type SlotSymbol } from '../../config/balance';
import { actionButton } from '../../ui/components';
import { h, isAbort, money, prefersReducedMotion, sleep, svg } from '../../ui/dom';
import { slotLineBets } from '../limits';
import type { GameContext, GameModule, GameView } from '../types';
import { PAYLINES, ROWS, SlotMachine, exactSlotStats, type SpinResult } from './logic';
import { LINE_COLORS, SYMBOL_NAME, SYMBOL_SVG } from './symbols';

const ID = 'slots';
const CFG = BALANCE.slots;

function symEl(s: SlotSymbol): HTMLElement {
  return h('div', { class: 'sym', 'data-sym': s, html: SYMBOL_SVG[s], title: SYMBOL_NAME[s] });
}

class SlotsView implements GameView {
  el: HTMLElement;
  private machine = new SlotMachine();
  private lineBets: number[];
  private betIdx = 0;
  private spinning = false;
  private stops: number[];
  private reels: HTMLElement[] = [];
  private linesSvg: SVGSVGElement;
  private winEl: HTMLElement;
  private betValue: HTMLElement;
  private spinBtn: HTMLButtonElement;
  private minus: HTMLButtonElement;
  private plus: HTMLButtonElement;
  private cabinet: HTMLElement;
  private lever: HTMLElement;
  private captionEl: HTMLElement;
  /** Minuteries de la présentation des gains (annulées au lancer suivant). */
  private presentTimers: number[] = [];
  private unsub: () => void;

  constructor(private ctx: GameContext) {
    this.lineBets = slotLineBets(ctx.round);
    this.stops = this.machine.strips.map((s) => ctx.rng.int(s.length));
    const window = h('div', { class: 'slots__window', role: 'img', 'aria-label': 'Rouleaux' });
    for (let r = 0; r < this.machine.strips.length; r++) {
      const strip = h('div', { class: 'reel__strip' });
      const reel = h('div', { class: 'reel' }, strip);
      this.reels.push(reel);
      window.append(reel);
    }
    this.linesSvg = svg('<svg class="slots__lines" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true"></svg>');
    window.append(this.linesSvg);
    this.showStops(this.stops);

    this.winEl = h('p', { class: 'slots__win', 'aria-live': 'polite' }, `${PAYLINES.length} lignes · bonne chance`);
    this.betValue = h('div', { class: 'stepper__value' });
    this.minus = h('button', { class: 'btn', type: 'button', 'aria-label': 'Diminuer la mise', onclick: () => this.changeBet(-1) }, '−');
    this.plus = h('button', { class: 'btn', type: 'button', 'aria-label': 'Augmenter la mise', onclick: () => this.changeBet(1) }, '+');
    this.spinBtn = actionButton('Lancer', 'Espace', () => void this.spin(), 'btn--primary btn--big');
    const paytableBtn = actionButton('Table des gains', 'T', () => this.ctx.openModal('Table des gains', this.paytable()), 'btn--ghost');

    this.captionEl = h('p', { class: 'slots__caption', 'aria-hidden': 'true' });
    const bulbs = h('div', { class: 'slots__bulbs', 'aria-hidden': 'true' });
    for (let i = 0; i < 16; i++) bulbs.append(h('span', { style: `--i:${i}` }));
    this.lever = h(
      'div',
      { class: 'slots__lever', 'aria-hidden': 'true' },
      h('span', { class: 'slots__lever-arm' }, h('span', { class: 'slots__lever-knob' })),
      h('span', { class: 'slots__lever-base' }),
    );
    this.cabinet = h(
      'div',
      { class: 'slots__cabinet' },
      bulbs,
      h('p', { class: 'slots__marquee' }, 'Le Magot'),
      window,
      this.lever,
      this.winEl,
      this.captionEl,
    );

    this.el = h(
      'section',
      { class: 'game game--slots', 'aria-label': 'Machine à sous' },
      this.cabinet,
      h(
        'div',
        { class: 'controls' },
        h('div', { class: 'controls__row' }, h('div', { class: 'stepper' }, this.minus, this.betValue, this.plus), paytableBtn),
        this.spinBtn,
      ),
    );
    this.unsub = ctx.wallet.subscribe(() => this.refresh());
    this.refresh();
  }

  private get lineBet(): number {
    return this.lineBets[this.betIdx];
  }

  private get total(): number {
    return this.lineBet * this.machine.lines;
  }

  private changeBet(d: number): void {
    if (this.spinning) return;
    this.betIdx = Math.min(this.lineBets.length - 1, Math.max(0, this.betIdx + d));
    this.ctx.sound.play('chip');
    this.refresh();
  }

  private refresh(): void {
    this.betValue.replaceChildren(h('strong', {}, money(this.total)), h('small', {}, `${money(this.lineBet)} × ${this.machine.lines} lignes`));
    this.minus.disabled = this.spinning || this.betIdx === 0;
    this.plus.disabled = this.spinning || this.betIdx === this.lineBets.length - 1;
    this.spinBtn.disabled = this.spinning || this.total > this.ctx.wallet.balance;
  }

  private showStops(stops: number[], win?: SpinResult): void {
    this.reels.forEach((reel, r) => {
      const strip = reel.firstElementChild as HTMLElement;
      const L = this.machine.strips[r].length;
      const syms = Array.from({ length: ROWS }, (_, row) => symEl(this.machine.strips[r][(stops[r] + row) % L]));
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      strip.replaceChildren(...syms);
    });
    this.linesSvg.replaceChildren();
    if (!win) return;
    // Lignes gagnantes et symboles concernés
    win.lineWins.forEach((w, k) => {
      const rows = PAYLINES[w.line];
      const color = LINE_COLORS[w.line % LINE_COLORS.length];
      const pts = rows.map((row, reel) => `${50 + reel * 100},${50 + row * 100}`).join(' ');
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('points', pts);
      pl.setAttribute('stroke', color);
      pl.style.color = color;
      pl.style.animationDelay = `${k * 90}ms`;
      this.linesSvg.append(pl);
      for (let reel = 0; reel < w.count; reel++)
        this.reels[reel].querySelectorAll('.sym')[rows[reel]]?.classList.add('sym--win');
    });
    if (win.scatterMultiplier > 0)
      this.reels.forEach((reel) => reel.querySelectorAll('[data-sym="S"]').forEach((s) => s.classList.add('sym--win')));
  }

  private async spin(): Promise<void> {
    if (this.spinning) return;
    const total = this.total;
    if (total > this.ctx.wallet.balance) return this.ctx.toast('Pas assez d\'argent pour cette mise.');
    this.ctx.wallet.take(ID, total);
    this.spinning = true;
    this.refresh();
    this.stopPresentation();
    const result = this.machine.spin(this.ctx.rng, this.lineBet);
    this.winEl.className = 'slots__win';
    this.winEl.textContent = 'Bonne chance…';
    try {
      await this.animate(result);
    } catch (e) {
      if (isAbort(e)) return;
      throw e;
    }
    this.stops = result.stops;
    this.showStops(result.stops, result);
    this.spinning = false;
    this.ctx.wallet.settle(ID, result.returned);
    if (result.returned > 0) this.present(result, total);
    else {
      this.winEl.textContent = 'Rien cette fois.';
      this.reels.forEach((r) => r.classList.add('reel--dim'));
      this.later(() => this.reels.forEach((r) => r.classList.remove('reel--dim')), 700);
    }
    this.refresh();
    this.ctx.changed();
  }

  /**
   * Fait défiler les rouleaux jusqu'au résultat déjà tiré : élan vers le haut, défilement
   * flou, arrêts décalés avec rebond. Si deux magots sont déjà visibles, les rouleaux
   * suivants ralentissent pour faire monter le suspense (sans changer le résultat).
   */
  private async animate(result: SpinResult): Promise<void> {
    const signal = this.ctx.signal;
    this.linesSvg.replaceChildren();
    this.cabinet.classList.remove('is-win', 'is-bigwin');
    if (prefersReducedMotion()) {
      this.reels.forEach((r) => r.classList.add('reel--dim'));
      await sleep(250, signal);
      this.reels.forEach((r) => r.classList.remove('reel--dim'));
      return;
    }
    const final = result.stops;
    const cell = this.reels[0].getBoundingClientRect().height / ROWS;
    // Heures d'arrêt de chaque rouleau, avec suspense éventuel.
    const TEASE = 500;
    const stopAt: number[] = [];
    const teased: boolean[] = [];
    let scatters = 0;
    let extra = 0;
    for (let r = 0; r < this.reels.length; r++) {
      const tease = scatters >= 2;
      if (tease) extra += TEASE;
      teased.push(tease);
      stopAt.push(CFG.spinMs + r * CFG.reelStaggerMs + extra);
      scatters += result.window[r].filter((s) => s === 'S').length;
    }

    this.cabinet.classList.add('is-spinning');
    this.lever.classList.remove('is-pulled');
    void this.lever.offsetWidth;
    this.lever.classList.add('is-pulled');
    const anims: Animation[] = [];
    this.reels.forEach((reel, r) => {
      const strip = reel.firstElementChild as HTMLElement;
      const s = this.machine.strips[r];
      const L = s.length;
      // Même vitesse apparente pour tous les rouleaux : plus de symboles si l'arrêt est plus tard.
      const count = Math.round(stopAt[r] / 75);
      const col: SlotSymbol[] = [];
      for (let row = 0; row < ROWS; row++) col.push(s[(final[r] + row) % L]);
      for (let j = 0; j < count; j++) col.push(s[(final[r] + ROWS + j) % L]);
      for (let row = 0; row < ROWS; row++) col.push(s[(this.stops[r] + row) % L]);
      strip.replaceChildren(...col.map(symEl));
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      const from = -(col.length - ROWS) * cell;
      reel.classList.add('reel--spinning');
      if (teased[r]) reel.classList.add('reel--tease');
      anims.push(
        strip.animate(
          [
            { transform: `translateY(${from}px)`, easing: 'ease-out' },
            { transform: `translateY(${from - cell * 0.25}px)`, offset: 0.06, easing: 'cubic-bezier(.35,.05,.3,1)' },
            { transform: `translateY(${cell * 0.18}px)`, offset: 0.93, easing: 'ease-in-out' },
            { transform: 'translateY(0)' },
          ],
          { duration: stopAt[r], fill: 'forwards' },
        ),
      );
    });
    try {
      let t = 0;
      for (let r = 0; r < this.reels.length; r++) {
        // Le flou s'arrête juste avant l'arrêt, au moment du rebond.
        await sleep(stopAt[r] * 0.9 - t, signal);
        this.reels[r].classList.remove('reel--spinning');
        await sleep(stopAt[r] * 0.1, signal);
        t = stopAt[r];
        this.reels[r].classList.remove('reel--tease');
        this.reels[r].classList.add('reel--stop');
        const reel = this.reels[r];
        this.later(() => reel.classList.remove('reel--stop'), 300);
        this.ctx.sound.play('reel');
      }
    } finally {
      for (const a of anims) a.cancel();
      this.cabinet.classList.remove('is-spinning');
      this.reels.forEach((r) => r.classList.remove('reel--spinning', 'reel--tease'));
    }
  }

  private later(fn: () => void, ms: number): void {
    this.presentTimers.push(window.setTimeout(fn, ms));
  }

  private stopPresentation(): void {
    for (const t of this.presentTimers) clearTimeout(t);
    this.presentTimers = [];
    this.cabinet.classList.remove('is-win', 'is-bigwin');
    this.cabinet.querySelectorAll('.slots__bigwin').forEach((e) => e.remove());
    this.captionEl.textContent = '';
  }

  /** Présentation d'un gain : compteur qui défile, lumières, lignes une à une, gros lot. */
  private present(result: SpinResult, total: number): void {
    const mult = result.returned / total;
    const big = mult >= 10;
    this.ctx.sound.play(big ? 'bigWin' : 'win');
    this.cabinet.classList.add('is-win');
    this.later(() => this.cabinet.classList.remove('is-win'), big ? 3000 : 1600);
    const parts: string[] = [];
    if (result.scatterMultiplier) parts.push(`${result.scatterCount} magots`);
    if (result.lineWins.length) parts.push(`${result.lineWins.length} ligne${result.lineWins.length > 1 ? 's' : ''}`);
    const suffix = parts.length ? ` · ${parts.join(' · ')}` : '';
    this.winEl.className = `slots__win ${big ? 'slots__win--big' : 'slots__win--hit'}`;

    // Compteur : de 0 au gain, plus long pour les gros gains.
    const reduced = prefersReducedMotion();
    const countMs = reduced ? 0 : Math.min(2200, 450 + 120 * Math.log2(1 + mult) * 3);
    const t0 = performance.now();
    const step = () => {
      const u = countMs ? Math.min(1, (performance.now() - t0) / countMs) : 1;
      const v = Math.round(result.returned * (1 - Math.pow(1 - u, 2)));
      this.winEl.textContent = `Gain ${money(v)}${u >= 1 ? suffix : ''}`;
      if (u < 1) {
        this.ctx.sound.play('tick');
        this.later(step, 60);
      }
    };
    step();

    if (big) {
      this.ctx.toast(`Gros lot ! ${money(result.returned)} (×${mult.toFixed(0)})`, 'win');
      const banner = h('div', { class: 'slots__bigwin', 'aria-hidden': 'true' }, h('span', {}, mult >= 50 ? 'Jackpot !' : 'Gros lot !'));
      if (!reduced)
        for (let i = 0; i < 26; i++)
          banner.append(
            h('i', {
              class: 'coin',
              style: `--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 0.8).toFixed(2)}s;--s:${(0.7 + Math.random() * 0.6).toFixed(2)};--r:${Math.round(Math.random() * 720 - 360)}deg`,
            }),
          );
      this.cabinet.append(banner);
      this.cabinet.classList.add('is-bigwin');
      this.later(() => {
        banner.remove();
        this.cabinet.classList.remove('is-bigwin');
      }, 2600);
    }

    // Plusieurs lignes : on les montre ensemble, puis une par une en boucle.
    const lines = [...this.linesSvg.querySelectorAll('polyline')];
    if (result.lineWins.length > 1) {
      let k = 0;
      const cycle = () => {
        const w = result.lineWins[k % result.lineWins.length];
        lines.forEach((pl, i) => pl.classList.toggle('is-dim', i !== k % lines.length));
        this.captionEl.textContent = `Ligne ${w.line + 1} : ${w.count} × ${SYMBOL_NAME[w.symbol]} = ${money(w.multiplier * this.lineBetOf(result))}`;
        k++;
        this.later(cycle, 1100);
      };
      this.later(cycle, 1400);
    } else if (result.lineWins.length === 1) {
      const w = result.lineWins[0];
      this.captionEl.textContent = `Ligne ${w.line + 1} : ${w.count} × ${SYMBOL_NAME[w.symbol]}`;
    }
  }

  /** Mise par ligne utilisée pour un résultat (la mise peut changer ensuite). */
  private lineBetOf(result: SpinResult): number {
    const lineTotal = result.lineWins.reduce((s, w) => s + w.multiplier, 0);
    const scatter = result.scatterMultiplier * this.machine.lines;
    return result.returned / (lineTotal + scatter);
  }

  onKey(e: KeyboardEvent): boolean {
    switch (e.key) {
      case ' ':
      case 'Enter':
        void this.spin();
        return true;
      case '+':
      case 'ArrowUp':
        this.changeBet(1);
        return true;
      case '-':
      case 'ArrowDown':
        this.changeBet(-1);
        return true;
      case 't':
      case 'T':
        this.ctx.openModal('Table des gains', this.paytable());
        return true;
    }
    return false;
  }

  private paytable(): Node {
    const lb = this.lineBet;
    const rows = (Object.keys(SLOT_LINE_PAYS) as (keyof typeof SLOT_LINE_PAYS)[]).map((s) =>
      h(
        'tr',
        {},
        h('td', {}, h('span', { class: 'sym-cell', html: SYMBOL_SVG[s] }, SYMBOL_NAME[s])),
        ...SLOT_LINE_PAYS[s].map((m) => h('td', { class: 'num' }, money(m * lb))),
      ),
    );
    const scatter = h(
      'tr',
      {},
      h('td', {}, h('span', { class: 'sym-cell', html: SYMBOL_SVG.S }, SYMBOL_NAME.S)),
      ...[3, 4, 5].map((n) => h('td', { class: 'num' }, money((SLOT_SCATTER_PAYS[n] ?? 0) * this.total))),
    );
    const lines = PAYLINES.map((rows, i) => {
      const pts = rows.map((row, reel) => `${10 + reel * 20},${10 + row * 20}`).join(' ');
      let cells = '';
      for (let x = 0; x < 5; x++) for (let y = 0; y < 3; y++) cells += `<rect x="${x * 20 + 2}" y="${y * 20 + 2}" width="16" height="16" rx="2" fill="#ffffff12"/>`;
      return h(
        'figure',
        {},
        svg(`<svg viewBox="0 0 100 60">${cells}<polyline points="${pts}" fill="none" stroke="${LINE_COLORS[i]}" stroke-width="3" stroke-linejoin="round"/></svg>`),
        h('figcaption', {}, `Ligne ${i + 1}`),
      );
    });
    const rtp = exactSlotStats().rtp;
    return h(
      'div',
      { class: 'rules' },
      h('p', {}, `Gains pour une mise de ${money(lb)} par ligne (${money(this.total)} au total). Les symboles doivent être alignés depuis le rouleau de gauche. Le joker remplace tous les symboles sauf le magot. Seul le meilleur gain de chaque ligne est payé ; les gains de toutes les lignes s'additionnent.`),
      h(
        'table',
        { class: 'paytable' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Symbole'), h('th', {}, '×3'), h('th', {}, '×4'), h('th', {}, '×5'))),
        h('tbody', {}, ...rows, scatter),
      ),
      h('p', {}, 'Le magot paie n\'importe où dans la fenêtre, en multiple de la mise totale.'),
      h('h3', {}, 'Lignes de paiement'),
      h('div', { class: 'lines-grid' }, ...lines),
      h('p', { class: 'rules__fine' }, `Retour au joueur théorique (calcul exact) : ${(rtp * 100).toFixed(2)} %. Jeu à risque élevé : les gains sont rares mais peuvent atteindre ${SLOT_LINE_PAYS.W[2] / PAYLINES.length}× la mise totale sur une seule ligne.`),
    );
  }

  rules(): Node {
    return this.paytable();
  }

  destroy(): void {
    this.stopPresentation();
    this.unsub();
  }
}

export const slotsModule: GameModule = {
  id: ID,
  name: 'Machine à sous',
  risk: 'high',
  icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7.8 9v7M13.2 9v7" stroke="currentColor" stroke-width="1"/><text x="5.1" y="14.6" font-size="5" font-family="sans-serif" fill="currentColor">7</text><text x="10.4" y="14.6" font-size="5" font-family="sans-serif" fill="currentColor">7</text><text x="15.6" y="14.6" font-size="5" font-family="sans-serif" fill="currentColor">7</text><path d="M18.5 9h2v-4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="20.5" cy="4" r="1.6" fill="currentColor"/></svg>`,
  minBet: (round) => slotLineBets(round)[0] * PAYLINES.length,
  keys: [
    ['Espace', 'Lancer les rouleaux'],
    ['+ / −', 'Changer la mise'],
    ['T', 'Table des gains'],
  ],
  create: (ctx) => new SlotsView(ctx),
};
