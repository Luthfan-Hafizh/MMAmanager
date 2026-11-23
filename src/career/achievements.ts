// Career milestones for the player's fighters.

import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, Fighter, World } from "../model/types";
import { fullName } from "../world/core";
import { notify } from "./inbox";

export const ACHIEVEMENTS: Record<string, { name: string; desc: string }> = {
  "first-win": { name: "First blood", desc: "Win a professional fight." },
  "first-finish": { name: "Finisher", desc: "Win a fight inside the distance." },
  "first-ko": { name: "Lights out", desc: "Win by knockout." },
  "first-sub": { name: "Tap, snap or nap", desc: "Win by submission." },
  "five-streak": { name: "On a run", desc: "Win five fights in a row." },
  "ten-streak": { name: "Unstoppable", desc: "Win ten fights in a row." },
  "regional-champ": { name: "Regional champion", desc: "Win a regional title." },
  "ufc-debut": { name: "The big show", desc: "Fight in the UFC." },
  "ufc-win": { name: "Octagon winner", desc: "Win a UFC fight." },
  "ranked": { name: "Ranked", desc: "Break into the UFC top 15." },
  "top5": { name: "Top five", desc: "Reach the UFC top five." },
  "ufc-champ": { name: "World champion", desc: "Win a UFC title." },
  "defence-3": { name: "Dynasty", desc: "Defend a UFC title three times." },
  "two-division": { name: "Two-weight world champion", desc: "Hold UFC titles in two divisions." },
  "bonus": { name: "Bonus night", desc: "Win a Fight or Performance of the Night bonus." },
  "upset": { name: "Giant killer", desc: "Beat a ranked fighter as an unranked one." },
};

function grant(w: World, f: Fighter, id: string): void {
  if (w.career.achievements.some((a) => a.id === id && a.fighter === f.id)) return;
  w.career.achievements.push({ id, day: w.day, fighter: f.id });
  const a = ACHIEVEMENTS[id];
  notify(w, { kind: "info", fighter: f.id, from: "Milestone", subject: `${a.name}`, body: `${fullName(f)}: ${a.desc}`, read: false });
}

export function checkAchievements(w: World, f: Fighter, b: Bout): void {
  if (!b.res) return;
  const side = b.a === f.id ? "a" : "b";
  const won = b.res.winner === side;
  const pro = PROMOTIONS[b.promo].tier !== "amateur";
  if (pro && won) grant(w, f, "first-win");
  if (pro && won && b.res.method !== "DEC") grant(w, f, "first-finish");
  if (pro && won && (b.res.method === "KO" || b.res.method === "TKO")) grant(w, f, "first-ko");
  if (pro && won && b.res.method === "SUB") grant(w, f, "first-sub");
  if (pro && f.streak >= 5) grant(w, f, "five-streak");
  if (pro && f.streak >= 10) grant(w, f, "ten-streak");
  if (b.promo === "ufc") grant(w, f, "ufc-debut");
  if (b.promo === "ufc" && won) grant(w, f, "ufc-win");
  const ps = w.promos[b.promo];
  if (won && PROMOTIONS[b.promo].tier === "regional" && ps.champs[b.div] === f.id) grant(w, f, "regional-champ");
  if (b.promo === "ufc" && ps.champs[b.div] === f.id && (b.kind === "title" || b.kind === "vacant")) {
    grant(w, f, "ufc-champ");
    const held = Object.values(w.promos.ufc.champs).filter((x) => x === f.id).length;
    const reigns = w.promos.ufc.reigns.filter((r) => r.fighter === f.id && !r.interim);
    const divs = new Set(reigns.map((r) => r.div));
    if (held >= 2 || divs.size >= 2) grant(w, f, "two-division");
    const cur = reigns.find((r) => r.lost === undefined && r.div === b.div);
    if (cur && cur.defenses >= 3) grant(w, f, "defence-3");
  }
  if ((b.res.bonus ?? []).some((x) => x === "fotn" || x === `potn-${side}`)) grant(w, f, "bonus");
  const myRank = side === "a" ? b.rankA : b.rankB;
  const theirRank = side === "a" ? b.rankB : b.rankA;
  if (won && b.promo === "ufc" && (myRank === null || myRank === undefined) && theirRank !== null && theirRank !== undefined) grant(w, f, "upset");
  void DIVISIONS;
}

export function rankAchievements(w: World): void {
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (!f || f.promo !== "ufc") continue;
    const list = w.promos.ufc.ranks[f.div] ?? [];
    const i = list.indexOf(f.id);
    if (i >= 0) grant(w, f, "ranked");
    if (i >= 0 && i < 5) grant(w, f, "top5");
  }
}
