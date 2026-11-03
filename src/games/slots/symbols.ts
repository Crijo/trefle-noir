import type { SlotSymbol } from '../../config/balance';

/** Symboles dessinés en SVG (viewBox 64×64). */
export const SYMBOL_SVG: Record<SlotSymbol, string> = {
  W: `<svg viewBox="0 0 64 64"><defs><linearGradient id="gW" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bff9ff"/><stop offset=".5" stop-color="#2fd6ef"/><stop offset="1" stop-color="#0a6b8a"/></linearGradient></defs>
    <path d="M16 18h32l10 12-26 28L6 30z" fill="url(#gW)" stroke="#063848" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6 30h52M16 18l8 12 8-12 8 12 8-12M24 30l8 28 8-28" fill="none" stroke="#063848" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="12" y="4" width="40" height="11" rx="2" fill="#ff3d8b"/><text x="32" y="13" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="10" fill="#fff" letter-spacing="1.5">JOKER</text></svg>`,
  S: `<svg viewBox="0 0 64 64"><defs><radialGradient id="gS" cx="40%" cy="40%" r="70%"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".6" stop-color="#c9932f"/><stop offset="1" stop-color="#7a5414"/></radialGradient></defs>
    <path d="M24 14c-2-4 1-8 4-6 2-3 6-3 8 0 3-2 6 2 4 6z" fill="#8a5d1c" stroke="#3a2608" stroke-width="1.5"/>
    <path d="M22 16h20c12 8 16 20 14 30-2 10-12 13-24 13S10 56 8 46c-2-10 2-22 14-30z" fill="url(#gS)" stroke="#3a2608" stroke-width="2"/>
    <rect x="21" y="14" width="22" height="5" rx="2" fill="#3a2608"/>
    <text x="32" y="50" text-anchor="middle" font-family="Limelight, Georgia, serif" font-size="26" fill="#2a1a04">$</text></svg>`,
  SEVEN: `<svg viewBox="0 0 64 64"><path d="M12 10h42v9L32 58H19l22-37H12z" fill="#c4122f" stroke="#e8c26a" stroke-width="3" stroke-linejoin="round"/><path d="M15 13h36" stroke="#ff8aa0" stroke-width="2"/></svg>`,
  HAT: `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="44" rx="28" ry="8" fill="#1b1714" stroke="#000" stroke-width="1.5"/><path d="M14 42c0-14 3-26 18-26s18 12 18 26c-6 3-30 3-36 0z" fill="#2b2420" stroke="#000" stroke-width="1.5"/><path d="M24 18c4 4 12 4 16 0" stroke="#000" stroke-width="2" fill="none"/><path d="M14.5 36c8 3 27 3 35 0v5c-8 3-27 3-35 0z" fill="#9b1028"/></svg>`,
  GLASS: `<svg viewBox="0 0 64 64"><path d="M14 14h36l-4 40H18z" fill="#ffffff55" stroke="#4a3a2a" stroke-width="2" stroke-linejoin="round"/><path d="M16.5 32h31l-2.5 21h-26z" fill="#d68a1e" opacity=".9"/><rect x="22" y="26" width="12" height="11" rx="2" fill="#e8f7ff" opacity=".85" transform="rotate(-12 28 31)"/><path d="M19 18l2 30" stroke="#fff" stroke-width="2" opacity=".6"/></svg>`,
  CIGAR: `<svg viewBox="0 0 64 64"><path d="M14 18c4-6-2-8 2-13M20 20c4-5-1-8 3-12" stroke="#8b8b8b" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/><rect x="8" y="34" width="50" height="11" rx="5.5" fill="#7a4a22" stroke="#3a210c" stroke-width="1.5" transform="rotate(-18 33 39)"/><rect x="34" y="30" width="8" height="12" fill="#c4122f" transform="rotate(-18 33 39)"/><circle cx="11" cy="47" r="4" fill="#ff7a2e"/></svg>`,
  DICE: `<svg viewBox="0 0 64 64"><rect x="10" y="10" width="44" height="44" rx="9" fill="#b51632" stroke="#5a0614" stroke-width="2" transform="rotate(8 32 32)"/><g fill="#fff" transform="rotate(8 32 32)"><circle cx="21" cy="21" r="4.5"/><circle cx="32" cy="32" r="4.5"/><circle cx="43" cy="43" r="4.5"/><circle cx="43" cy="21" r="4.5"/><circle cx="21" cy="43" r="4.5"/></g></svg>`,
  CHERRY: `<svg viewBox="0 0 64 64"><path d="M33 8c-6 10-12 18-14 30M33 8c4 10 10 18 13 32" stroke="#2e5a1c" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M33 8c6-4 14-3 18 2-6 3-12 3-18-2z" fill="#3f8a2a"/><circle cx="19" cy="44" r="11" fill="#c4122f" stroke="#5a0614" stroke-width="1.5"/><circle cx="46" cy="45" r="11" fill="#d41a38" stroke="#5a0614" stroke-width="1.5"/><circle cx="15" cy="40" r="3" fill="#fff" opacity=".6"/><circle cx="42" cy="41" r="3" fill="#fff" opacity=".6"/></svg>`,
};

export const SYMBOL_NAME: Record<SlotSymbol, string> = {
  W: 'Joker (diamant)',
  S: 'Magot (dispersion)',
  SEVEN: 'Sept',
  HAT: 'Feutre',
  GLASS: 'Whisky',
  CIGAR: 'Cigare',
  DICE: 'Dé',
  CHERRY: 'Cerises',
};

/** Couleurs des lignes gagnantes. */
export const LINE_COLORS = ['#ff3d8b', '#43f0ff', '#ffd23f', '#7dffb2', '#c58bff', '#ff8a3d', '#5ab0ff', '#ff5e5e', '#b6ff3d', '#ffffff'];
