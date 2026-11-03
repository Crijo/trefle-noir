/** Meilleur score et réglages, persistés dans localStorage (tolérant aux erreurs). */
export interface SaveData {
  bestRound: number;
  bestRepaid: number;
  muted: boolean;
  seenHelp: boolean;
  /** Animations : suivre le système, complètes ou réduites. */
  motion: 'auto' | 'full' | 'reduce';
}

const KEY = 'noir-casino:v1';
const DEFAULTS: SaveData = { bestRound: 0, bestRepaid: 0, muted: false, seenHelp: false, motion: 'auto' };

export function loadSave(storage: Storage | undefined = safeStorage()): SaveData {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<SaveData>;
    return {
      bestRound: num(data.bestRound),
      bestRepaid: num(data.bestRepaid),
      muted: data.muted === true,
      seenHelp: data.seenHelp === true,
      motion: data.motion === 'full' || data.motion === 'reduce' ? data.motion : 'auto',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSave(data: SaveData, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(data));
  } catch {
    /* stockage indisponible (navigation privée…) : on ignore */
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
