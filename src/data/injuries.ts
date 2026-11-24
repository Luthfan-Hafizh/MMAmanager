// Injuries as they happen in the sport, with the time they really take. Times
// are to fight-ready (not just healed): an ACL reconstruction keeps a fighter
// out nine to thirteen months (a 2024 study of UFC fighters found 412 days on
// average from surgery to the next fight); a broken hand six to ten weeks; a
// torn labrum four to six months. Each injury says what can still be trained
// while it heals, and whether a fighter could fight through it, and at what cost.

import type { Rng } from "../core/rng";
import type { Injury, SessionId } from "../model/types";

export type InjuryArea = Injury["area"];

export interface InjuryDef {
  id: string;
  name: string;
  area: InjuryArea;
  /** 1 minor, 2 moderate, 3 serious (surgery and months). */
  sev: 1 | 2 | 3;
  /** Weeks to fight-ready, shortest and longest. */
  weeks: [number, number];
  surgery?: boolean;
  /** What the doctors do. */
  treat: string;
  /** What can still be trained. */
  limits: string;
  /** Training that still counts while it heals, 0..1. */
  train: number;
  /** How much it takes out of a fighter who fights through it (0..1); none means the doctors won't clear it. */
  fightable?: number;
  /** Training sessions that cause it, and how often relative to the others. */
  sessions?: SessionId[];
  weight: number;
}

