/** Petits utilitaires DOM sans dépendance. */

type Attrs = Record<string, string | number | boolean | undefined | null | EventListener>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: Element, children: (Child | Child[])[]): void {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Crée un élément SVG à partir de balisage. */
export function svg(markup: string): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGSVGElement;
}

const moneyFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const money = (n: number): string => `${moneyFmt.format(Math.floor(n))} $`;

/** Attente annulable : rejette silencieusement si le signal est interrompu. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('abandon', 'AbortError'));
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('abandon', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

const reducedQuery =
  typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
/** Choix du joueur : suivre le système, ou forcer les animations complètes / réduites. */
export type MotionPref = 'auto' | 'full' | 'reduce';
let motionPref: MotionPref = 'auto';

/** `?motion=full` ou `?motion=reduce` force le réglage (débogage). */
const forced =
  typeof location !== 'undefined' ? new URLSearchParams(location.search).get('motion') : null;

export const systemPrefersReducedMotion = (): boolean => !!reducedQuery?.matches;

export const prefersReducedMotion = (): boolean => {
  const p = forced === 'full' || forced === 'reduce' ? forced : motionPref;
  return p === 'full' ? false : p === 'reduce' ? true : systemPrefersReducedMotion();
};

const applyMotionAttribute = () =>
  document.documentElement.setAttribute('data-motion', prefersReducedMotion() ? 'reduce' : 'full');

export function setMotionPref(p: MotionPref): void {
  motionPref = p;
  applyMotionAttribute();
}

/** Reflète le réglage sur <html data-motion> pour que le CSS suive le même choix. */
export function syncMotionAttribute(): void {
  applyMotionAttribute();
  reducedQuery?.addEventListener('change', applyMotionAttribute);
}

/** Durée d'animation adaptée au réglage « mouvement réduit ». */
export const motion = (ms: number, reduced = 0): number => (prefersReducedMotion() ? reduced : ms);

/**
 * Attend que le navigateur ait appliqué les styles (pour déclencher une transition CSS).
 * Le délai de secours évite de bloquer si requestAnimationFrame est suspendu (onglet masqué).
 */
export const nextFrame = (): Promise<void> =>
  new Promise((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r()));
    setTimeout(r, 60);
  });

export function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
