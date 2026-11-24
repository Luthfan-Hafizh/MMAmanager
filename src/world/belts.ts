// Belts beyond the plain title fight: what is at stake in a bout and what it did
// to each side's belts, the UFC's BMF title, and what happens to a champion who
// is out too long.
//
// The BMF title is ceremonial and has no rankings behind it: Jorge Masvidal won
// it at UFC 244 (2019, welterweight); it came back at lightweight with Justin
// Gaethje at UFC 291 (2023), then Max Holloway (UFC 300, 2024; defended at UFC
// 318) and Charles Oliveira (UFC 326, March 2026). It goes to exciting, popular
// names, about once a year, over five rounds near the top of a numbered card.
//
// A champion out too long: the promotion makes an interim title (after about
// four months out), the interim champion defends it while the champion is
// away, and when the interim champion has waited about nine months with the
// champion still not close to fit, the champion is stripped and the interim
// champion promoted (as with McGregor and Aldo in 2016). With no interim belt,
// eighteen months out costs the title.

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { ageAt, dayOf, fmtDate } from "../core/time";
import { DIVISIONS, type DivisionId } from "../data/divisions";
import { PROMOTIONS, PROMO_IDS, type PromoId } from "../data/promotions";
import type { Bout, BmfState, Fighter, MMAEvent, World } from "../model/types";
import { addNews, fullName, rankOf, rosterOf } from "./core";
import { notify } from "../career/inbox";

export const isTitleKind = (k: Bout["kind"]) => k === "title" || k === "interim" || k === "vacant";
export const isBeltFight = (b: Pick<Bout, "kind">) => isTitleKind(b.kind) || b.kind === "bmf";

/** What is at stake in a bout, in a few words (null for an ordinary fight). */
export function stakeLabel(b: Pick<Bout, "kind" | "stake" | "div">, long = false): string | null {
  const div = long ? `${DIVISIONS[b.div].name} ` : "";
  if (b.kind === "bmf") return b.stake === "bmf-defence" ? "BMF title defence" : "BMF title";
  if (b.kind === "title") return b.stake === "unify" ? (long ? `${div}title unification` : "Unification") : long ? `${div}title fight` : "Title fight";
  if (b.kind === "interim") return b.stake === "interim-defence" ? "Interim title defence" : long ? `Interim ${div.toLowerCase()}title` : "Interim title";
  if (b.kind === "vacant") return long ? `Vacant ${div.toLowerCase()}title` : "Vacant title";
  if (b.kind === "eliminator") return "Title eliminator";
  return null;
}

/** What the fight did to this fighter's belts. */
export function beltNote(b: Bout, id: string): string | null {
  const n = b.res?.belt;
  if (!n) return null;
  return (b.a === id ? n.a : n.b) ?? null;
}

/** Set the stake when a bout is made. */
export function stakeOf(w: World, b: Bout): Bout["stake"] {
  const ps = w.promos[b.promo];
  if (b.kind === "title" && ps.interim[b.div] && (ps.interim[b.div] === b.a || ps.interim[b.div] === b.b)) return "unify";
  if (b.kind === "interim" && ps.interim[b.div] && (ps.interim[b.div] === b.a || ps.interim[b.div] === b.b)) return "interim-defence";
  if (b.kind === "bmf" && ps.bmf?.holder && (ps.bmf.holder === b.a || ps.bmf.holder === b.b)) return "bmf-defence";
  return undefined;
}

// ---------- the BMF title ----------