export const INJURY_DEFS: InjuryDef[] = [
  // ---------- from training ----------
  { id: "ribs-bruised", name: "Bruised ribs", area: "body", sev: 1, weeks: [2, 4], treat: "Ice and rest; no hard sparring.", limits: "Drills, pads and cardio; no sparring or body work.", train: 0.65, fightable: 0.08, sessions: ["sparring", "wrestling", "muaythai"], weight: 1.6 },
  { id: "ankle", name: "Sprained ankle", area: "leg", sev: 1, weeks: [2, 4], treat: "Strapping and rehab.", limits: "Upper body, the bag standing still, the bike.", train: 0.6, fightable: 0.1, sessions: ["conditioning", "kickboxing", "wrestling"], weight: 1.4 },
  { id: "hamstring", name: "Pulled hamstring", area: "leg", sev: 1, weeks: [2, 5], treat: "Rest, then a graded return to running.", limits: "Upper body and grappling drills.", train: 0.6, fightable: 0.09, sessions: ["conditioning", "kickboxing"], weight: 1.2 },
  { id: "back-strain", name: "Lower back strain", area: "back", sev: 1, weeks: [1, 4], treat: "Physio and rest from heavy lifting.", limits: "Light technical work.", train: 0.6, fightable: 0.08, sessions: ["strength", "wrestling"], weight: 1.1 },
  { id: "shoulder-strain", name: "Shoulder strain", area: "shoulder", sev: 1, weeks: [2, 5], treat: "Physio.", limits: "Legs, cardio and light pads.", train: 0.6, fightable: 0.09, sessions: ["bjj", "wrestling", "strength"], weight: 1.0 },
  { id: "eye-cut", name: "Cut over the eye", area: "head", sev: 1, weeks: [3, 5], treat: "Stitches; no contact until it closes.", limits: "Everything but contact.", train: 0.75, fightable: 0.05, sessions: ["sparring", "muaythai"], weight: 0.9 },
  { id: "concussion", name: "Concussion in sparring", area: "head", sev: 2, weeks: [3, 6], treat: "The concussion protocol: rest, then a graded return.", limits: "No contact for at least three weeks.", train: 0.3, sessions: ["sparring"], weight: 0.5 },
  { id: "mcl", name: "Knee sprain (MCL)", area: "knee", sev: 2, weeks: [4, 10], treat: "A brace and rehab; no surgery.", limits: "No wrestling, kicking or sparring.", train: 0.45, fightable: 0.16, sessions: ["wrestling", "bjj", "sparring"], weight: 0.6 },
  { id: "hand", name: "Broken hand", area: "hand", sev: 2, weeks: [6, 10], treat: "A cast, or a plate and screws.", limits: "Legs, wrestling and cardio; no punching.", train: 0.5, fightable: 0.2, sessions: ["boxing", "sparring"], weight: 0.45 },
  { id: "rib-crack", name: "Cracked rib", area: "body", sev: 2, weeks: [5, 8], treat: "Time; nothing else mends a rib.", limits: "Light drills and the bike.", train: 0.4, fightable: 0.15, sessions: ["sparring", "wrestling"], weight: 0.35 },
  { id: "elbow", name: "Elbow ligament sprain", area: "arm", sev: 2, weeks: [4, 8], treat: "Rest and rehab.", limits: "Legs and cardio; no grappling.", train: 0.5, fightable: 0.14, sessions: ["bjj", "wrestling"], weight: 0.3 },
  { id: "meniscus", name: "Torn meniscus", area: "knee", sev: 2, weeks: [8, 18], surgery: true, treat: "Knee surgery: a trim is back in two months, a repair takes four.", limits: "Upper body only for a while.", train: 0.35, fightable: 0.22, sessions: ["wrestling", "bjj"], weight: 0.3 },
  { id: "disc", name: "Herniated disc", area: "back", sev: 2, weeks: [6, 16], treat: "Injections and rehab.", limits: "Light technical work.", train: 0.35, fightable: 0.18, sessions: ["strength", "wrestling"], weight: 0.2 },
  { id: "labrum", name: "Torn labrum (shoulder)", area: "shoulder", sev: 3, weeks: [16, 26], surgery: true, treat: "Shoulder surgery, then four to six months of rehab.", limits: "Legs and cardio.", train: 0.3, sessions: ["wrestling", "bjj", "strength"], weight: 0.12 },
  { id: "acl", name: "Torn ACL", area: "knee", sev: 3, weeks: [40, 56], surgery: true, treat: "Reconstruction surgery, then nine to thirteen months before a fight.", limits: "Upper body and rehab for months.", train: 0.2, sessions: ["wrestling", "bjj", "sparring", "kickboxing"], weight: 0.08 },
  { id: "pec", name: "Torn pectoral", area: "body", sev: 3, weeks: [22, 30], surgery: true, treat: "Surgery to reattach it, then five to seven months.", limits: "Legs and cardio.", train: 0.3, sessions: ["strength", "wrestling"], weight: 0.05 },
  { id: "biceps", name: "Torn biceps tendon", area: "arm", sev: 3, weeks: [18, 26], surgery: true, treat: "Surgery, then four to six months.", limits: "Legs and cardio.", train: 0.3, sessions: ["strength", "bjj"], weight: 0.05 },
  { id: "achilles", name: "Ruptured Achilles", area: "leg", sev: 3, weeks: [40, 52], surgery: true, treat: "Surgery, then about a year.", limits: "Upper body and rehab.", train: 0.2, sessions: ["conditioning", "kickboxing"], weight: 0.03 },

  // ---------- from fights (no training sessions) ----------
  { id: "fight-cut", name: "Deep cut", area: "head", sev: 1, weeks: [4, 7], treat: "Stitches; the commission wants it closed before any contact.", limits: "Everything but contact.", train: 0.75, weight: 0 },
  { id: "nose", name: "Broken nose", area: "head", sev: 1, weeks: [4, 8], treat: "Set and left to heal.", limits: "No contact to the face.", train: 0.7, weight: 0 },
  { id: "leg-bruise", name: "Bone bruise on the leg", area: "leg", sev: 1, weeks: [3, 6], treat: "Rest.", limits: "Upper body and the bike.", train: 0.6, weight: 0 },
  { id: "foot", name: "Broken foot", area: "leg", sev: 2, weeks: [8, 12], treat: "A boot for six weeks.", limits: "Upper body.", train: 0.45, weight: 0 },
  { id: "orbital", name: "Orbital fracture", area: "head", sev: 2, weeks: [10, 16], surgery: true, treat: "Often surgery to the eye socket.", limits: "No contact for months.", train: 0.5, weight: 0 },
  { id: "jaw", name: "Broken jaw", area: "head", sev: 3, weeks: [12, 18], surgery: true, treat: "Wired shut for six weeks.", limits: "Light cardio.", train: 0.3, weight: 0 },
  { id: "leg-break", name: "Broken leg", area: "leg", sev: 3, weeks: [52, 78], surgery: true, treat: "A rod in the tibia; a year or more.", limits: "Rehab only.", train: 0.1, weight: 0 },
];

