import { describe, expect, it } from 'vitest';
import { Countdown, formatClock } from '../src/core/timer';
import { Run } from '../src/core/run';
import { Wallet } from '../src/core/wallet';
import { SeededRng } from '../src/core/rng';
import { niceRound, roundParams } from '../src/core/rounds';
import { loadSave, writeSave } from '../src/core/storage';

const fakeClock = () => {
  let t = 0;
  const clock = () => t;
  return { clock, advance: (ms: number) => (t += ms) };
};

describe('compte à rebours', () => {
  it('se base sur l\'horloge et non sur les images', () => {
    const c = fakeClock();
    const cd = new Countdown(10_000, c.clock);
    cd.start();
    c.advance(3_500);
    expect(cd.remainingMs()).toBe(6_500);
    cd.pause();
    c.advance(60_000); // en arrière-plan
    expect(cd.remainingMs()).toBe(6_500);
    cd.start();
    c.advance(7_000);
    expect(cd.expired()).toBe(true);
    expect(cd.remainingMs()).toBe(0);
  });

  it('formate mm:ss en arrondissant à la seconde supérieure', () => {
    expect(formatClock(180_000)).toBe('03:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(500)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
  });
});

describe('portefeuille', () => {
  it('suit les mises en jeu', () => {
    const w = new Wallet(100);
    w.take('bj', 30);
    expect(w.balance).toBe(70);
    expect(w.inPlay).toBe(30);
    expect(() => w.take('bj', 500)).toThrow();
    w.settle('bj', 60);
    expect(w.balance).toBe(130);
    expect(w.inPlay).toBe(0);
  });

  it('signale chaque coup réglé avec la mise et le retour', () => {
    const w = new Wallet(100);
    const events: unknown[] = [];
    w.onSettle((e) => events.push(e));
    w.take('bj', 20);
    w.take('bj', 20); // doublement
    w.settle('bj', 80);
    expect(events).toEqual([{ game: 'bj', staked: 40, returned: 80 }]);
  });
});

describe('déroulé d\'une partie', () => {
  it('rembourser fait passer à la manche suivante avec l\'argent restant', () => {
    const c = fakeClock();
    const run = new Run(() => 10, c.clock);
    const p1 = roundParams(1);
    expect(run.wallet.balance).toBe(p1.capital);
    run.start();
    expect(run.canPay()).toBe(false);
    run.wallet.deposit(p1.debt); // gains simulés
    expect(run.pay()).toBe(true);
    expect(run.phase).toBe('won');
    run.nextRound();
    expect(run.round).toBe(2);
    expect(run.wallet.balance).toBe(p1.capital + roundParams(2).capital);
    expect(run.debt).toBeGreaterThan(p1.debt);
  });

  it('perd quand le temps est écoulé', () => {
    const c = fakeClock();
    const run = new Run(() => 10, c.clock);
    run.start();
    c.advance(roundParams(1).timeSec * 1000 + 1);
    expect(run.update()).toBe('lost');
    expect(run.lossReason).toBe('time');
  });

  it('perd quand l\'argent ne couvre plus la mise minimale', () => {
    const run = new Run(() => 10, fakeClock().clock);
    run.start();
    run.wallet.withdraw(run.wallet.balance - 5);
    expect(run.update()).toBe('lost');
    expect(run.lossReason).toBe('broke');
  });

  it('ne déclare pas la faillite pendant un coup en cours', () => {
    const run = new Run(() => 10, fakeClock().clock);
    run.start();
    run.wallet.take('bj', run.wallet.balance);
    expect(run.update()).toBe('playing');
    expect(run.canPay()).toBe(false);
  });

  it('la difficulté augmente à chaque manche', () => {
    for (let r = 1; r < 8; r++) {
      const a = roundParams(r);
      const b = roundParams(r + 1);
      expect(b.debt).toBeGreaterThan(a.debt);
      expect(b.capital / b.debt).toBeLessThanOrEqual(a.capital / a.debt + 1e-9);
      expect(b.timeSec).toBeLessThanOrEqual(a.timeSec);
    }
    expect(niceRound(1449, 50)).toBe(1400);
  });
});

describe('générateur à graine', () => {
  it('est reproductible', () => {
    const a = new SeededRng(5);
    const b = new SeededRng(5);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    const r = new SeededRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});

describe('sauvegarde', () => {
  it('relit les données et ignore les valeurs corrompues', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    } as unknown as Storage;
    writeSave({ bestRound: 4, bestRepaid: 9000, muted: true, seenHelp: true, motion: 'full' }, storage);
    expect(loadSave(storage)).toEqual({ bestRound: 4, bestRepaid: 9000, muted: true, seenHelp: true, motion: 'full' });
    mem.set('noir-casino:v1', '{"bestRound":-3,"muted":"oui"}');
    expect(loadSave(storage)).toEqual({ bestRound: 0, bestRepaid: 0, muted: false, seenHelp: false, motion: 'auto' });
    mem.set('noir-casino:v1', 'pas du json');
    expect(loadSave(storage).bestRound).toBe(0);
  });
});