/** The BMF lineage as it stood in October 2026. */
export function initBmf(w: World): void {
  const ps = w.promos.ufc;
  if (!ps || ps.bmf) return;
  const has = (id: string) => (w.fighters[id] ? id : undefined);
  const bmf: BmfState = {
    holder: null,
    reigns: [
      { name: "Jorge Masvidal", won: dayOf(2019, 10, 2), lost: dayOf(2023, 3, 8), defenses: 0, ended: "retired", at: "UFC 244 (welterweight)" },
      { fighter: has("ufc-justin-gaethje"), name: "Justin Gaethje", won: dayOf(2023, 6, 29), lost: dayOf(2024, 3, 13), defenses: 0, ended: "lost", at: "UFC 291" },
      { fighter: has("ufc-max-holloway"), name: "Max Holloway", won: dayOf(2024, 3, 13), lost: dayOf(2026, 2, 7), defenses: 1, ended: "lost", at: "UFC 300" },
      { fighter: has("ufc-charles-oliveira"), name: "Charles Oliveira", won: dayOf(2026, 2, 7), defenses: 0, at: "UFC 326" },
    ],
    last: dayOf(2026, 2, 7),
  };
  const holder = w.fighters["ufc-charles-oliveira"];
  if (holder && holder.status === "active" && holder.promo === "ufc") bmf.holder = holder.id;
  else bmf.reigns[bmf.reigns.length - 1].lost = w.day;
  ps.bmf = bmf;
}

function finishRate(f: Fighter): number {
  return f.rec.w ? (f.rec.koW + f.rec.subW) / f.rec.w : 0;
}

/** Who the UFC would put in a BMF fight: popular, exciting, established names. */
export function bmfScore(w: World, f: Fighter): number {
  const r = rankOf(w, f);
  return f.pop + finishRate(f) * 25 + f.attrs.aggression * 1.2 + (r !== null && r > 0 && r <= 15 ? 8 : 0) - (ageAt(f.birth, w.day) < 26 ? 15 : 0);
}

/** Book a BMF fight on a numbered UFC card when one is due. Returns the bout's fighters, or null. */
export function bmfPairing(w: World, rng: Rng, ev: MMAEvent, ready: (f: Fighter) => boolean): [Fighter, Fighter] | null {
  if (ev.promo !== "ufc" || ev.kind !== "numbered") return null;
  const ps = w.promos.ufc;
  const bmf = ps.bmf;
  if (!bmf) return null;
  if (bmf.last !== undefined && ev.day - bmf.last < 240) return null;
  if (Object.values(w.bouts).some((b) => b.kind === "bmf" && b.status === "booked")) return null;
  if (!rng.chance(0.55)) return null;
  const pool = rosterOf(w, "ufc", "LW").filter((f) => ready(f) && f.id !== ps.champs.LW && f.id !== ps.interim.LW);
  const cands = pool.filter((f) => f.id !== bmf.holder && f.pop >= 40).sort((a, b) => bmfScore(w, b) - bmfScore(w, a));
  const holder = bmf.holder ? w.fighters[bmf.holder] : null;
  if (holder) {
    if (!pool.includes(holder)) return null;
    const opp = cands.slice(0, 3).filter((f) => f.gym !== holder.gym);
    return opp.length ? [holder, rng.pick(opp)] : null;
  }
  const two = cands.filter((f, i) => i === 0 || f.gym !== cands[0].gym).slice(0, 2);
  return two.length === 2 ? [two[0], two[1]] : null;
}

