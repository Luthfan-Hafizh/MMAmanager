// The Contender Series. Most fighters reach the UFC from the regional scene the
// way they do in real life, through Dana White's tryouts: an invitation in early
// summer, one fight on a Tuesday night in Las Vegas between August and October,
// and a UFC contract for a winner who impresses (most finishers, many of the
// dominant decisions, a few of the close ones). Losing there costs only the
// chance: the fighter goes back to the regional show and can be asked again.

import type { Rng } from "../core/rng";
import { fmtDate, ymd } from "../core/time";
import type { DivisionId } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Fighter, Message, MMAEvent, World } from "../model/types";
import { availableFrom, fullName, isChampion, touch } from "../world/core";
import { offerFight } from "../world/matchmaking";
import { tryoutProspect } from "../world/market";
import { closeMessages, notify } from "./inbox";
import { acceptFight } from "./offers";

/** The season a Contender Series week belongs to (2017 was the first). */
export function seasonOf(ev: MMAEvent): number {
  return ymd(ev.day).y - 2016;
}

/** This season's weeks whose cards aren't made yet, soonest first. */
export function openWeeks(w: World): MMAEvent[] {
  const lead = PROMOTIONS.dwcs.lead;
  const out: MMAEvent[] = [];
  for (const id of w.upcoming) {
    const e = w.events[id];
    if (!e || e.promo !== "dwcs" || e.status !== "planned" || e.day - lead < w.day + 7) continue;
    if (out.length && seasonOf(e) !== seasonOf(out[0])) break;
    out.push(e);
  }
  return out;
}

/**
 * Why the scouts would invite a fighter to this week's season, or null: a
 * regional or local fighter, never in the UFC, 33 or younger, five wins or more
 * at the level the UFC looks for, and the record (a belt, a run, or a clean one).
 */
export function tryoutReady(w: World, f: Fighter, week: MMAEvent): string | null {
  if (!f.promo || f.status !== "active") return null;
  const tier = PROMOTIONS[f.promo].tier;
  if (tier !== "regional" && tier !== "local") return null;
  if (f.tags?.includes("ufc-alum")) return null;
  if ((week.day - f.birth) / 365.25 > 33) return null;
  const { w: won, l: lost } = f.rec;
  if (won < 5 || ovrOf(f.attrs) < 62) return null;
  if (availableFrom(f) > week.day - 28) return null;
  if (isChampion(w, f)) return `the ${PROMOTIONS[f.promo].short} title`;
  if (f.streak >= 3) return `${f.streak} wins in a row`;
  if (f.streak >= 1 && lost <= Math.max(2, won / 2)) return `a ${won}-${lost} record`;
  return null;
}

function refOf(season: number, f: Fighter): string {
  return `tryout:${season}:${f.id}`;
}

/**
 * Monthly, from early summer: the invitations. A fighter who qualifies hears
 * from the Contender Series once a season (a champion or a real talent almost
 * surely); an invitation left two weeks without an answer is taken as a no.
 */
export function tryoutInvites(w: World, rng: Rng): void {
  const weeks = openWeeks(w);
  if (weeks.length < 2 || weeks[0].day - w.day > 110) return;
  const season = seasonOf(weeks[0]);
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    const fc = w.career.fc[id];
    if (!f || !fc || f.status !== "active") continue;
    const t = fc.tryout;
    if (t && t.season === season) {
      if (t.yes === undefined && w.day > t.day + 14) {
        t.yes = false;
        closeMessages(w, refOf(season, f), "No answer");
      }
      continue;
    }
    const why = tryoutReady(w, f, weeks[0]);
    if (!why) continue;
    const o = ovrOf(f.attrs);
    if (!rng.chance(isChampion(w, f) || o >= 68 ? 0.9 : o >= 65 ? 0.7 : 0.5)) continue;
    invite(w, f, season, weeks, why);
  }
}

function invite(w: World, f: Fighter, season: number, weeks: MMAEvent[], why: string): void {
  const fc = w.career.fc[f.id];
  if (!fc || !f.promo) return;
  fc.tryout = { season, day: w.day };
  const who = w.career.mode === "manager" ? fullName(f) : "you";
  const short = PROMOTIONS[f.promo].short;
  const first = weeks[0].day;
  const last = weeks[weeks.length - 1].day;
  notify(w, {
    kind: "contract",
    fighter: f.id,
    ref: refOf(season, f),
    from: "Dana White's Contender Series",
    subject: `Invitation: the Contender Series, Season ${season}`,
    body: `The UFC's scouts have been watching ${who} at ${short} (${why}), and Dana White wants ${who} on the Contender Series this summer: one fight, three rounds, on a Tuesday night in Las Vegas. Win and impress and a UFC contract is likely; lose, and it's back to ${short} with the door open next year. The ${short} deal lets ${w.career.mode === "manager" ? "the fighter" : "you"} go. Say yes and the week is set; the opponent comes when the card is made.`,
    needs: true,
    actions: [
      { id: "tryout:yes", label: "Accept the invitation", primary: true },
      { id: "tryout:no", label: "Not this year", danger: true },
    ],
    facts: [
      { k: "When", v: `One Tuesday between ${fmtDate(first, { year: false })} and ${fmtDate(last, { year: false })}` },
      { k: "Where", v: "Meta APEX, Las Vegas" },
      { k: "At stake", v: "A UFC contract for a winner who impresses", tone: "good" },
      { k: "Who gets one", v: "Nine finishers in ten, most dominant decisions, a third of the close ones" },
      { k: "Purse", v: "$5,000 + $5,000 to win" },
      { k: "Answer by", v: fmtDate(w.day + 14) },
    ],
  });
}

