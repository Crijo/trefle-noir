/**
 * Effets d'argent communs à tous les jeux (purement visuels, sans effet sur le jeu) :
 * compteur qui défile, montants flottants, pièces qui volent vers l'argent du joueur,
 * série de gains et annonce « vous pouvez payer ».
 */
import type { SettleEvent } from '../core/wallet';
import { h, money, prefersReducedMotion } from './dom';
import type { Sound } from './sound';

type FloatKind = 'win' | 'lose' | 'push' | 'gift' | 'paid';

export class MoneyFx {
  private shown = 0;
  private target = 0;
  private from = 0;
  private t0 = 0;
  private dur = 0;
  private raf = 0;
  private tickSound = false;
  private lastTick = 0;
  private streak = 0;
  private streakEl: HTMLElement;
  private layer: HTMLElement;

  constructor(
    private valueEl: HTMLElement,
    private cell: HTMLElement,
    private sound: Sound,
    /** Zone d'où partent les pièces (le jeu affiché). */
    private source: () => DOMRect | null,
  ) {
    this.streakEl = h('span', { class: 'streak', hidden: true, 'aria-live': 'polite' });
    cell.append(this.streakEl);
    this.layer = h('div', { class: 'fx-layer', 'aria-hidden': 'true' });
    document.body.append(this.layer);
  }

  /** Affiche immédiatement une valeur (nouvelle partie). */
  reset(value: number): void {
    cancelAnimationFrame(this.raf);
    this.shown = this.target = value;
    this.valueEl.textContent = money(value);
    this.setStreak(0);
  }

  /** Nouvelle valeur cible : le compteur défile jusqu'à elle. */
  set(value: number): void {
    if (value === this.target) return;
    this.animateTo(value, 0, value < this.target ? 220 : 450, false);
  }

