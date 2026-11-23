// Seeded random numbers. Every stream is a single 32-bit state, so it can be
// saved with the world and a save always plays on exactly as it would have.

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // final avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function mix(a: number, b: number): number {
  return hashString(`${a >>> 0}:${b >>> 0}`);
}

export class Rng {
  s: number;
  constructor(seed: number | string) {
    this.s = (typeof seed === "string" ? hashString(seed) : seed >>> 0) || 0x9e3779b9;
  }
  /** Uniform [0, 1). mulberry32. */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Normal deviate (Box-Muller). */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return items[Math.floor(this.next() * items.length)];
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
  /** Weighted choice over a record of key -> weight. */
  choose<K extends string>(weights: Partial<Record<K, number>>): K {
    let total = 0;
    for (const k in weights) total += Math.max(0, weights[k] ?? 0);
    let r = this.next() * total;
    let last: K | undefined;
    for (const k in weights) {
      const w = Math.max(0, weights[k] ?? 0);
      if (w <= 0) continue;
      last = k;
      r -= w;
      if (r <= 0) return k;
    }
    return (last ?? (Object.keys(weights)[0] as K));
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  /** A child stream that does not disturb this one beyond one draw. */
  fork(tag: string | number = 0): Rng {
    return new Rng(mix(Math.floor(this.next() * 4294967296), typeof tag === "number" ? tag : hashString(tag)));
  }
}

/** Deterministic value in [0,1) for a key, without any stream. */
export function noise(key: string): number {
  return hashString(key) / 4294967296;
}
