import { BALANCE } from '../../config/balance';
import { chipsFor } from '../../core/rounds';
import { ChipRack, actionButton, chipClass, shortMoney } from '../../ui/components';
import { h, isAbort, money, motion, prefersReducedMotion, sleep, svg } from '../../ui/dom';
import { rouletteLimits } from '../limits';
import type { GameContext, GameModule, GameView } from '../types';
import {
  WHEEL_ORDER,
  betKey,
  betRisk,
  colorOf,
  parseBetKey,
  payoutOdds,
  resolve,
  spin,
  type Bet,
  type BetKind,
} from './logic';

const ID = 'roulette';
const SECTOR = 360 / 37;

/** Rayons (repère SVG 200×200) : piste de la bille, cases, cône, repos de la bille. */
const R_TRACK = 92;
const R_SECT = 86;
const R_CONE = 56;
const R_POCKET = 63;

function sectorPath(i: number, R: number, r: number): string {
  const a0 = ((i - 0.5) * SECTOR - 90) * (Math.PI / 180);
  const a1 = ((i + 0.5) * SECTOR - 90) * (Math.PI / 180);
  const p = (rad: number, a: number) =>
    `${(100 + rad * Math.cos(a)).toFixed(2)},${(100 + rad * Math.sin(a)).toFixed(2)}`;
  return `M${p(R, a0)} A${R},${R} 0 0 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 0 0 ${p(r, a0)} Z`;
}

function wheelSvg(): string {
  let sectors = '';
  WHEEL_ORDER.forEach((n, i) => {
    const fill = colorOf(n) === 'red' ? 'var(--w-red)' : colorOf(n) === 'black' ? 'var(--w-black)' : 'var(--w-green)';
    sectors += `<path d="${sectorPath(i, R_SECT, R_CONE)}" fill="${fill}" stroke="var(--gold-dim)" stroke-width="0.6"/>`;
    sectors += `<text x="100" y="${100 - R_SECT + 10}" transform="rotate(${(i * SECTOR).toFixed(3)} 100 100)" class="wheel__num">${n}</text>`;
  });
  let spokes = '';
  for (let k = 0; k < 4; k++)
    spokes += `<line x1="100" y1="72" x2="100" y2="128" transform="rotate(${k * 45} 100 100)" stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round"/>`;
  // Losanges déflecteurs sur la piste (fixes) : la bille rebondit dessus.
  let diamonds = '';
  for (let k = 0; k < 8; k++)
    diamonds += `<path d="M100 ${100 - R_TRACK - 3.5} l2.4 3.5 l-2.4 3.5 l-2.4 -3.5z" fill="var(--gold-2)" transform="rotate(${k * 45 + 22.5} 100 100)"/>`;
  return `<svg viewBox="0 0 200 200" class="wheel" aria-hidden="true">
    <defs>
      <radialGradient id="wcone" cx="50%" cy="42%" r="62%">
        <stop offset="0" stop-color="#6b5230"/><stop offset=".55" stop-color="#2e2012"/><stop offset="1" stop-color="#120c06"/>
      </radialGradient>
      <radialGradient id="wtrack" cx="50%" cy="50%" r="50%">
        <stop offset=".86" stop-color="#0d0805"/><stop offset=".94" stop-color="#3a2614"/><stop offset="1" stop-color="#1a110a"/>
      </radialGradient>
      <radialGradient id="wball" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#d6d6d6"/><stop offset="1" stop-color="#7a7a7a"/></radialGradient>
    </defs>
    <circle class="wheel__glow" cx="100" cy="100" r="99" fill="none" stroke="var(--neon-pink)" stroke-width="2"/>
    <circle cx="100" cy="100" r="98.5" fill="url(#wtrack)" stroke="var(--gold)" stroke-width="1.5"/>
    ${diamonds}
    <g class="wheel__rotor">${sectors}
      <path class="wheel__hl" d="${sectorPath(0, R_SECT, R_CONE)}" fill="#fff" fill-opacity=".35" stroke="var(--gold-2)" stroke-width="1.5"/>
      <circle cx="100" cy="100" r="${R_SECT + 1}" fill="none" stroke="var(--gold)" stroke-width="1"/>
      <circle cx="100" cy="100" r="${R_CONE}" fill="url(#wcone)" stroke="var(--gold)" stroke-width="1"/>
      <circle cx="100" cy="100" r="44" fill="none" stroke="var(--gold-dim)" stroke-width=".6" stroke-dasharray="2 3"/>
      ${spokes}
      <circle cx="100" cy="100" r="11" fill="var(--gold)" stroke="#6b5226"/>
      <circle cx="100" cy="100" r="4" fill="#f6e3b0"/>
    </g>
    <ellipse cx="74" cy="64" rx="48" ry="20" fill="#fff" opacity=".05" transform="rotate(-32 74 64)"/>
    <circle class="wheel__ball" cx="100" cy="${100 - R_POCKET}" r="4.2" fill="url(#wball)"/>
    <path d="M100 7 l-5 -7 h10 z" fill="var(--neon-pink)"/>
  </svg>`;
}