  private animateTo(value: number, delay: number, dur: number, tick: boolean): void {
    this.target = value;
    cancelAnimationFrame(this.raf);
    if (prefersReducedMotion()) {
      this.shown = value;
      this.valueEl.textContent = money(value);
      return;
    }
    this.from = this.shown;
    this.t0 = performance.now() + delay;
    this.dur = dur;
    this.tickSound = tick;
    const frame = () => {
      const now = performance.now();
      const u = Math.max(0, Math.min(1, (now - this.t0) / this.dur));
      const eased = 1 - Math.pow(1 - u, 3);
      this.shown = Math.round(this.from + (this.target - this.from) * eased);
      this.valueEl.textContent = money(this.shown);
      if (this.tickSound && u > 0 && u < 1 && now - this.lastTick > 85) {
        this.sound.play('coin');
        this.lastTick = now;
      }
      if (u < 1) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    // Filet de sécurité si les images sont suspendues.
    setTimeout(() => {
      if (this.target === value) {
        this.shown = value;
        this.valueEl.textContent = money(value);
      }
    }, delay + dur + 400);
  }

  /** Fin d'un coup : célébration ou constat de perte. */
  onSettle(e: SettleEvent, balance: number, debt: number): void {
    const net = e.returned - e.staked;
    if (net > 0) {
      const ratio = e.returned / Math.max(1, e.staked);
      const big = ratio >= 10 || net >= debt * 0.3;
      this.setStreak(this.streak + 1);
      this.float(`+${money(net)}`, 'win', big);
      this.flash(big ? 'big' : 'win');
      const coins = Math.round(Math.min(22, 4 + Math.log2(ratio + 1) * 4 + (big ? 6 : 0)));
      const flight = this.flyCoins(coins);
      this.animateTo(balance, flight, Math.min(1600, 450 + Math.log10(1 + net) * 260), true);
      if (big) {
        this.sound.play('cashIn');
        this.screenFlash();
      }
    } else if (net < 0) {
      if (this.streak >= 2) this.breakStreak();
      else this.setStreak(0);
      this.float(`−${money(-net)}`, 'lose');
      this.flash('lose');
    } else {
      this.float('Mise rendue', 'push');
    }
  }

  /** Argent reçu ou versé hors des jeux (avance, remboursement). */
  note(text: string, kind: 'gift' | 'paid'): void {
    this.float(text, kind);
    this.flash(kind === 'gift' ? 'win' : 'lose');
    if (kind === 'paid') this.sound.play('drain');
  }

  private float(text: string, kind: FloatKind, big = false): void {
    const reduced = prefersReducedMotion();
    const el = h('span', { class: `money-float money-float--${kind}${big ? ' money-float--big' : ''}${reduced ? ' is-static' : ''}` }, text);
    this.cell.append(el);
    setTimeout(() => el.remove(), big ? 2200 : 1500);
  }

  private flash(kind: 'win' | 'lose' | 'big'): void {
    const cls = `hud__cell--${kind}`;
    this.cell.classList.remove('hud__cell--win', 'hud__cell--lose', 'hud__cell--big');
    void this.cell.offsetWidth; // relance l'animation CSS
    this.cell.classList.add(cls);
    setTimeout(() => this.cell.classList.remove(cls), 900);
  }

  private screenFlash(): void {
    if (prefersReducedMotion()) return;
    const el = h('div', { class: 'screen-flash' });
    this.layer.append(el);
    setTimeout(() => el.remove(), 900);
  }

  /** Pièces qui volent du jeu jusqu'au compteur ; renvoie la durée avant la première arrivée. */
  private flyCoins(n: number): number {
    const src = this.source();
    if (prefersReducedMotion() || !src || !this.layer.animate) return 0;
    const dst = this.valueEl.getBoundingClientRect();
    const tx = dst.left + dst.width / 2;
    const ty = dst.top + dst.height / 2;
    const DUR = 700;
    const STAGGER = 45;
    for (let i = 0; i < n; i++) {
      const sx = src.left + src.width * (0.3 + Math.random() * 0.4);
      const sy = src.top + src.height * (0.35 + Math.random() * 0.3);
      const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 140;
      const my = Math.min(sy, ty) - 40 - Math.random() * 80;
      const coin = h('i', { class: 'fly-coin' });
      this.layer.append(coin);
      const anim = coin.animate(
        [
          { transform: `translate(${sx}px, ${sy}px) scale(.4) rotate(0deg)`, opacity: 0 },
          { transform: `translate(${sx}px, ${sy - 10}px) scale(1)`, opacity: 1, offset: 0.12 },
          { transform: `translate(${mx}px, ${my}px) scale(1.15) rotate(200deg)`, offset: 0.55 },
          { transform: `translate(${tx}px, ${ty}px) scale(.45) rotate(400deg)`, opacity: 0.6 },
        ],
        { duration: DUR, delay: i * STAGGER, easing: 'cubic-bezier(.45,0,.6,1)', fill: 'backwards' },
      );
      anim.onfinish = () => {
        coin.remove();
        this.bump();
      };
      // Retrait de secours si l'animation est suspendue (onglet masqué…).
      setTimeout(() => coin.remove(), DUR + i * STAGGER + 300);
    }
    return DUR * 0.85;
  }

  private bump(): void {
    this.valueEl.classList.remove('is-bump');
    void this.valueEl.offsetWidth;
    this.valueEl.classList.add('is-bump');
  }

  private setStreak(n: number): void {
    this.streak = n;
    if (n >= 2) {
      this.streakEl.hidden = false;
      this.streakEl.className = `streak streak--${Math.min(n, 6)}`;
      this.streakEl.textContent = `Série ×${n}`;
      this.streakEl.setAttribute('aria-label', `Série de ${n} gains`);
      if (n >= 3) {
        this.streakEl.classList.remove('is-pop');
        void this.streakEl.offsetWidth;
        this.streakEl.classList.add('is-pop');
      }
    } else {
      this.streakEl.hidden = true;
    }
  }

  private breakStreak(): void {
    this.streak = 0;
    this.streakEl.className = 'streak streak--broken';
    setTimeout(() => {
      if (this.streak < 2) this.streakEl.hidden = true;
    }, 600);
  }

  destroy(): void {
    this.layer.remove();
  }
}
