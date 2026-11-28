// Career milestones for the player's fighters.

import { isFinish } from "../engine/sim";
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

/** Record a milestone; with `quiet`, no message (the caller reports it, or it was earned before the career began). True if new. */
function grant(w: World, f: Fighter, id: string, quiet = false): boolean {
  if (w.career.achievements.some((a) => a.id === id && a.fighter === f.id)) return false;
  w.career.achievements.push({ id, day: w.day, fighter: f.id });
  const a = ACHIEVEMENTS[id];
  if (!quiet) notify(w, { kind: "info", fighter: f.id, from: "Milestone", subject: `${a.name}`, body: `${fullName(f)}: ${a.desc}`, read: false });
  return true;
}

/**
 * The milestones a fight earned. They are recorded here and reported in the
 * result message (career/afterfight.ts), not as a message each: a first UFC win
 * by knockout would otherwise bury the result under five of them.
 */
export function checkAchievements(w: World, f: Fighter, b: Bout): string[] {
  if (!b.res) return [];
  const got: string[] = [];
  const give = (id: string) => {
    if (grant(w, f, id, true)) got.push(id);
  };
  const side = b.a === f.id ? "a" : "b";
  const won = b.res.winner === side;
  const pro = PROMOTIONS[b.promo].tier !== "amateur";
  if (pro && won) give("first-win");
  if (pro && won && isFinish(b.res.method)) give("first-finish");
  if (pro && won && (b.res.method === "KO" || b.res.method === "TKO")) give("first-ko");
  if (pro && won && b.res.method === "SUB") give("first-sub");
  if (pro && f.streak >= 5) give("five-streak");
  if (pro && f.streak >= 10) give("ten-streak");
  if (b.promo === "ufc") give("ufc-debut");
  if (b.promo === "ufc" && won) give("ufc-win");
  const ps = w.promos[b.promo];
  if (won && PROMOTIONS[b.promo].tier === "regional" && ps.champs[b.div] === f.id) give("regional-champ");
  if (b.promo === "ufc" && ps.champs[b.div] === f.id && (b.kind === "title" || b.kind === "vacant")) {
    // A champion is ranked, and in the top five, without having to say so.
    grant(w, f, "ranked", true);
    grant(w, f, "top5", true);
    give("ufc-champ");
    const held = Object.values(w.promos.ufc.champs).filter((x) => x === f.id).length;
    const reigns = w.promos.ufc.reigns.filter((r) => r.fighter === f.id && !r.interim);
    const divs = new Set(reigns.map((r) => r.div));
    if (held >= 2 || divs.size >= 2) give("two-division");
    const cur = reigns.find((r) => r.lost === undefined && r.div === b.div);
    if (cur && cur.defenses >= 3) give("defence-3");
  }
  if ((b.res.bonus ?? []).some((x) => x === "fotn" || x === `potn-${side}`)) give("bonus");
  const myRank = side === "a" ? b.rankA : b.rankB;
  const theirRank = side === "a" ? b.rankB : b.rankA;
  if (won && b.promo === "ufc" && (myRank === null || myRank === undefined) && theirRank !== null && theirRank !== undefined) give("upset");
  void DIVISIONS;
  return got;
}

/** A milestone earned outside the fight itself (a bonus is handed out when the card is over), told by the caller. True if new. */
export function grantQuiet(w: World, f: Fighter, id: string): boolean {
  return grant(w, f, id, true);
}

/** A milestone's name and what it asked, for the result message: "Dynasty (defend a UFC title three times)". */
export function achievementText(id: string): string {
  const a = ACHIEVEMENTS[id];
  return a ? `${a.name} (${a.desc.charAt(0).toLowerCase()}${a.desc.slice(1).replace(/\.$/, "")})` : id;
}

/**
 * A real fighter taken over at the start: what the record already holds counts
 * as done, without a message (a UFC champion isn't told "First blood" after the
 * first fight of the career).
 */
export function creditRealRecord(w: World, f: Fighter): void {
  if (!f.real) return;
  const r = f.rec;
  if (r.w >= 1) grant(w, f, "first-win", true);
  if (r.koW + r.subW >= 1) grant(w, f, "first-finish", true);
  if (r.koW >= 1) grant(w, f, "first-ko", true);
  if (r.subW >= 1) grant(w, f, "first-sub", true);
  if (Math.max(f.bestStreak ?? 0, f.streak) >= 5) grant(w, f, "five-streak", true);
  if (Math.max(f.bestStreak ?? 0, f.streak) >= 10) grant(w, f, "ten-streak", true);
  const ufc = w.promos.ufc;
  const reigns = ufc ? ufc.reigns.filter((x) => x.fighter === f.id && !x.interim) : [];
  const inUfc = f.promo === "ufc" || (f.prior?.promo === "ufc" && f.prior.n > 0);
  if (inUfc && (f.prior?.n ?? 0) > 0) grant(w, f, "ufc-debut", true);
  const rank = f.promo === "ufc" ? (ufc.champs[f.div] === f.id ? 0 : (ufc.ranks[f.div] ?? []).indexOf(f.id)) : -1;
  // A champion or a ranked UFC fighter has won in the UFC.
  if (inUfc && (rank >= 0 || reigns.length)) grant(w, f, "ufc-win", true);
  if (rank >= 0) grant(w, f, "ranked", true);
  if (rank >= 0 && rank < 5) grant(w, f, "top5", true);
  if (reigns.length) grant(w, f, "ufc-champ", true);
  if (new Set(reigns.map((x) => x.div)).size >= 2) grant(w, f, "two-division", true);
  if (reigns.some((x) => x.lost === undefined && x.defenses >= 3)) grant(w, f, "defence-3", true);
}

export function rankAchievements(w: World): void {
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (!f || f.promo !== "ufc") continue;
    const list = w.promos.ufc.ranks[f.div] ?? [];
    const i = list.indexOf(f.id);
    // A champion who lost the belt is ranked already; the milestone was earned on the way up.
    const champ = w.promos.ufc.reigns.some((r) => r.fighter === f.id && !r.interim);
    if (i >= 0) grant(w, f, "ranked", champ);
    if (i >= 0 && i < 5) grant(w, f, "top5", champ);
  }
}