const mod360 = (a: number): number => ((a % 360) + 360) % 360;

/** Positions de grille : portrait (mobile) et paysage (PC). */
function areaFor(kind: BetKind): { p: string; l: string } {
  switch (kind.type) {
    case 'straight': {
      if (kind.n === 0) return { p: '1 / 2 / 2 / 5', l: '1 / 1 / 4 / 2' };
      const i = kind.n - 1;
      const row = Math.floor(i / 3);
      const col = i % 3;
      return { p: `${row + 2} / ${col + 2}`, l: `${3 - col} / ${row + 2}` };
    }
    case 'column':
      return { p: `14 / ${kind.c + 1}`, l: `${4 - kind.c} / 14` };
    case 'dozen':
      return { p: `${2 + (kind.d - 1) * 4} / 1 / span 4 / span 1`, l: `4 / ${2 + (kind.d - 1) * 4} / span 1 / span 4` };
    default:
      return { p: 'auto', l: 'auto' };
  }
}

const OUTSIDE: [BetKind, string][] = [
  [{ type: 'low' }, '1–18'],
  [{ type: 'even' }, 'Pair'],
  [{ type: 'red' }, 'Rouge'],
  [{ type: 'black' }, 'Noir'],
  [{ type: 'odd' }, 'Impair'],
  [{ type: 'high' }, '19–36'],
];

class RouletteView implements GameView {
  el: HTMLElement;
  private limits;
  private bets = new Map<string, number>();
  private history: string[] = [];
  private lastBets: Map<string, number> | null = null;
  private spinning = false;
  private rotation = 0;
  private cells = new Map<string, HTMLElement>();
  private rack: ChipRack;
  private totalEl: HTMLElement;
  private resultEl: HTMLElement;
  private historyEl: HTMLElement;
  private rotor: SVGGElement;
  private ball: SVGCircleElement;
  private highlight: SVGPathElement;
  private wheelWrap: HTMLElement;
  private spinBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private rebetBtn: HTMLButtonElement;
  private unsub: () => void;

