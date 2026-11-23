// The real-world roster file, fetched once and kept.

import type { RosterFile } from "../world/real";

let roster: RosterFile | null = null;

export async function loadRoster(): Promise<RosterFile> {
  if (roster) return roster;
  const r = await fetch(`${import.meta.env.BASE_URL}data/roster.json`);
  if (!r.ok) throw new Error("Could not load the roster.");
  roster = (await r.json()) as RosterFile;
  return roster;
}