/** After a BMF fight: the belt, the notes, the hype. */
export function handleBmf(w: World, b: Bout, winner: Fighter | null, loser: Fighter | null): void {
  const bmf = w.promos.ufc?.bmf;
  if (!bmf || b.kind !== "bmf") return;
  bmf.last = b.day;
  const note = (f: Fighter, text: string) => {
    b.res!.belt = { ...(b.res!.belt ?? {}), [b.a === f.id ? "a" : "b"]: text };
  };
  const ev = w.events[b.ev];
  if (!winner || !loser) {
    const holder = bmf.holder ? w.fighters[bmf.holder] : null;
    if (holder) note(holder, "Kept the BMF title (draw)");
    return;
  }
  const cur = bmf.reigns[bmf.reigns.length - 1];
  if (bmf.holder === winner.id) {
    if (cur) cur.defenses++;
    note(winner, "Defended the BMF title");
    winner.legacy = Math.round(((winner.legacy ?? 0) + 1.5) * 10) / 10;
    addNews(w, { kind: "title", promo: "ufc", ev: b.ev, fighters: [winner.id, loser.id], big: true, text: `${fullName(winner)} is still the BMF: ${fullName(loser)} beaten${ev ? ` at ${ev.name}` : ""}.` });
  } else {
    if (bmf.holder && cur && cur.lost === undefined) {
      cur.lost = b.day;
      cur.ended = "lost";
      note(loser, "Lost the BMF title");
    }
    bmf.holder = winner.id;
    bmf.reigns.push({ fighter: winner.id, name: fullName(winner), won: b.day, defenses: 0, at: ev?.name });
    note(winner, "Won the BMF title");
    winner.legacy = Math.round(((winner.legacy ?? 0) + 3) * 10) / 10;
    addNews(w, { kind: "title", promo: "ufc", ev: b.ev, fighters: [winner.id, loser.id], big: true, text: `NEW BMF: ${fullName(winner)} takes the BMF title from ${fullName(loser)}${ev ? ` at ${ev.name}` : ""}.` });
  }
  winner.pop = clamp(winner.pop + 6, 0, 100);
}

/** Monthly: a BMF holder who retires, leaves or moves on gives it up; so does one out for eighteen months. */
export function bmfMonthly(w: World): void {
  const bmf = w.promos.ufc?.bmf;
  if (!bmf || !bmf.holder) return;
  const f = w.fighters[bmf.holder];
  const cur = bmf.reigns[bmf.reigns.length - 1];
  const idle = f && f.lastFight !== null ? w.day - f.lastFight : 0;
  const why = !f || f.status !== "active" ? "retired" : f.promo !== "ufc" ? "moved" : idle > 540 ? "vacated" : null;
  if (!why) return;
  if (cur && cur.lost === undefined) {
    cur.lost = w.day;
    cur.ended = why;
  }
  bmf.holder = null;
  if (f) addNews(w, { kind: "title", promo: "ufc", fighters: [f.id], text: `The BMF title is vacant: ${fullName(f)} ${why === "retired" ? "has retired" : why === "moved" ? "has left the UFC" : "has been out too long"}.` });
}

// ---------- champions out too long ----------

/** Take a title from a champion: the interim champion is promoted, or the belt is vacant. */
export function strip(w: World, promo: PromoId, d: DivisionId, why: string): void {
  const ps = w.promos[promo];
  const id = ps.champs[d];
  if (!id) return;
  const f = w.fighters[id];
  const r = [...ps.reigns].reverse().find((x) => x.fighter === id && x.div === d && x.lost === undefined && !x.interim);
  if (r) {
    r.lost = w.day;
    r.ended = "stripped";
  }
  ps.champs[d] = null;
  const p = PROMOTIONS[promo];
  const big = p.tier === "major" || p.tier === "league";
  const ic = ps.interim[d] ? w.fighters[ps.interim[d]!] : null;
  if (ic) {
    ps.champs[d] = ic.id;
    ps.interim[d] = null;
    const ir = [...ps.reigns].reverse().find((x) => x.fighter === ic.id && x.interim && x.lost === undefined);
    if (ir) {
      ir.lost = w.day;
      ir.ended = "unified";
    }
    ps.reigns.push({ fighter: ic.id, promo, div: d, won: w.day, defenses: 0, how: "promoted" });
    if (big) ic.reigns++;
  }
  addNews(w, {
    kind: "title",
    promo,
    fighters: [id, ...(ic ? [ic.id] : [])],
    big,
    text: `${fullName(f)} is stripped of the ${p.short} ${DIVISIONS[d].name.toLowerCase()} title (${why}).${ic ? ` ${fullName(ic)} is promoted to undisputed champion.` : " The belt is vacant."}`,
  });
  if (f.ctrl) {
    const fc = w.career.fc[f.id];
    if (fc) {
      fc.hold = undefined;
      // A stripped champion gets a shot when fit, as Dominick Cruz did.
      fc.promise = { promo, div: d, until: w.day + 540 };
    }
    notify(w, {
      kind: "info",
      fighter: f.id,
      from: `${p.short} matchmaker`,
      subject: "Stripped of the title",
      body: `The promotion couldn't wait any longer: ${fullName(f)} has been stripped of the ${DIVISIONS[d].name.toLowerCase()} title (${why}).${ic ? ` ${fullName(ic)}, the interim champion, is the undisputed champion now.` : " The belt is vacant."} You're first in line for a title shot when you're fit.`,
      facts: [
        { k: "Title", v: `${p.short} ${DIVISIONS[d].name}`, tone: "bad" },
        { k: "Champion now", v: ic ? fullName(ic) : "Vacant" },
        { k: "Your shot", v: "First in line when fit, for 18 months", tone: "good" },
      ],
    });
  }
}

