// Drug testing, the way the UFC and the PFL run it (USADA until 2023, Drug Free
// Sport since): random tests out of competition, and a positive means a suspension
// of six months to two years, a recent win overturned to a no contest, a fine, and a
// champion stripped. About a dozen UFC fighters a year, as in the real numbers. The
// player is tested too, and only risks a positive by choosing to (a supplement nobody
// checked: career/life.ts).

import { withdraw } from "./matchmaking";
import type { Rng } from "../core/rng";
import { fmtDate } from "../core/time";
import { PROMOTIONS, PROMO_IDS } from "../data/promotions";
import { DIVISIONS } from "../data/divisions";
import type { Bout, Fighter, World } from "../model/types";
import { addNews, fullName, isChampion, rosterOf, touch } from "./core";
import { vacate } from "./titles";
import { notify } from "../career/inbox";
import { ledger } from "../career/money";

/** The month's chance a fighter in a testing promotion turns up positive. */
function risk(f: Fighter): number {
  const p = f.pers;
  // Low professionalism, the chase for money, coming back from an injury.
  return 0.0009 * (1.7 - p.professionalism / 20) * (0.8 + p.greed / 50) * (f.injury ? 1.4 : 1);
}

/** A win in the last 45 days becomes a no contest: the records, both ways. */
function overturn(w: World, b: Bout, f: Fighter): boolean {
  const r = b.res;
  if (!r || !r.winner || r.method === "NC") return false;
  const winSide = r.winner;
  const winner = w.fighters[winSide === "a" ? b.a : b.b];
  if (winner.id !== f.id) return false;
  const loser = w.fighters[winSide === "a" ? b.b : b.a];
  const am = PROMOTIONS[b.promo].tier === "amateur";
  const rw = am ? winner.am : winner.rec;
  const rl = am ? loser.am : loser.rec;
  rw.w = Math.max(0, rw.w - 1);
  rl.l = Math.max(0, rl.l - 1);
  if (r.method === "KO" || r.method === "TKO") {
    rw.koW = Math.max(0, rw.koW - 1);
    rl.koL = Math.max(0, rl.koL - 1);
  } else if (r.method === "SUB") {
    rw.subW = Math.max(0, rw.subW - 1);
    rl.subL = Math.max(0, rl.subL - 1);
  } else if (r.method === "DEC") {
    rw.decW = Math.max(0, rw.decW - 1);
    rl.decL = Math.max(0, rl.decL - 1);
  }
  rw.nc++;
  rl.nc++;
  r.winner = null;
  r.method = "NC";
  r.detail = "Overturned: failed drug test";
  return true;
}

/** A positive test: the suspension, the overturned win, the fine, the belt. */
export function positiveTest(w: World, rng: Rng, f: Fighter, why: string): void {
  const months = f.ctrl ? rng.int(6, 12) : rng.int(6, 24);
  f.susp = Math.max(f.susp, w.day + months * 30);
  f.suspWhy = "a failed drug test";
  let overturned: Bout | null = null;
  for (let k = f.bouts.length - 1; k >= 0; k--) {
    const b = w.bouts[f.bouts[k]];
    if (!b || b.status !== "done") continue;
    if (w.day - b.day > 45) break;
    if (overturn(w, b, f)) overturned = b;
    break;
  }
  // A fight already booked goes ahead without them: the promotion finds a replacement.
  const booked = f.booked ? w.bouts[f.booked] : null;
  if (booked && booked.status === "booked") withdraw(w, rng, booked, f.id, "failed drug test", { quiet: !f.ctrl });
  const champ = isChampion(w, f);
  const promo = f.promo;
  if (champ) vacate(w, f, "vacated");
  const opp = overturned ? w.fighters[overturned.a === f.id ? overturned.b : overturned.a] : null;
  const text = `${fullName(f)} tests positive${why ? ` (${why})` : ""} and is suspended for ${months} months${overturned && opp ? `; the win over ${fullName(opp)} becomes a no contest` : ""}${champ ? `, and the ${promo ? PROMOTIONS[promo].short : ""} ${DIVISIONS[f.div].name.toLowerCase()} title is vacated` : ""}.`;
  if (promo === "ufc" || promo === "pfl" || f.ctrl) addNews(w, { kind: "other", promo: promo ?? undefined, fighters: [f.id], big: champ, text });
  if (f.ctrl) {
    const fine = Math.round((f.contract?.show ?? 5000) * 0.3);
    ledger(w, { amount: -fine, what: "Anti-doping fine", cat: "fine", fighter: f.id });
    notify(w, {
      kind: "info",
      fighter: f.id,
      from: "Anti-doping agency",
      subject: "Failed drug test",
      body: `${text} The suspension runs to ${fmtDate(f.susp)}: no fights before then. The fine is ${fine.toLocaleString("en-US")}.`,
      facts: [
        { k: "Suspended until", v: fmtDate(f.susp), tone: "bad" },
        { k: "Fine", v: `$${fine.toLocaleString("en-US")}`, tone: "bad" },
        ...(overturned && opp ? [{ k: "Overturned", v: `The win over ${opp.surname}`, tone: "bad" as const }] : []),
      ],
    });
  }
  touch(w);
}

/** Monthly random tests across the UFC and PFL rosters. */
export function testingMonthly(w: World, rng: Rng): void {
  for (const promo of PROMO_IDS) {
    if (promo !== "ufc" && promo !== "pfl") continue;
    for (const d of PROMOTIONS[promo].divisions) {
      for (const f of rosterOf(w, promo, d)) {
        if (f.status !== "active" || f.susp > w.day) continue;
        if (f.ctrl) {
          // The player only risks it by taking something nobody checked.
          const fc = w.career.fc[f.id];
          if (fc?.tainted && fc.tainted > w.day && rng.chance(0.35)) {
            fc.tainted = undefined;
            positiveTest(w, rng, f, "a supplement nobody had checked");
          }
          continue;
        }
        if (rng.chance(risk(f))) positiveTest(w, rng, f, "");
      }
    }
  }
}