  constructor(private ctx: GameContext) {
    this.limits = rouletteLimits(ctx.round);
    this.rack = new ChipRack(chipsFor(this.limits), () => ctx.sound.play('chip'));

    const wheel = svg(wheelSvg());
    this.rotor = wheel.querySelector('.wheel__rotor')!;
    this.ball = wheel.querySelector('.wheel__ball')!;
    this.highlight = wheel.querySelector('.wheel__hl')!;
    this.resultEl = h('div', { class: 'roulette__result', 'aria-live': 'polite' }, h('span', {}, '—'));
    this.historyEl = h('ol', { class: 'roulette__history', 'aria-label': 'Derniers numéros' });
    this.wheelWrap = h('div', { class: 'roulette__wheel' }, wheel, h('div', { class: 'roulette__side' }, this.resultEl, this.historyEl));

    const grid = h('div', { class: 'rtable', role: 'group', 'aria-label': 'Table de roulette' });
    const addCell = (kind: BetKind, label: string, cls: string) => {
      const key = betKey(kind);
      const a = areaFor(kind);
      const cell = h(
        'button',
        {
          class: `rcell ${cls}`,
          type: 'button',
          style: `--pa:${a.p};--la:${a.l}`,
          'data-key': key,
          'aria-label': `${label} — paie ${payoutOdds(kind)} pour 1`,
          onclick: () => this.place(key),
          oncontextmenu: (e: Event) => {
            e.preventDefault();
            this.remove(key);
          },
        },
        h('span', { class: 'rcell__label' }, label),
      );
      this.cells.set(key, cell);
      return cell;
    };
    grid.append(addCell({ type: 'straight', n: 0 }, '0', 'rcell--green'));
    for (let n = 1; n <= 36; n++)
      grid.append(addCell({ type: 'straight', n }, String(n), `rcell--${colorOf(n)}`));
    for (const c of [1, 2, 3] as const) grid.append(addCell({ type: 'column', c }, '2:1', 'rcell--side'));
    for (const d of [1, 2, 3] as const)
      grid.append(addCell({ type: 'dozen', d }, `${d === 1 ? '1re' : `${d}e`} 12`, 'rcell--side rcell--dozen'));
    const outside = h('div', { class: 'rtable-outside' });
    for (const [k, label] of OUTSIDE)
      outside.append(addCell(k, label, `rcell--side ${k.type === 'red' ? 'rcell--red' : k.type === 'black' ? 'rcell--black' : ''}`));

    this.totalEl = h('div', { class: 'bet-total' });
    this.undoBtn = actionButton('Annuler', '⌫', () => this.undo(), 'btn--ghost btn--compact', '↶');
    this.clearBtn = actionButton('Effacer', 'C', () => this.clear(), 'btn--ghost btn--compact', '✕');
    this.rebetBtn = actionButton('Remiser', 'R', () => this.rebet(), 'btn--ghost btn--compact', '↻');
    this.spinBtn = actionButton('Lancer', 'Espace', () => void this.spin(), 'btn--primary btn--big btn--grow');

    this.el = h(
      'section',
      { class: 'game game--roulette', 'aria-label': 'Roulette européenne' },
      h('div', { class: 'roulette__top' }, this.wheelWrap),
      h(
        'div',
        { class: 'roulette__board felt' },
        h('p', { class: 'table-note' }, `Mise par tour : ${money(this.limits.min)} – ${money(this.limits.max)}`),
        grid,
        outside,
      ),
      h(
        'div',
        { class: 'controls controls--sticky' },
        this.rack.el,
        h('div', { class: 'controls__row controls__row--nowrap' }, this.totalEl, this.undoBtn, this.clearBtn, this.rebetBtn, this.spinBtn),
      ),
    );
    this.unsub = ctx.wallet.subscribe(() => this.refresh());
    this.refresh();
  }

  private undoStack: string[] = [];

  private get total(): number {
    let t = 0;
    for (const v of this.bets.values()) t += v;
    return t;
  }

  private place(key: string): void {
    if (this.spinning) return;
    const chip = this.rack.selected;
    const total = this.total + chip;
    if (total > this.limits.max) return this.ctx.toast(`Mise maximale par tour : ${money(this.limits.max)}`);
    if (total > this.ctx.wallet.balance) return this.ctx.toast('Pas assez d\'argent pour ce jeton.');
    this.bets.set(key, (this.bets.get(key) ?? 0) + chip);
    this.undoStack.push(`${key}|${chip}`);
    this.ctx.sound.play('chip');
    this.refresh();
  }

  private remove(key: string): void {
    if (this.spinning || !this.bets.has(key)) return;
    this.bets.delete(key);
    this.undoStack = this.undoStack.filter((u) => !u.startsWith(`${key}|`));
    this.refresh();
  }

  private undo(): void {
    if (this.spinning) return;
    const last = this.undoStack.pop();
    if (!last) return;
    const [key, v] = last.split('|');
    const left = (this.bets.get(key) ?? 0) - Number(v);
    if (left > 0) this.bets.set(key, left);
    else this.bets.delete(key);
    this.refresh();
  }

  private clear(): void {
    if (this.spinning) return;
    this.bets.clear();
    this.undoStack = [];
    this.refresh();
  }

  private rebet(): void {
    if (this.spinning || !this.lastBets) return;
    let t = 0;
    for (const v of this.lastBets.values()) t += v;
    if (t > this.ctx.wallet.balance) return this.ctx.toast('Pas assez d\'argent pour remiser.');
    if (t > this.limits.max) return this.ctx.toast(`Mise maximale : ${money(this.limits.max)}`);
    this.bets = new Map(this.lastBets);
    this.undoStack = [...this.bets].map(([k, v]) => `${k}|${v}`);
    this.ctx.sound.play('chip');
    this.refresh();
  }

