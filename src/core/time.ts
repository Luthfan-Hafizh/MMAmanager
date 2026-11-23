// The calendar. Day 0 is Monday 5 October 2026, the date of the roster snapshot.
// Days are plain integers so the world never depends on the player's time zone.

export const EPOCH_UTC = Date.UTC(2026, 9, 5); // months count from 0
const DAY_MS = 86400000;
export const YEAR = 365.25;

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface Ymd {
  y: number;
  m: number; // 0-11
  d: number; // 1-31
  dow: number; // 0 Monday .. 6 Sunday
}

export function ymd(day: number): Ymd {
  const dt = new Date(EPOCH_UTC + day * DAY_MS);
  const js = dt.getUTCDay(); // 0 Sunday
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), dow: (js + 6) % 7 };
}

export function dayOf(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m, d) - EPOCH_UTC) / DAY_MS);
}

export function fmtDate(day: number, opts: { dow?: boolean; year?: boolean } = {}): string {
  const t = ymd(day);
  const parts = [] as string[];
  if (opts.dow) parts.push(DOW[t.dow]);
  parts.push(`${t.d} ${MONTHS[t.m]}`);
  if (opts.year !== false) parts.push(String(t.y));
  return parts.join(" ");
}

export function fmtShort(day: number): string {
  const t = ymd(day);
  return `${t.d} ${MONTHS[t.m]}`;
}

export function fmtMonth(day: number): string {
  const t = ymd(day);
  return `${MONTHS_LONG[t.m]} ${t.y}`;
}

export function isMonday(day: number): boolean {
  return ymd(day).dow === 0;
}

export function isFirstOfMonth(day: number): boolean {
  return ymd(day).d === 1;
}

/** The next day (>= from) that falls on the given weekday (0 Monday .. 6 Sunday). */
export function nextDow(from: number, dow: number): number {
  const cur = ymd(from).dow;
  return from + ((dow - cur + 7) % 7);
}

export function yearOf(day: number): number {
  return ymd(day).y;
}

export function ageAt(birth: number, day: number): number {
  return (day - birth) / YEAR;
}

export function ageYears(birth: number, day: number): number {
  return Math.floor(ageAt(birth, day));
}

export function daysBetween(a: number, b: number): number {
  return Math.abs(b - a);
}

export function weeksText(days: number): string {
  if (days < 0) return "past";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `${days} days`;
  const w = Math.round(days / 7);
  if (w < 9) return `${w} weeks`;
  const m = Math.round(days / 30.4);
  return `${m} months`;
}

export function durationText(days: number): string {
  if (days < 45) return `${days} days`;
  const m = days / 30.44;
  if (m < 18) return `${Math.round(m)} months`;
  return `${(days / YEAR).toFixed(1)} years`;
}

/** mm:ss from seconds. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
