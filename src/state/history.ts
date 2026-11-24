// Real fight histories (before the world began), from Wikipedia's MMA record
// tables. A separate file, fetched only when someone opens a real fighter.

import { useEffect, useState } from "react";

export interface HistoryRow {
  r: "W" | "L" | "D" | "NC";
  opp: string;
  method: string;
  event: string;
  /** YYYY-MM-DD */
  date: string;
  round: number;
  time: string;
  notes?: string;
  /** The opponent's id when they are in the game. */
  oid?: string;
}

export interface FighterHistory {
  /** The Wikipedia article it came from. */
  title: string;
  /** Wins, losses and draws that didn't match the official record (0 when it all matches). */
  off: number;
  rows: HistoryRow[];
}

type Raw = { t: string; off?: number; h: (string | number | null)[][] };
let file: Promise<Record<string, Raw>> | null = null;

export function loadHistory(): Promise<Record<string, Raw>> {
  if (!file) {
    file = fetch(`${import.meta.env.BASE_URL}data/history.json`)
      .then((r) => (r.ok ? r.json() : { f: {} }))
      .then((j) => (j.f ?? {}) as Record<string, Raw>)
      .catch(() => ({}));
  }
  return file;
}

function rowsOf(raw: Raw): FighterHistory {
  return {
    title: raw.t,
    off: raw.off ?? 0,
    rows: raw.h.map((h) => ({
      r: h[0] as HistoryRow["r"],
      opp: String(h[1] ?? ""),
      method: String(h[2] ?? ""),
      event: String(h[3] ?? ""),
      date: String(h[4] ?? ""),
      round: Number(h[5] ?? 0),
      time: String(h[6] ?? ""),
      notes: h[7] ? String(h[7]) : undefined,
      oid: h[8] ? String(h[8]) : undefined,
    })),
  };
}

/** undefined while loading, null when there is none. */
export function useHistory(id: string, real: boolean | undefined): FighterHistory | null | undefined {
  const [h, setH] = useState<FighterHistory | null | undefined>(real ? undefined : null);
  useEffect(() => {
    if (!real) {
      setH(null);
      return;
    }
    let live = true;
    setH(undefined);
    loadHistory().then((all) => {
      if (live) setH(all[id] ? rowsOf(all[id]) : null);
    });
    return () => {
      live = false;
    };
  }, [id, real]);
  return h;
}

/** The latest title a real fighter won before the world began, from the notes. */
export function realTitleWin(h: FighterHistory, promo: string): { date: string; defenses: number; interim: boolean } | null {
  const rows = [...h.rows].reverse(); // oldest first
  let won: { date: string; defenses: number; interim: boolean } | null = null;
  for (const r of rows) {
    const n = (r.notes ?? "").toLowerCase();
    if (!n.includes(promo.toLowerCase())) continue;
    if (/\bwon the\b.*championship/.test(n) && r.r === "W") won = { date: r.date, defenses: 0, interim: n.includes("interim") };
    else if (/\b(defended|retained)\b.*championship/.test(n) && r.r === "W" && won) won.defenses++;
    else if (/\blost the\b.*championship/.test(n)) won = null;
    else if (/\bpromoted to undisputed\b/.test(n) && won) won.interim = false;
  }
  return won;
}