export const INJURY: Record<string, InjuryDef> = Object.fromEntries(INJURY_DEFS.map((d) => [d.id, d]));

/** A training injury for a week of these sessions. */
export function trainingInjury(rng: Rng, sessions: Set<SessionId>): InjuryDef {
  const pool = INJURY_DEFS.filter((d) => d.sessions?.some((s) => sessions.has(s)));
  return rng.weighted(pool.length ? pool : INJURY_DEFS.filter((d) => d.sessions), (d) => d.weight);
}

/** Make the injury a fighter carries, starting today. */
export function makeInjury(rng: Rng, def: InjuryDef, day: number, from: Injury["from"]): Injury {
  const weeks = def.weeks[0] + rng.next() * (def.weeks[1] - def.weeks[0]);
  return {
    name: def.name,
    area: def.area,
    until: day + Math.round(weeks * 7),
    severity: def.sev,
    from,
    id: def.id,
    start: day,
    surgery: def.surgery,
  };
}

/** The definition behind an injury (older saves have none: a plain one stands in). */
export function defOf(inj: Injury): InjuryDef {
  return (inj.id && INJURY[inj.id]) || { id: "old", name: inj.name, area: inj.area, sev: (Math.min(3, Math.max(1, inj.severity)) as 1 | 2 | 3), weeks: [1, 8], treat: "Rest and rehab.", limits: "Light work.", train: 0.35, fightable: inj.severity >= 3 ? undefined : 0.15, weight: 0 };
}

export const SEVERITY_TEXT = ["", "Minor", "Moderate", "Serious"];

/** How much a fighter is down on the night, fighting on this injury (0..1). */
export function hurtOnNight(inj: Injury, day: number): number {
  const d = defOf(inj);
  if (inj.until <= day) return 0;
  const total = Math.max(7, inj.until - (inj.start ?? inj.until - 28));
  const left = inj.until - day;
  return Math.min(1, (d.fightable ?? 0.3) * 3 * Math.min(1, left / total + 0.35));
}

/** An injury from a fight, from what happened in it. */
export function fightInjuryDef(rng: Rng, side: { head: number; body: number; legs: number; cut: number }, lostBySub: string | null): InjuryDef | null {
  if (lostBySub) {
    const s = lostBySub.toLowerCase();
    if (s.includes("armbar")) return rng.chance(0.35) ? INJURY.elbow : null;
    if (s.includes("kimura") || s.includes("americana") || s.includes("omoplata")) return rng.chance(0.3) ? (rng.chance(0.25) ? INJURY.labrum : INJURY["shoulder-strain"]) : null;
    if (s.includes("heel hook") || s.includes("kneebar")) return rng.chance(0.4) ? (rng.chance(0.3) ? INJURY.acl : INJURY.mcl) : null;
    if (s.includes("ankle") || s.includes("toe hold")) return rng.chance(0.3) ? INJURY.ankle : null;
  }
  const worst = Math.min(side.head, side.body, side.legs);
  const p = 0.035 + 0.3 * Math.pow(1 - worst / 100, 2) + (side.cut >= 2 ? 0.15 : 0);
  if (!rng.chance(p)) return null;
  if (side.cut >= 2) return INJURY["fight-cut"];
  if (side.legs < 45) return rng.chance(0.03) ? INJURY["leg-break"] : rng.chance(0.3) ? INJURY.foot : INJURY["leg-bruise"];
  if (side.head < 45) return rng.weighted([INJURY.nose, INJURY.orbital, INJURY.jaw], (x) => (x.id === "nose" ? 3 : x.id === "orbital" ? 1.4 : 0.4));
  return rng.weighted([INJURY.hand, INJURY["rib-crack"], INJURY.mcl, INJURY["shoulder-strain"], INJURY.foot, INJURY.acl, INJURY.labrum], (x) =>
    x.id === "hand" ? 3 : x.id === "rib-crack" ? 1.6 : x.id === "foot" ? 1 : x.id === "mcl" || x.id === "shoulder-strain" ? 0.8 : x.id === "labrum" ? 0.1 : 0.08,
  );
}
