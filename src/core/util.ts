export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const round1 = (v: number) => Math.round(v * 10) / 10;
export const sum = (a: readonly number[]) => a.reduce((s, x) => s + x, 0);
export const mean = (a: readonly number[]) => (a.length ? sum(a) / a.length : 0);

export function median(a: readonly number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function groupBy<T, K extends string | number>(items: readonly T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = key(it);
    (out[k] ||= []).push(it);
  }
  return out;
}

export function money(v: number, opts: { sign?: boolean; exact?: boolean } = {}): string {
  const neg = v < 0;
  const a = Math.abs(v);
  let s: string;
  if (!opts.exact && a >= 1_000_000) s = `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  else if (!opts.exact && a >= 10_000) s = `$${Math.round(a / 1000)}k`;
  else s = `$${Math.round(a).toLocaleString("en-US")}`;
  if (neg) return `-${s}`;
  return opts.sign && v > 0 ? `+${s}` : s;
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function heightText(inches: number): string {
  const i = Math.round(inches);
  return `${Math.floor(i / 12)}'${i % 12}"`;
}

export function cmOf(inches: number): number {
  return Math.round(inches * 2.54);
}

export function kgOf(lb: number): number {
  return Math.round(lb * 0.4536 * 10) / 10;
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function listText(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function by<T>(f: (t: T) => number, desc = false) {
  return (a: T, b: T) => (desc ? f(b) - f(a) : f(a) - f(b));
}