  private refresh(): void {
    const total = this.total;
    for (const [key, cell] of this.cells) {
      const amt = this.bets.get(key);
      let chip = cell.querySelector<HTMLElement>('.rcell__chip');
      if (amt) {
        if (!chip) {
          chip = h('span', { class: 'rcell__chip' });
          cell.append(chip);
        }
        chip.className = `rcell__chip ${chipClass(this.nearestChip(amt), chipsFor(this.limits))}`;
        chip.textContent = shortMoney(amt);
      } else chip?.remove();
    }
    const risks = new Set([...this.bets.keys()].map((k) => betRisk(parseBetKey(k))));
    const riskTxt = risks.has('high') ? 'élevé' : risks.has('medium') ? 'moyen' : risks.size ? 'faible' : '';
    this.totalEl.replaceChildren(
      h('span', { class: 'bet-total__label' }, 'Mise'),
      h('strong', {}, money(total)),
      ...(riskTxt ? [h('small', { class: `risk risk--${riskTxt}` }, `risque ${riskTxt}`)] : []),
    );
    const avail = this.ctx.wallet.balance - total;
    this.rack.setDisabled(Math.min(avail, this.limits.max - total));
    this.spinBtn.disabled = this.spinning || total < this.limits.min || total > this.ctx.wallet.balance;
    this.undoBtn.disabled = this.clearBtn.disabled = this.spinning || total === 0;
    this.rebetBtn.disabled = this.spinning || !this.lastBets;
  }

  private nearestChip(v: number): number {
    const chips = chipsFor(this.limits);
    return [...chips].reverse().find((c) => c <= v) ?? chips[0];
  }

  private async spin(): Promise<void> {
    const total = this.total;
    if (this.spinning || total < this.limits.min || total > this.ctx.wallet.balance) return;
    const bets: Bet[] = [...this.bets].map(([k, amount]) => ({ kind: parseBetKey(k), amount }));
    this.ctx.wallet.take(ID, total);
    this.spinning = true;
    this.lastBets = new Map(this.bets);
    this.refresh();
    for (const c of this.cells.values()) c.classList.remove('rcell--hit');

    // Le résultat est tiré AVANT l'animation, de façon équitable ; l'animation ne fait que l'afficher.
    const result = spin(this.ctx.rng);
    const res = resolve(bets, result);
    const signal = this.ctx.signal;
    try {
      if (this.wheelWrap.getBoundingClientRect().bottom < 60)
        this.wheelWrap.scrollIntoView({ behavior: motion(1) ? 'smooth' : 'auto', block: 'center' });
      this.resultEl.replaceChildren(h('span', { class: 'roulette__spinning' }, '…'));
      await this.animateWheel(result, signal);
    } catch (e) {
      if (isAbort(e)) return;
      throw e;
    }
    this.spinning = false;
    this.ctx.wallet.settle(ID, res.returned);
    this.showResult(result, res.returned, total);
    const winners = new Map<string, number>();
    for (const w of res.winners) winners.set(betKey(w.bet.kind), (winners.get(betKey(w.bet.kind)) ?? 0) + w.returned);
    this.sweepChips(winners);
    this.bets.clear();
    this.undoStack = [];
    this.refresh();
    this.ctx.changed();
  }

  private setRotor(angle: number): void {
    this.rotation = angle;
    this.rotor.setAttribute('transform', `rotate(${angle.toFixed(3)} 100 100)`);
  }

  /** Place la bille à un angle absolu (0 = en haut, sens horaire) et un rayon donnés. */
  private placeBall(angle: number, radius: number): void {
    const a = (angle * Math.PI) / 180;
    this.ball.setAttribute('cx', (100 + radius * Math.sin(a)).toFixed(2));
    this.ball.setAttribute('cy', (100 - radius * Math.cos(a)).toFixed(2));
  }

