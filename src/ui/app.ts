import { BALANCE } from '../config/balance';
import { CryptoRng, type Rng } from '../core/rng';
import { Run } from '../core/run';
import { loadSave, writeSave, type SaveData } from '../core/storage';
import { formatClock } from '../core/timer';
import { GAMES, globalMinBet } from '../games/registry';
import { RISK_LABEL, type GameContext, type GameView } from '../games/types';
import { h, isTypingTarget, money, setMotionPref, svg, systemPrefersReducedMotion, type MotionPref } from './dom';
import { Sound } from './sound';
import { introMessage, lostMessage, mobsterFor, paidMessage } from './story';
import { roundParams } from '../core/rounds';

const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_HELP = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 9.3a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8v.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor"/></svg>`;

export class App {
  private save: SaveData = loadSave();
  private sound = new Sound(this.save.muted);
  private rng: Rng = new CryptoRng();
  private run: Run | null = null;
  private views = new Map<string, GameView>();
  private current = GAMES[0].id;
  private abort: AbortController | null = null;
  private lastBeepSecond = -1;
  private modalOpen: HTMLElement | null = null;

  // Éléments fixes
  private hud: HTMLElement;
  private hudRound: HTMLElement;
  private hudMoney: HTMLElement;
  private hudDebt: HTMLElement;
  private hudTimer: HTMLElement;
  private hudTimerBar: HTMLElement;
  private hudProgress: HTMLElement;
  private payBtn: HTMLButtonElement;
  private muteBtn: HTMLButtonElement;
  private tabs: HTMLElement;
  private tabButtons = new Map<string, HTMLButtonElement>();
  private stage: HTMLElement;
  private screen: HTMLElement;
  private modalRoot: HTMLElement;
  private toasts: HTMLElement;

  constructor(root: HTMLElement) {
    setMotionPref(this.save.motion);
    this.hudRound = h('strong', { class: 'hud__value' });
    this.hudMoney = h('strong', { class: 'hud__value hud__value--money' });
    this.hudDebt = h('strong', { class: 'hud__value hud__value--debt' });
    this.hudTimer = h('strong', { class: 'hud__timer-value', role: 'timer', 'aria-live': 'off' });
    this.hudTimerBar = h('span', { class: 'hud__timer-bar' });
    this.hudProgress = h('span', { class: 'hud__progress-bar' });
    this.payBtn = h(
      'button',
      { class: 'btn btn--pay', type: 'button', onclick: () => this.pay(), 'aria-keyshortcuts': 'P' },
      h('span', { class: 'btn--pay__label' }, 'Rembourser'),
      h('kbd', { 'aria-hidden': 'true' }, 'P'),
    );
    this.muteBtn = h('button', {
      class: 'icon-btn',
      type: 'button',
      onclick: () => this.toggleMute(),
      'aria-keyshortcuts': 'M',
    });
    const helpBtn = h('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': 'Aide et raccourcis',
      onclick: () => this.showHelp(),
    });
    helpBtn.append(svg(ICON_HELP));

    this.hud = h(
      'header',
      { class: 'hud', hidden: true },
      h(
        'div',
        { class: 'hud__cell hud__cell--round' },
        h('span', { class: 'hud__label' }, 'Manche'),
        this.hudRound,
      ),
      h(
        'div',
        { class: 'hud__cell hud__cell--timer' },
        h('span', { class: 'hud__label' }, 'Temps'),
        this.hudTimer,
        h('span', { class: 'hud__timer-track' }, this.hudTimerBar),
      ),
      h('div', { class: 'hud__cell hud__cell--tools' }, this.muteBtn, helpBtn),
      h(
        'div',
        { class: 'hud__cell hud__cell--money' },
        h('span', { class: 'hud__label' }, 'Argent'),
        this.hudMoney,
        h('span', { class: 'hud__progress', 'aria-hidden': 'true' }, this.hudProgress),
      ),
      h('div', { class: 'hud__cell hud__cell--debt' }, h('span', { class: 'hud__label' }, 'Dette'), this.hudDebt),
      h('div', { class: 'hud__cell hud__cell--pay' }, this.payBtn),
    );