/** When a champion who is out stops being able to keep the belt: fifteen months from the last fight with an interim champion waiting, eighteen without. */
export function stripDeadline(w: World, promo: PromoId, d: DivisionId): number | null {
  const ps = w.promos[promo];
  const c = ps.champs[d] ? w.fighters[ps.champs[d]!] : null;
  if (!c || c.lastFight === null) return null;
  return c.lastFight + (ps.interim[d] ? 450 : 540);
}

/** A belt fight of this kind already booked in this division (on an upcoming card). */
export function beltBooked(w: World, promo: PromoId, d: DivisionId, kind: Bout["kind"]): boolean {
  for (const id of w.upcoming) {
    const ev = w.events[id];
    if (!ev || ev.promo !== promo) continue;
    for (const bid of ev.bouts) {
      const b = w.bouts[bid];
      if (b && b.status === "booked" && b.div === d && b.kind === kind) return true;
    }
  }
  return false;
}

/** Monthly: champions out too long are stripped; the player is warned first. */
export function stripMonthly(w: World): void {
  for (const promo of PROMO_IDS) {
    const p = PROMOTIONS[promo];
    if (!p.rankSize) continue;
    const ps = w.promos[promo];
    for (const d of p.divisions) {
      const id = ps.champs[d];
      if (!id) continue;
      const f = w.fighters[id];
      if (!f || f.status !== "active" || f.promo !== promo) continue;
      const fitIn = f.injury && f.injury.until > w.day ? f.injury.until - w.day : 0;
      const deadline = stripDeadline(w, promo, d);
      if (deadline === null) continue;
      const interim = !!ps.interim[d];
      // Out, and not coming back in time.
      const out = interim ? fitIn > 60 : fitIn > 0 || (f.lastFight !== null && w.day - f.lastFight > 540);
      if (!out) continue;
      if (w.day >= deadline) {
        strip(w, promo, d, interim ? "the interim champion has waited long enough" : "eighteen months out");
        continue;
      }
      if (f.ctrl && deadline - w.day <= 90) {
        const fc = w.career.fc[f.id];
        if (fc && (fc.stripWarned === undefined || w.day - fc.stripWarned > 120)) {
          fc.stripWarned = w.day;
          notify(w, {
            kind: "info",
            fighter: f.id,
            from: `${p.short} matchmaker`,
            subject: "The belt is at risk",
            body: `${fullName(f)} has been out since ${f.lastFight !== null ? fmtDate(f.lastFight) : "the last fight"}.${interim ? ` ${fullName(w.fighters[ps.interim[d]!])} holds the interim title and is ready.` : ""} If you're not fit to defend by ${fmtDate(deadline)}, the title ${interim ? "goes to the interim champion" : "will be vacated"}.`,
            facts: [
              { k: "Deadline", v: fmtDate(deadline), tone: "warn" },
              { k: "Fit", v: fitIn > 0 ? fmtDate(w.day + fitIn) : "Now", tone: fitIn > 0 && w.day + fitIn > deadline ? "bad" : undefined },
              { k: "If you miss it", v: interim ? "The interim champion is promoted" : "The belt is vacated" },
            ],
          });
        }
      }
    }
  }
}