  /**
   * Anime un résultat déjà tiré : la roue tourne dans le sens horaire en ralentissant,
   * la bille roule en sens inverse sur la piste, tombe en rebondissant sur les cases
   * puis est emportée par la roue jusqu'au repère. Tout est calculé en fonction du
   * temps écoulé, jamais du nombre d'images.
   */
  private async animateWheel(result: number, signal: AbortSignal): Promise<void> {
    const idx = WHEEL_ORDER.indexOf(result);
    const W0 = this.rotation;
    const delta = mod360(-idx * SECTOR - W0);
    this.highlight.classList.remove('is-on');
    if (prefersReducedMotion()) {
      // Mouvement réduit : pas de rotation, la bille apparaît simplement dans sa case.
      this.ball.classList.add('is-hidden');
      this.setRotor(W0 + delta);
      this.placeBall(0, R_POCKET);
      await sleep(350, signal);
      this.ball.classList.remove('is-hidden');
      this.highlight.setAttribute('transform', `rotate(${(idx * SECTOR).toFixed(3)} 100 100)`);
      this.highlight.classList.add('is-on');
      return;
    }
    const T = BALANCE.roulette.spinMs;
    const D = 2 * 360 + delta;
    const W1 = W0 + D;
    const wheelAt = (u: number) => W0 + D * (1 - Math.pow(1 - u, 2.4));
    const DROP = 0.42; // la bille quitte la piste
    const LOCK = 0.74; // la bille est prise dans sa case
    const BALL_TURNS = 4 * 360;
    // Angle de la case gagnante, qui arrive en haut à la fin.
    const pocketAt = (u: number) => wheelAt(u) - W1;
    const ballAngle = (u: number) =>
      u >= LOCK ? pocketAt(u) : pocketAt(u) + BALL_TURNS * Math.pow(1 - u / LOCK, 1.8);
    const ballRadius = (u: number) => {
      if (u <= DROP) return R_TRACK;
      if (u >= LOCK) return R_POCKET;
      const v = (u - DROP) / (LOCK - DROP);
      // Rebonds amortis entre la piste et les cases.
      return R_POCKET + (R_TRACK - R_POCKET) * Math.pow(1 - v, 1.3) * Math.abs(Math.cos(v * Math.PI * 2.5));
    };

    const start = performance.now();
    let lastDiamond = Math.floor((ballAngle(0) - 22.5) / 45);
    let lastFret = Math.floor((ballAngle(0) - wheelAt(0)) / SECTOR);
    let lastTick = 0;
    let raf = 0;
    const draw = (u: number) => {
      const b = ballAngle(u);
      const r = ballRadius(u);
      this.setRotor(wheelAt(u));
      this.placeBall(b, r);
      const now = performance.now();
      // Cliquetis : passage sur les losanges (piste) puis sur les séparations des cases.
      const diamond = Math.floor((b - 22.5) / 45);
      const fret = Math.floor((b - wheelAt(u)) / SECTOR);
      const hitDiamond = u < LOCK && diamond !== lastDiamond;
      const hitFret = u > DROP && u < LOCK + 0.05 && fret !== lastFret;
      if ((hitDiamond || hitFret) && now - lastTick > 55) {
        this.ctx.sound.play('tick');
        lastTick = now;
      }
      lastDiamond = diamond;
      lastFret = fret;
    };
    const frame = () => {
      const u = Math.min(1, (performance.now() - start) / T);
      draw(u);
      if (u < 1) raf = requestAnimationFrame(frame);
    };
    this.wheelWrap.classList.add('is-spinning');
    raf = requestAnimationFrame(frame);
    try {
      // La fin est garantie par une minuterie, même si les images sont suspendues.
      await sleep(T, signal);
    } finally {
      cancelAnimationFrame(raf);
      this.wheelWrap.classList.remove('is-spinning');
    }
    draw(1);
    this.setRotor(W1);
    this.highlight.setAttribute('transform', `rotate(${(idx * SECTOR).toFixed(3)} 100 100)`);
    this.highlight.classList.add('is-on');
  }

  /** Jetons gagnants qui brillent et montent, jetons perdants balayés par le croupier. */
  private sweepChips(winners: Map<string, number>): void {
    for (const [key, cell] of this.cells) {
      const chip = cell.querySelector<HTMLElement>('.rcell__chip');
      if (!chip) continue;
      const ghost = chip.cloneNode(true) as HTMLElement;
      ghost.classList.remove('rcell__chip');
      const won = winners.get(key);
      ghost.classList.add('rcell__ghost', won ? 'rcell__ghost--win' : 'rcell__ghost--lose');
      cell.append(ghost);
      setTimeout(() => ghost.remove(), 1400);
      if (won) {
        const float = h('span', { class: 'float-win' }, `+${shortMoney(won)}`);
        cell.append(float);
        cell.classList.add('rcell--won');
        setTimeout(() => {
          float.remove();
          cell.classList.remove('rcell--won');
        }, 1800);
      }
    }
  }

