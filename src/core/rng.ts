/**
 * Générateurs aléatoires. Le jeu n'utilise QUE l'interface `Rng` : aucune logique
 * ne regarde l'état du joueur pour influencer un tirage. En production on utilise
 * `CryptoRng` ; les tests et la simulation injectent `SeededRng` (graine fixe).
 */
export interface Rng {
  /** Flottant uniforme dans [0, 1). */
  next(): number;
  /** Entier uniforme dans [0, n). */
  int(n: number): number;
}

/** Mélange de Fisher–Yates en place. */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** xoshiro128** — rapide, bonne qualité statistique, reproductible. */
export class SeededRng implements Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed = 0x9e3779b9) {
    // splitmix32 pour initialiser l'état à partir d'une seule graine.
    let x = seed >>> 0;
    const sm = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s0 = sm();
    this.s1 = sm();
    this.s2 = sm();
    this.s3 = sm();
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  next(): number {
    return this.nextU32() / 4294967296;
  }

  int(n: number): number {
    return uniformInt(n, () => this.nextU32());
  }
}

/** Hasard cryptographique du navigateur, tiré par blocs pour limiter les appels. */
export class CryptoRng implements Rng {
  private buf = new Uint32Array(256);
  private idx = 256;

  private u32(): number {
    if (this.idx >= this.buf.length) {
      crypto.getRandomValues(this.buf);
      this.idx = 0;
    }
    return this.buf[this.idx++];
  }

  next(): number {
    return this.u32() / 4294967296;
  }

  int(n: number): number {
    return uniformInt(n, () => this.u32());
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Entier uniforme sans biais de modulo (échantillonnage par rejet). */
function uniformInt(n: number, u32: () => number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 4294967296) throw new RangeError(`int(${n})`);
  const limit = 4294967296 - (4294967296 % n);
  let v: number;
  do v = u32();
  while (v >= limit);
  return v % n;
}