/** The first week of the season a fighter can make: the card not yet made, fit three weeks out. */
function weekFor(w: World, f: Fighter, after = -1): MMAEvent | null {
  for (const e of openWeeks(w)) {
    if (e.day <= after) continue;
    if (availableFrom(f) > e.day - 21) continue;
    if (f.booked) {
      const b = w.bouts[f.booked];
      if (b && Math.abs(b.day - e.day) < 42) continue;
    }
    return e;
  }
  return null;
}

/** The answer to the invitation. */
export function answerTryout(w: World, m: Message, action: string): string {
  const f = m.fighter ? w.fighters[m.fighter] : null;
  const fc = f ? w.career.fc[f.id] : null;
  const t = fc?.tryout;
  if (!f || !t) return "";
  if (action === "tryout:yes") {
    const week = weekFor(w, f);
    if (!week) {
      t.yes = false;
      return "The season's cards are already made. The scouts will look again next summer.";
    }
    t.yes = true;
    t.ev = week.id;
    touch(w);
    return `Accepted: ${week.name}, ${fmtDate(week.day)}. The opponent comes when the card is made.`;
  }
  t.yes = false;
  touch(w);
  return "Not this year. The scouts will look again next summer.";
}

/** An accepted invitation holds the weeks around the tryout: no other fight is offered then. */
export function tryoutHold(w: World, f: Fighter, day: number): boolean {
  const t = w.career.fc[f.id]?.tryout;
  if (!t?.yes || t.done || !t.ev) return false;
  const d = w.events[t.ev]?.day;
  return d !== undefined && day > d - 42 && day < d + 28;
}

/**
 * A Contender Series week's card: a player's fighter who accepted the invitation
 * for it is booked first, against the best prospect at the weight (or one from
 * elsewhere); hurt or busy, the week moves later in the season. A fighter who
 * qualified after the invitations went out may be offered a spot that opened up.
 */
export function bookTryouts(w: World, rng: Rng, ev: MMAEvent, byDiv: Map<DivisionId, Fighter[]>): void {
  const season = seasonOf(ev);
  const mates = (a: Fighter, b: Fighter) => !!a.gym && a.gym === b.gym;
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    const fc = w.career.fc[id];
    if (!f || !fc || f.status !== "active") continue;
    const t = fc.tryout;
    if (t?.yes && !t.done && t.ev === ev.id) {
      const fit = !f.booked && availableFrom(f) <= ev.day - 21 && (f.lastFight === null || ev.day - f.lastFight >= 35);
      if (!fit) {
        const later = weekFor(w, f, ev.day);
        if (later) {
          t.ev = later.id;
          notify(w, { kind: "info", fighter: f.id, from: "Dana White's Contender Series", subject: `Contender Series: moved to ${later.name.split(", ").pop()}`, body: `${fullName(f)} can't make ${ev.name}, so the tryout moves to ${later.name} on ${fmtDate(later.day)}.` });
        } else {
          t.yes = false;
          notify(w, { kind: "info", fighter: f.id, from: "Dana White's Contender Series", subject: "No Contender Series this year", body: `${fullName(f)} can't make any of this season's weeks. The scouts will look again next summer.` });
        }
        continue;
      }
      const list = byDiv.get(f.div) ?? [];
      const j = list.findIndex((x) => !x.booked && !mates(f, x));
      const opp = j >= 0 ? list.splice(j, 1)[0] : tryoutProspect(w, rng, f.div);
      const offer = offerFight(w, rng, ev, f, opp, "tryout");
      if (offer) {
        acceptFight(w, offer.id);
        t.done = true;
      }
      continue;
    }
    // A spot that opened up, for a fighter who qualified after the invitations went out.
    if (t && t.season === season) continue;
    if (f.booked || w.career.fightOffers.some((o) => o.fighter === f.id && o.status === "open")) continue;
    if (f.lastFight !== null && ev.day - f.lastFight < 49) continue;
    if (!tryoutReady(w, f, ev) || !rng.chance(0.2)) continue;
    const opp = (byDiv.get(f.div) ?? []).find((x) => !x.booked && !mates(f, x));
    if (!opp) continue;
    fc.tryout = { season, day: w.day, ev: ev.id };
    offerFight(w, rng, ev, f, opp, "tryout");
  }
}