    this.tabs = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Jeux', hidden: true });
    GAMES.forEach((g, i) => {
      const b = h(
        'button',
        {
          class: 'tab',
          type: 'button',
          role: 'tab',
          'aria-selected': 'false',
          'aria-keyshortcuts': String(i + 1),
          onclick: () => this.select(g.id),
        },
        svg(g.icon),
        h('span', { class: 'tab__name' }, g.name),
        h('span', { class: `tab__risk risk--${g.risk}`, title: RISK_LABEL[g.risk] }, RISK_LABEL[g.risk].replace('Risque ', '')),
        h('kbd', { 'aria-hidden': 'true' }, String(i + 1)),
      );
      this.tabButtons.set(g.id, b);
      this.tabs.append(b);
    });

    this.stage = h('main', { class: 'stage', id: 'stage' });
    this.screen = h('div', { class: 'screen', hidden: true });
    this.modalRoot = h('div', { class: 'modal-root' });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite', role: 'status' });

    root.append(this.hud, this.tabs, this.stage, this.screen, this.modalRoot, this.toasts);
    this.renderMute();
    // Les écrans et la modale se placent sous le HUD, qui reste toujours visible.
    new ResizeObserver(() =>
      document.documentElement.style.setProperty('--hud-h', `${this.hud.offsetHeight}px`),
    ).observe(this.hud);

    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    const unlock = () => this.sound.unlock();
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });

    this.showTitle();
    const frame = () => {
      this.tick();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    // Filet de sécurité si requestAnimationFrame est ralenti.
    setInterval(() => this.tick(), 250);
  }

  /* ------------------------------ Écrans ------------------------------ */

  private showScreen(content: HTMLElement, cls: string): void {
    this.screen.className = `screen screen--${cls}`;
    this.screen.replaceChildren(content);
    this.screen.hidden = false;
    content.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  private hideScreen(): void {
    this.screen.hidden = true;
    this.screen.replaceChildren();
  }

  private showTitle(): void {
    this.hud.hidden = true;
    this.tabs.hidden = true;
    const best = this.save.bestRound;
    this.showScreen(
      h(
        'div',
        { class: 'title' },
        h('p', { class: 'title__eyebrow' }, 'Casino clandestin · depuis 1951'),
        h('h1', { class: 'neon-sign' }, h('span', {}, 'Le Trèfle'), h('span', { class: 'neon-sign__accent' }, 'Noir')),
        h(
          'p',
          { class: 'title__pitch' },
          'Vous devez de l\'argent à la Famille. Chaque manche, elle fixe une somme et un délai. Gagnez assez au casino pour payer… avant que le chrono ne tombe à zéro.',
        ),
        h(
          'button',
          { class: 'btn btn--primary btn--big', type: 'button', 'data-autofocus': true, onclick: () => this.newRun() },
          h('span', {}, 'Pousser la porte'),
          h('kbd', { 'aria-hidden': 'true' }, 'Entrée'),
        ),
        best
          ? h('p', { class: 'title__best' }, `Record : ${best} manche${best > 1 ? 's' : ''} remboursée${best > 1 ? 's' : ''} · ${money(this.save.bestRepaid)} rendus à la Famille`)
          : null,
        this.motionControl(),
        h('p', { class: 'title__fine' }, 'Jeu de divertissement · argent entièrement fictif · aucun paiement réel.'),
      ),
      'title',
    );
  }

  private newRun(): void {
    this.destroyViews();
    this.run = new Run(globalMinBet);
    this.run.wallet.subscribe(() => this.renderHud());
    this.current = GAMES[0].id;
    this.showIntro();
  }

  private showIntro(): void {
    const run = this.run!;
    const p = run.params;
    const mob = mobsterFor(run.round);
    this.hud.hidden = false;
    this.tabs.hidden = true;
    this.renderHud();
    this.showScreen(
      h(
        'div',
        { class: 'letter' },
        h('p', { class: 'letter__round' }, `Manche ${run.round}`),
        h('p', { class: 'letter__text' }, `« ${introMessage(run.round, p.debt, p.timeSec)} »`),
        h('p', { class: 'letter__sign' }, `— ${mob.name}, ${mob.title}`),
        h(
          'dl',
          { class: 'letter__terms' },
          h('div', {}, h('dt', {}, 'Dette'), h('dd', {}, money(p.debt))),
          h('div', {}, h('dt', {}, 'Délai'), h('dd', {}, formatClock(p.timeSec * 1000))),
          h('div', {}, h('dt', {}, 'Avance'), h('dd', {}, `+ ${money(p.capital)}`)),
          h('div', {}, h('dt', {}, 'En poche'), h('dd', {}, money(run.wallet.balance))),
        ),
        h(
          'button',
          { class: 'btn btn--primary btn--big', type: 'button', 'data-autofocus': true, onclick: () => this.startRound() },
          h('span', {}, 'Au travail'),
          h('kbd', { 'aria-hidden': 'true' }, 'Entrée'),
        ),
        h('p', { class: 'letter__fine' }, 'Le chrono démarre dès que vous entrez dans la salle et ne s\'arrête pas.'),
      ),
      'intro',
    );
  }

  private startRound(): void {
    const run = this.run;
    if (!run || run.phase !== 'intro') return;
    this.hideScreen();
    this.createViews();
    this.tabs.hidden = false;
    this.lastBeepSecond = -1;
    run.start();
    this.renderHud();
    if (!this.save.seenHelp) {
      this.save.seenHelp = true;
      writeSave(this.save);
      this.toast('Astuce : la touche ? affiche les règles et les raccourcis.', 'info');
    }
  }

  private pay(): void {
    const run = this.run;
    if (!run) return;
    if (run.phase === 'playing' && run.wallet.inPlay > 0)
      return this.toast('Terminez le coup en cours avant de payer.', 'info');
    if (!run.pay()) {
      if (run.phase === 'playing') this.toast(`Il manque ${money(run.debt - run.wallet.balance)}.`, 'info');
      return;
    }
    this.sound.play('pay');
    this.destroyViews();
    this.closeModal();
    this.recordBest();
    this.tabs.hidden = true;
    document.body.classList.remove('urgent');
    this.renderHud();
    const next = roundParams(run.round + 1);
    const left = Math.round(run.timer.remainingMs() / 1000);
    this.showScreen(
      h(
        'div',
        { class: 'letter letter--paid' },
        h('p', { class: 'stamp', 'aria-hidden': 'true' }, 'Payé'),
        h('p', { class: 'letter__round' }, `Manche ${run.round} remboursée`),
        h('p', { class: 'letter__text' }, `« ${paidMessage(run.round)} »`),
        h('p', { class: 'letter__sign' }, `— ${mobsterFor(run.round).name}`),
        h(
          'dl',
          { class: 'letter__terms' },
          h('div', {}, h('dt', {}, 'Il vous reste'), h('dd', {}, money(run.wallet.balance))),
          h('div', {}, h('dt', {}, 'Temps restant'), h('dd', {}, `${left} s`)),
          h('div', {}, h('dt', {}, 'Prochaine dette'), h('dd', {}, money(next.debt))),
          h('div', {}, h('dt', {}, 'Total rendu'), h('dd', {}, money(run.totalRepaid))),
        ),
        h(
          'button',
          {
            class: 'btn btn--primary btn--big',
            type: 'button',
            'data-autofocus': true,
            onclick: () => {
              run.nextRound();
              this.showIntro();
            },
          },
          h('span', {}, 'Manche suivante'),
          h('kbd', { 'aria-hidden': 'true' }, 'Entrée'),
        ),
      ),
      'paid',
    );
  }

  private lose(): void {
    const run = this.run!;
    this.destroyViews();
    this.closeModal();
    this.sound.play('gameOver');
    document.body.classList.remove('urgent');
    this.tabs.hidden = true;
    const isRecord = this.recordBest();
    this.renderHud();
    this.showScreen(
      h(
        'div',
        { class: 'letter letter--lost' },
        h('p', { class: 'letter__round' }, 'Fin de partie'),
        h('h2', { class: 'lost__title' }, 'La Famille est passée.'),
        h('p', { class: 'letter__text' }, lostMessage(run.lossReason ?? 'time')),
        h(
          'dl',
          { class: 'letter__terms' },
          h('div', {}, h('dt', {}, 'Manches remboursées'), h('dd', {}, String(run.roundsCleared))),
          h('div', {}, h('dt', {}, 'Total rendu'), h('dd', {}, money(run.totalRepaid))),
          h('div', {}, h('dt', {}, 'Record'), h('dd', {}, `${this.save.bestRound} manche${this.save.bestRound > 1 ? 's' : ''}`)),
        ),
        isRecord ? h('p', { class: 'lost__record' }, 'Nouveau record !') : null,
        h(
          'button',
          { class: 'btn btn--primary btn--big', type: 'button', 'data-autofocus': true, onclick: () => this.newRun() },
          h('span', {}, 'Recommencer à la manche 1'),
          h('kbd', { 'aria-hidden': 'true' }, 'Entrée'),
        ),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => this.showTitle() }, 'Retour à l\'entrée'),
      ),
      'lost',
    );
  }

  private recordBest(): boolean {
    const run = this.run!;
    let record = false;
    if (run.roundsCleared > this.save.bestRound) {
      this.save.bestRound = run.roundsCleared;
      record = true;
    }
    this.save.bestRepaid = Math.max(this.save.bestRepaid, run.totalRepaid);
    writeSave(this.save);
    return record && run.phase === 'lost';
  }

  /* ------------------------------- Jeux ------------------------------- */

  private createViews(): void {
    this.destroyViews();
    const run = this.run!;
    this.abort = new AbortController();
    const ctx: GameContext = {
      wallet: run.wallet,
      rng: this.rng,
      sound: this.sound,
      round: run.round,
      signal: this.abort.signal,
      changed: () => this.tick(),
      toast: (m, k) => this.toast(m, k),
      openModal: (t, b) => this.openModal(t, b),
    };
    for (const g of GAMES) {
      const v = g.create(ctx);
      v.el.hidden = true;
      v.el.setAttribute('role', 'tabpanel');
      this.views.set(g.id, v);
      this.stage.append(v.el);
    }
    this.select(this.current);
  }

  private destroyViews(): void {
    this.abort?.abort();
    this.abort = null;
    for (const v of this.views.values()) v.destroy?.();
    this.views.clear();
    this.stage.replaceChildren();
  }

  private select(id: string): void {
    if (!this.views.has(id)) return;
    this.current = id;
    for (const [gid, v] of this.views) v.el.hidden = gid !== id;
    for (const [gid, b] of this.tabButtons) b.setAttribute('aria-selected', String(gid === id));
    this.views.get(id)!.onShow?.();
    this.sound.play('click');
  }

  /* ------------------------------- HUD -------------------------------- */

  private tick(): void {
    const run = this.run;
    if (!run) return;
    if (run.phase === 'playing') {
      if (run.update() === 'lost') {
        this.lose();
        return;
      }
      const ms = run.timer.remainingMs();
      const sec = Math.ceil(ms / 1000);
      const urgent = ms <= BALANCE.rounds.warningSec * 1000;
      document.body.classList.toggle('urgent', urgent);
      if (urgent && sec !== this.lastBeepSecond && run.timer.running) {
        this.lastBeepSecond = sec;
        this.sound.play(sec <= 10 ? 'alarmHigh' : 'alarm');
      }
    }
    this.renderHud();
  }

  private renderHud(): void {
    const run = this.run;
    if (!run) return;
    const w = run.wallet;
    const ms = run.phase === 'intro' ? run.params.timeSec * 1000 : run.timer.remainingMs();
    this.hudRound.textContent = String(run.round);
    this.hudMoney.textContent = money(w.balance);
    this.hudDebt.textContent = money(run.debt);
    const clock = formatClock(ms);
    if (this.hudTimer.textContent !== clock) {
      this.hudTimer.textContent = clock;
      this.hudTimer.setAttribute('aria-label', `Temps restant ${clock}`);
    }
    this.hudTimerBar.style.transform = `scaleX(${ms / (run.params.timeSec * 1000)})`;
    this.hudProgress.style.transform = `scaleX(${Math.min(1, w.balance / run.debt)})`;
    this.hud.classList.toggle('hud--urgent', run.phase === 'playing' && ms <= BALANCE.rounds.warningSec * 1000);
    this.hud.classList.toggle('hud--paused', run.phase !== 'playing');
    const can = run.canPay();
    this.payBtn.disabled = run.phase !== 'playing';
    this.payBtn.classList.toggle('btn--pay-ready', can);
    const label = this.payBtn.querySelector('.btn--pay__label')!;
    const txt = can ? `Payer ${money(run.debt)}` : run.phase === 'playing' && w.inPlay > 0 ? 'Coup en cours…' : 'Rembourser';
    if (label.textContent !== txt) label.textContent = txt;
    this.payBtn.setAttribute('aria-label', can ? `Rembourser la dette de ${money(run.debt)}` : `Rembourser (il faut ${money(run.debt)})`);
  }

  private onVisibility(): void {
    const run = this.run;
    if (!run || run.phase !== 'playing') return;
    if (document.hidden) run.timer.pause();
    else {
      run.timer.start();
      this.toast('De retour à la table. Le chrono repart.', 'info');
    }
  }

  private toggleMute(): void {
    this.sound.muted = !this.sound.muted;
    this.save.muted = this.sound.muted;
    writeSave(this.save);
    this.renderMute();
    if (!this.sound.muted) this.sound.play('chip');
  }

  private renderMute(): void {
    this.muteBtn.replaceChildren(svg(this.sound.muted ? ICON_SOUND_OFF : ICON_SOUND_ON));
    this.muteBtn.setAttribute('aria-label', this.sound.muted ? 'Activer le son' : 'Couper le son');
    this.muteBtn.setAttribute('aria-pressed', String(this.sound.muted));
  }

  /* --------------------------- Modale, toasts -------------------------- */

  openModal(title: string, body: Node): void {
    this.closeModal();
    const close = h('button', { class: 'icon-btn modal__close', type: 'button', 'aria-label': 'Fermer', onclick: () => this.closeModal() }, '✕');
    const panel = h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal__head' }, h('h2', {}, title), close),
      h('div', { class: 'modal__body' }, body),
    );
    const backdrop = h('div', {
      class: 'modal-backdrop',
      onclick: (e: Event) => e.target === backdrop && this.closeModal(),
    });
    backdrop.append(panel);
    this.modalRoot.append(backdrop);
    this.modalOpen = backdrop;
    close.focus();
  }

  closeModal(): void {
    this.modalOpen?.remove();
    this.modalOpen = null;
  }

  /** Sélecteur « Animations : Système / Complètes / Réduites ». */
  private motionControl(): HTMLElement {
    const options: [MotionPref, string][] = [
      ['auto', 'Système'],
      ['full', 'Complètes'],
      ['reduce', 'Réduites'],
    ];
    const hint = h('p', { class: 'motion-pref__hint' });
    const renderHint = () => {
      hint.textContent =
        this.save.motion === 'auto'
          ? systemPrefersReducedMotion()
            ? 'Votre système demande des animations réduites : la roue et les rouleaux tournent à peine. Choisissez « Complètes » pour tout voir.'
            : 'Le jeu suit le réglage d\'animations de votre système.'
          : '';
    };
    const buttons = options.map(([value, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'motion-pref__btn',
          role: 'radio',
          'aria-checked': String(this.save.motion === value),
          onclick: () => {
            this.save.motion = value;
            writeSave(this.save);
            setMotionPref(value);
            buttons.forEach((b, i) => b.setAttribute('aria-checked', String(options[i][0] === value)));
            renderHint();
            this.sound.play('click');
          },
        },
        label,
      ),
    );
    renderHint();
    return h(
      'div',
      { class: 'motion-pref' },
      h('div', { class: 'motion-pref__group', role: 'radiogroup', 'aria-label': 'Animations' }, h('span', { class: 'motion-pref__label' }, 'Animations'), ...buttons),
      hint,
    );
  }

  private showHelp(): void {
    const g = GAMES.find((x) => x.id === this.current)!;
    const view = this.views.get(this.current);
    const keys: [string, string][] = [
      ['1 – ' + GAMES.length, 'Changer de jeu'],
      ['P', 'Rembourser la dette'],
      ['M', 'Couper / rétablir le son'],
      ['?', 'Cette aide'],
      ['Échap', 'Fermer une fenêtre'],
    ];
    const kv = (list: [string, string][]) =>
      h('dl', { class: 'keys' }, ...list.map(([k, d]) => h('div', {}, h('dt', {}, h('kbd', {}, k)), h('dd', {}, d))));
    this.openModal(
      `Règles — ${g.name}`,
      h(
        'div',
        {},
        view ? view.rules() : null,
        h('h3', {}, 'Raccourcis de ce jeu'),
        kv(g.keys),
        h('h3', {}, 'Animations'),
        this.motionControl(),
        h('h3', {}, 'Raccourcis généraux'),
        kv(keys),
        h(
          'p',
          { class: 'rules__fine' },
          `Tous les jeux rendent entre 97 % et 99 % des mises sur la durée : ils diffèrent par le risque, pas par la rentabilité. Le hasard ne dépend jamais de votre situation.`,
        ),
      ),
    );
  }

  toast(message: string, kind: 'win' | 'lose' | 'info' = 'info'): void {
    const t = h('div', { class: `toast toast--${kind}` }, message);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('toast--out'), 2200);
    setTimeout(() => t.remove(), 2600);
  }

  /* ------------------------------ Clavier ------------------------------ */

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
    if (this.modalOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeModal();
      }
      return;
    }
    // Écrans (intro, fin…) : Entrée active le bouton principal.
    if (!this.screen.hidden) {
      if (e.key === 'Enter' || e.key === ' ') {
        const btn = this.screen.querySelector<HTMLButtonElement>('[data-autofocus]');
        if (btn && document.activeElement !== btn) {
          e.preventDefault();
          btn.click();
        }
      }
      return;
    }
    if (this.run?.phase !== 'playing') return;
    const k = e.key;
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= GAMES.length && !e.shiftKey) {
      e.preventDefault();
      this.select(GAMES[n - 1].id);
      return;
    }
    if (k === 'p' || k === 'P') return (e.preventDefault(), this.pay());
    if (k === 'm' || k === 'M') return (e.preventDefault(), this.toggleMute());
    if (k === '?' || k === 'F1') return (e.preventDefault(), this.showHelp());
    // Ne pas intercepter Espace/Entrée quand un bouton a le focus : le navigateur l'active déjà.
    if ((k === ' ' || k === 'Enter') && document.activeElement instanceof HTMLButtonElement) return;
    const view = this.views.get(this.current);
    if (view?.onKey?.(e)) e.preventDefault();
  }
}