  private showResult(n: number, returned: number, staked: number): void {
    const color = colorOf(n);
    this.resultEl.replaceChildren(
      h('span', { class: `roulette__num roulette__num--${color}` }, String(n)),
      h('small', {}, color === 'green' ? 'zéro' : `${color === 'red' ? 'rouge' : 'noir'} · ${n % 2 ? 'impair' : 'pair'}`),
    );
    this.cells.get(betKey({ type: 'straight', n }))?.classList.add('rcell--hit');
    this.history.unshift(`${n}`);
    this.history = this.history.slice(0, 12);
    this.historyEl.replaceChildren(
      ...this.history.map((x) => h('li', { class: `hist hist--${colorOf(Number(x))}` }, x)),
    );
    if (returned > 0) {
      const big = returned >= staked * 5;
      this.ctx.sound.play(big ? 'bigWin' : 'win');
      this.ctx.toast(`${n} ! Vous récupérez ${money(returned)}`, 'win');
    } else {
      this.ctx.sound.play('lose');
      this.ctx.toast(`${n}. La maison ramasse ${money(staked)}.`, 'lose');
    }
  }

  onKey(e: KeyboardEvent): boolean {
    switch (e.key) {
      case ' ':
      case 'Enter':
        void this.spin();
        return true;
      case 'Backspace':
        this.undo();
        return true;
      case 'c':
      case 'C':
        this.clear();
        return true;
      case 'r':
      case 'R':
        this.rebet();
        return true;
      case '+':
      case 'ArrowUp':
        this.rack.step(1);
        return true;
      case '-':
      case 'ArrowDown':
        this.rack.step(-1);
        return true;
    }
    return false;
  }

  rules(): Node {
    const p = BALANCE.roulette.payouts;
    return h(
      'div',
      { class: 'rules' },
      h('p', {}, 'Roulette européenne à un seul zéro. Choisissez un jeton, touchez les cases pour miser, puis lancez la bille.'),
      h(
        'table',
        { class: 'paytable' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Pari'), h('th', {}, 'Paiement'), h('th', {}, 'Chance'), h('th', {}, 'Risque'))),
        h(
          'tbody',
          {},
          h('tr', {}, h('td', {}, 'Numéro plein (0–36)'), h('td', {}, `${p.straight} pour 1`), h('td', {}, '1 / 37'), h('td', {}, 'élevé')),
          h('tr', {}, h('td', {}, 'Douzaine, colonne'), h('td', {}, `${p.dozen} pour 1`), h('td', {}, '12 / 37'), h('td', {}, 'moyen')),
          h('tr', {}, h('td', {}, 'Rouge/noir, pair/impair, 1–18/19–36'), h('td', {}, `${p.even} pour 1`), h('td', {}, '18 / 37'), h('td', {}, 'faible')),
        ),
      ),
      h('p', {}, 'Pour retirer des jetons : Annuler (dernier jeton), Effacer (tout) ou clic droit sur une case. Le 0 fait perdre tous les paris extérieurs. Retour au joueur : 97,3 % pour chaque pari.'),
      h('p', {}, `Mise totale par tour entre ${money(this.limits.min)} et ${money(this.limits.max)} à cette manche.`),
    );
  }

  destroy(): void {
    this.unsub();
  }
}

export const rouletteModule: GameModule = {
  id: ID,
  name: 'Roulette',
  risk: 'variable',
  icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 2v4.5M12 17.5V22M2 12h4.5M17.5 12H22M4.9 4.9l3.2 3.2M15.9 15.9l3.2 3.2M4.9 19.1l3.2-3.2M15.9 8.1l3.2-3.2" stroke="currentColor" stroke-width="1.1"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>`,
  minBet: (round) => rouletteLimits(round).min,
  keys: [
    ['Espace', 'Lancer la bille'],
    ['⌫', 'Annuler le dernier jeton'],
    ['C', 'Effacer les mises'],
    ['R', 'Remiser comme au tour précédent'],
    ['+ / −', 'Changer de jeton'],
  ],
  create: (ctx) => new RouletteView(ctx),
};
