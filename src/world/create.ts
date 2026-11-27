// Creating a world: the real UFC and PFL rosters, every regional, local and
// amateur promotion filled with fighters of its own level, gyms in every
// country, a calendar, and the player's career.

import { Rng, hashString } from "../core/rng";
import { ageAt, dayOf } from "../core/time";
import { clamp } from "../core/util";
import { COUNTRY_LIST, countriesIn, countryOf, REGION_IDS, type RegionId } from "../data/countries";
import { DIVISIONS, type DivisionId, type Sex } from "../data/divisions";
import { makeName } from "../data/names";
import { PROMOTIONS, PROMO_IDS, promoFor, type PromoId } from "../data/promotions";
import { ARTS, type BaseArt } from "../data/styles";
import { ATTRS, ovrOf } from "../model/attributes";
import type { Bout, Career, Contract, Fighter, Gym, PromoState, Stance, World } from "../model/types";
import { defaultTraining } from "../career/training";
import { ensureSchedule } from "./calendar";
import { addNews, fullName, nextId, rankOf, touch, withRng, touchRoster, namesInUse } from "./core";
import { generateFighter, makeRecord, pickCountry } from "./generate";
import { currentStreak, potentialNoise, prospectRoom, realFighter, realGym, type RosterFile, leagueBalance } from "./real";
import { entryElo, p4pOf, refitRankings, updateP4P, updateRankings } from "./rankings";
import { managerPerson } from "../career/advisor";
import { initBmf, isBeltFight } from "./belts";
import { notify } from "../career/inbox";
import { refreshCard } from "./matchmaking";
import { grantStyleTech, pickStyles, switchStyle } from "./fightstyle";
import { dayOfIso, realSignals } from "./real";
import { styleFit, type GrappleStyle, type StrikeStyle } from "../data/fightstyles";
import type { Build } from "../data/body";
import GYM_FIXES from "../data/gym-fixes.json";
import FIGHTER_FIXES from "../data/fighter-fixes.json";

export const SAVE_VERSION = 7;
/** The oldest save format this version can bring up to date. */
export const OLDEST_SAVE = 1;

/** Bring a save from an older format up to date (the roster fills in what it did not keep). */
export function migrate(w: World, roster: RosterFile | null): World {
  if (w.v < 3) {
    // Format 2: real fighters are scouted as prospects. Their potential used
    // to sit barely above their level, so young real fighters never grew.
    // Their fights on the big stage before the world began, and the streaks
    // the snapshot was missing, come from the roster.
    // Format 3: a second scouting with more room for prospects and fighters in
    // their prime; short-notice calls on (there was no way to turn them on);
    // managers get a name.
    const byId = new Map((roster?.fighters ?? []).map((rf) => [rf.id, rf] as const));
    for (const f of Object.values(w.fighters)) {
      if (!f.real) continue;
      const rf = byId.get(f.id);
      if (rf?.pr && !f.prior) f.prior = { promo: rf.p as PromoId, n: rf.pr[0] + rf.pr[1] + rf.pr[2] };
      if (rf && !f.bouts.some((id) => w.bouts[id]?.status === "done")) f.streak = currentStreak(rf);
      if (rf) f.bestStreak = Math.max(f.bestStreak ?? 0, rf.bs ?? 0, f.streak);
      if (f.status !== "active") continue;
      const cur = ovrOf(f.attrs);
      const view = {
        age: ageAt(f.birth, w.day),
        w: f.rec.w,
        l: f.rec.l,
        d: f.rec.d,
        finishes: f.rec.koW + f.rec.subW,
        pop: f.pop,
        rank: rankOf(w, f),
        top: f.promo === "ufc" || f.promo === "pfl",
        growth: rf?.dv[1],
      };
      const pot = Math.round(clamp(cur + prospectRoom(view, cur, potentialNoise(f.id, w.seed)), cur, 94));
      if (pot > f.hid.pot) f.hid.pot = pot;
    }
    withRng(w, (rng) => {
      for (const id of Object.keys(w.career.fc)) {
        const fc = w.career.fc[id];
        const f = w.fighters[id];
        if (w.v < 3) fc.shortNotice = true;
        if (fc.manager && !fc.manager.person && f) Object.assign(fc.manager, managerPerson(rng, f));
      }
    });
    w.v = 3;
  }
  if (w.v < 4) {
    // Format 4: the BMF title, as it stood when the world began.
    initBmf(w);
    w.v = 4;
  }
  if (w.v < 5) {
    // Format 5: fighting styles. Real fighters get theirs from how they really fight.
    const byId = new Map((roster?.fighters ?? []).map((rf) => [rf.id, rf] as const));
    for (const f of Object.values(w.fighters)) {
      if (f.style) continue;
      const rf = f.real ? byId.get(f.id) : undefined;
      // The real background, where the snapshot names it, replaces the old guess.
      if (rf?.ba && rf.ba in ARTS) f.base = rf.ba as BaseArt;
      f.style = pickStyles(f, new Rng(hashString(f.id) ^ w.seed), rf ? realSignals(rf) : null);
      grantStyleTech(f);
    }
    w.v = 5;
  }
  if (w.v < 6 && roster?.titles) {
    // Format 6: the reigns the world began with start on the real date, with the real defences.
    for (const promo of ["ufc", "pfl"] as const) {
      for (const r of w.promos[promo]?.reigns ?? []) {
        const real = roster.titles[r.fighter];
        if (!real || r.won >= w.start || r.how !== "won") continue;
        r.won = Math.min(w.start - 1, dayOfIso(real[0]));
        r.defenses += real[1];
      }
    }
    w.v = 6;
  }
  if (w.v < 7 && roster) {
    // Format 7: the PFL's real fighters take the UFC's shape (leagueBalance). Built the old
    // way their fights went to the mat and ended in a knockout a third less often than real
    // PFL fights do. The player's own fighters and clients are left as they are.
    const balance = leagueBalance(roster.fighters);
    const pfl = new Set(roster.fighters.filter((rf) => rf.p !== "ufc").map((rf) => rf.id));
    const mine = new Set(w.career.fighters);
    for (const f of Object.values(w.fighters)) {
      if (!f.real || !pfl.has(f.id) || f.ctrl || mine.has(f.id)) continue;
      for (const k of ATTRS) f.attrs[k] = Math.round(clamp(f.attrs[k] + (balance[k] ?? 0), 1, 20) * 10) / 10;
    }
    w.v = 7;
  }
  return w;
}

/**
 * Gyms the roster used to list twice (City Kickboxing, and "The Fight Centre &
 * City Kickboxing" for one fighter who named both) are merged into one, the real
 * gyms get their cleaned names and places, and a made-up gym that shares a name
 * with another is renamed. For saves made before the roster was cleaned.
 */
export function tidyGyms(w: World): void {
  const merge = GYM_FIXES.merge as Record<string, string>;
  let moved = false;
  for (const f of Object.values(w.fighters)) {
    const to = merge[f.gym];
    if (to && w.gyms[to]) {
      f.gym = to;
      touchRoster(w, f);
      moved = true;
    }
  }
  for (const [from, to] of Object.entries(merge)) {
    const a = w.gyms[from];
    const b = w.gyms[to];
    if (!a || !b) continue;
    b.rep = Math.max(a.rep, b.rep);
    b.facilities = Math.max(a.facilities, b.facilities);
    delete w.gyms[from];
    moved = true;
  }
  for (const [id, fx] of Object.entries(GYM_FIXES.fix as Record<string, { n?: string; c?: string; city?: string; hc?: string; rep?: number; fac?: number; q?: number[] }>)) {
    const g = w.gyms[id];
    if (!g) continue;
    if (fx.n) g.name = fx.n;
    if (fx.hc) g.headCoach = fx.hc;
    if (fx.rep) g.rep = fx.rep;
    if (fx.fac) g.facilities = fx.fac;
    if (fx.q) g.coaches = { head: fx.q[0], striking: fx.q[1], grappling: fx.q[2], wrestling: fx.q[3], sc: fx.q[4] };
    if (fx.c) g.country = fx.c;
    if (fx.city) g.city = fx.city;
    else if (fx.c) g.city = countryOf(fx.c).cities[0];
  }
  // Made-up gyms that share a name (two "Kazan Muay Thai" in Kazan, a second "Manchester Top Team").
  const taken = new Set<string>();
  for (const g of Object.values(w.gyms).sort((a, b) => Number(!!b.real) - Number(!!a.real))) {
    if (taken.has(g.name.toLowerCase()) && !g.real && !g.owner) g.name = freeGymName(taken, g.name, g.city, hashString(g.id));
    taken.add(g.name.toLowerCase());
  }
  if (moved) touch(w);
}

/**
 * A made-up gym's name that no gym has yet: the next of the usual patterns for the
 * same city and surname, and only failing those a number.
 */
function freeGymName(taken: Set<string>, name: string, city: string, seed: number): string {
  // The surname in a "Team Silva" kind of name, when there is one.
  const m = name.match(/^Team (.+)$|^(.+) Combat Academy$|^(.+) Jiu-Jitsu$|^Iron (.+) Gym$/);
  const last = m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : null;
  const options = GYM_PATTERNS.filter((p) => last || !p.includes("{name}"));
  for (let k = 0; k < options.length; k++) {
    const n = options[(seed + k) % options.length].replace("{city}", city).replace("{name}", last ?? "");
    if (!taken.has(n.toLowerCase())) return n;
  }
  for (let k = 2; ; k++) if (!taken.has(`${name} ${k}`.toLowerCase())) return `${name} ${k}`;
}

/** Fixes for every save on load, whatever its version. */
export function repair(w: World): World {
  // Promotions added since the save was made (Road to UFC).
  for (const id of PROMO_IDS) if (!w.promos[id]) w.promos[id] = blankPromo(id);
  tidyGyms(w);
  // Finished bouts used to keep "awaiting: false".
  for (const b of Object.values(w.bouts)) if (b.awaiting === false) delete b.awaiting;
  // Real fighters the source placed in a gym where they don't train (Ian Machado Garry has been at
  // Chute Boxe Diego Lima since 2023): moved, if still at the gym they were given ("from", one or a
  // list; none when the source gave them no gym and the world picked one).
  for (const [id, fx] of Object.entries(FIGHTER_FIXES as Record<string, { gym?: string; from?: string | string[] }>)) {
    const f = w.fighters[id];
    if (!f || !fx.gym || !w.gyms[fx.gym] || f.gym === fx.gym || f.ctrl || w.career.fighters.includes(id)) continue;
    if (fx.from && !(Array.isArray(fx.from) ? fx.from : [fx.from]).includes(f.gym)) continue;
    f.gym = fx.gym;
    touchRoster(w, f);
  }
  // Real fighters the source got wrong (Shaqueme Rock was 833 years old).
  for (const [id, fx] of Object.entries(FIGHTER_FIXES as Record<string, { born?: string }>)) {
    const f = w.fighters[id];
    if (!f || !fx.born) continue;
    const [y, m, d] = fx.born.split("-").map(Number);
    const born = dayOf(y, m - 1, d);
    if (Math.abs(f.birth - born) > 400) f.birth = born;
  }
  // A generated fighter sharing a real fighter's name (a second "Dricus Du Plessis") gets their own.
  {
    const real = new Set<string>();
    for (const f of Object.values(w.fighters)) if (f.real) real.add(`${f.first} ${f.surname}`);
    const mine = new Set(w.career.fighters);
    for (const f of Object.values(w.fighters)) {
      if (f.real || f.ctrl || mine.has(f.id) || f.status !== "active" || !real.has(`${f.first} ${f.surname}`)) continue;
      const rng = new Rng(hashString(`${f.id}:name`) ^ w.seed);
      for (let k = 0; k < 8 && real.has(`${f.first} ${f.surname}`); k++) {
        const n = makeName(rng, countryOf(f.country).culture, f.sex);
        f.first = n.first;
        f.surname = n.last;
      }
    }
  }
  // "Ariane" was in the Brazilian men's names.
  for (const f of Object.values(w.fighters)) if (!f.real && f.sex === "M" && f.first === "Ariane") f.first = "Adriano";
  // Some signings used to leave the amateur flag on a fighter who had turned pro.
  for (const f of Object.values(w.fighters)) {
    if (f.amateur && ((f.promo && PROMOTIONS[f.promo].tier !== "amateur") || f.rec.w + f.rec.l + f.rec.d + f.rec.nc > 0)) f.amateur = false;
  }
  // Reigns left open when a second vacant-title winner overwrote the first, or an interim belt was dropped.
  for (const ps of Object.values(w.promos)) {
    for (const r of ps.reigns) {
      if (r.lost !== undefined) continue;
      const holder = r.interim ? ps.interim[r.div] : ps.champs[r.div];
      if (holder === r.fighter) continue;
      const next = ps.reigns.find((x) => x !== r && x.div === r.div && !!x.interim === !!r.interim && x.won >= r.won);
      r.lost = next ? next.won : w.day;
      r.ended = "vacated";
    }
  }
  // Champions used to be booked in fights with no belt on the line: a fighter who
  // beat the champion in one is first in line for the title.
  for (const [pid, ps] of Object.entries(w.promos)) {
    for (const [d, champId] of Object.entries(ps.champs) as [DivisionId, string | null | undefined][]) {
      const c = champId ? w.fighters[champId] : null;
      if (!c) continue;
      let last: Bout | undefined;
      for (let k = c.bouts.length - 1; k >= 0 && !last; k--) if (w.bouts[c.bouts[k]]?.status === "done") last = w.bouts[c.bouts[k]];
      if (!last || !last.res?.winner || isBeltFight(last) || last.promo !== pid || last.div !== d) continue;
      const day = last.day;
      const won = w.fighters[last.res.winner === "a" ? last.a : last.b];
      const held = ps.reigns.some((r) => r.fighter === c.id && r.div === d && r.won < day && (r.lost === undefined || r.lost >= day));
      if (!held || !won || won.id === c.id || won.status !== "active" || won.lastFight !== day || won.promo !== pid || won.div !== d || ps.contender[d] === won.id) continue;
      ps.contender[d] = won.id;
      if (won.ctrl) {
        notify(w, {
          kind: "info",
          fighter: won.id,
          from: `${PROMOTIONS[pid as PromoId].short} matchmaker`,
          subject: "First in line for the title",
          body: `${fullName(won)} beat the champion, ${fullName(c)}, in a fight the belt should have been on. The next fight for the ${DIVISIONS[d].name.toLowerCase()} title is yours.`,
          facts: [
            { k: "Beat", v: `${fullName(c)}, the champion`, tone: "good" },
            { k: "Next", v: "The title fight", tone: "good" },
          ],
        });
      }
    }
  }
  // Divisions with fighters but nobody ranked yet (the PFL's unranked ones), and the PFL's pound for pound.
  for (const [pid, ps] of Object.entries(w.promos)) {
    const p = PROMOTIONS[pid as PromoId];
    if (!p?.rankSize) continue;
    for (const d of p.divisions) if (!ps.ranks[d]?.length && Object.values(w.fighters).some((f) => f.promo === pid && f.div === d && f.status === "active")) updateRankings(w, pid as PromoId, [d]);
  }
  if (w.promos.pfl && !w.promos.pfl.p4p) w.promos.pfl.p4p = p4pOf(w, "pfl", 10);
  // Rankings with open places (new signings weren't ranked before their first fight) or a new size.
  refitRankings(w);
  // Champions and interim champions used to be booked in fights with no belt on the line.
  for (const id of w.upcoming) {
    const ev = w.events[id];
    if (ev && ev.status !== "done") refreshCard(w, ev);
  }
  return w;
}

export type StartLevel = "amateur" | "debut" | "regional";
export type Talent = "average" | "prospect" | "phenom";

export interface CreatedFighter {
  first: string;
  surname: string;
  nick?: string;
  sex: Sex;
  country: string;
  hometown?: string;
  div: DivisionId;
  age: number;
  height: number;
  reach: number;
  /** Body composition and the walking weight (lb); the division's usual when missing. */
  build?: Build;
  walk?: number;
  stance: Stance;
  art: BaseArt;
  /** The way they strike and grapple, from their background. */
  strike?: StrikeStyle;
  grapple?: GrappleStyle;
  talent: Talent;
  start: StartLevel;
  gym?: string;
}

export interface NewGameOptions {
  name: string;
  seed: number;
  mode: "fighter" | "manager";
  difficulty: "easy" | "normal" | "hard";
  takeover?: string;
  created?: CreatedFighter;
  managerName?: string;
  agency?: string;
  clients?: string[];
}

const TIER_LEVEL: Record<string, [number, number]> = {
  regional: [62, 5],
  local: [54, 5],
  amateur: [46, 4.5],
  league: [67, 5],
};

const GYM_PATTERNS = ["{city} MMA", "{city} Fight Club", "Team {name}", "{name} Combat Academy", "{city} Top Team", "{name} Jiu-Jitsu", "{city} Muay Thai", "{city} Wrestling Club", "Iron {name} Gym", "{city} Martial Arts Centre"];

function makeGym(w: World, rng: Rng, country: string, rep: number): Gym {
  const c = countryOf(country);
  const city = rng.pick(c.cities);
  const { last } = makeName(rng, c.culture, "M");
  const id = nextId(w, "gym");
  let name = rng.pick(GYM_PATTERNS).replace("{city}", city).replace("{name}", last);
  // No two gyms share a name, real or made up (the patterns repeat in a big city).
  const taken = new Set(Object.values(w.gyms).map((x) => x.name.toLowerCase()));
  if (taken.has(name.toLowerCase())) name = freeGymName(taken, name, city, hashString(id));
  const q = () => Math.round(clamp(rep + rng.normal(0, 8), 20, 90));
  const head = makeName(rng, c.culture, "M");
  const g: Gym = {
    id,
    name,
    country,
    city,
    rep: Math.round(rep),
    facilities: q(),
    coaches: { head: q(), striking: q(), grappling: q(), wrestling: q(), sc: q() },
    headCoach: `${head.first} ${head.last}`,
    fee: rep >= 80 ? 15 : rep >= 70 ? 12 : 10,
  };
  w.gyms[g.id] = g;
  return g;
}

function gymsIn(w: World, country: string): Gym[] {
  return Object.values(w.gyms).filter((g) => g.country === country && !g.owner);
}

export function pickGym(w: World, rng: Rng, country: string, level: number): Gym {
  let list = gymsIn(w, country);
  if (!list.length) {
    const region = countryOf(country).region;
    list = Object.values(w.gyms).filter((g) => countryOf(g.country).region === region && !g.owner);
  }
  if (!list.length) return makeGym(w, rng, country, 40);
  // Better fighters end up in better rooms.
  return rng.weighted(list, (g) => Math.exp(-Math.abs(g.rep - (level - 10)) / 14) + 0.02);
}

function blankPromo(id: PromoId): PromoState {
  return {
    id,
    champs: {},
    interim: {},
    ranks: {},
    prevRanks: {},
    reigns: [],
    counter: PROMOTIONS[id].firstNumber ?? 1,
    cityCount: {},
    nextEvent: 0,
    contender: {},
  };
}

export function contractFor(promo: PromoId, f: Fighter, day: number, rng: Rng, opts: { rank?: number | null; fights?: number } = {}): Contract {
  const p = PROMOTIONS[promo];
  const rank = opts.rank ?? null;
  let show: number;
  if (p.tier === "amateur") show = 0;
  else if (promo === "ufc") {
    if (rank === 0) show = Math.round(rng.range(500, 1100)) * 1000;
    else if (rank !== null && rank <= 5) show = Math.round(rng.range(150, 320)) * 1000;
    else if (rank !== null) show = Math.round(rng.range(55, 150)) * 1000;
    else show = Math.round(clamp(12 + f.pop * 0.5 + rng.range(0, 22), 12, 70)) * 1000;
  } else if (promo === "pfl") {
    if (rank === 0) show = Math.round(rng.range(350, 900)) * 1000;
    else if (rank !== null) show = Math.round(rng.range(50, 180)) * 1000;
    else show = Math.round(rng.range(10, 45)) * 1000;
  } else {
    const champ = rank === 0;
    show = Math.round((p.showLow + (p.showHigh - p.showLow) * (champ ? 0.6 : clamp((ovrOf(f.attrs) - 50) / 40, 0, 0.5) * rng.next())) / 100) * 100;
  }
  const flat = (promo === "ufc" || promo === "pfl") && rank === 0;
  const fights = opts.fights ?? (p.tier === "amateur" ? 99 : promo === "ufc" ? rng.int(1, 5) : rng.int(1, 4));
  return {
    promo,
    fights: Math.max(fights, 1),
    left: Math.max(fights, 1),
    show,
    win: flat ? 0 : show,
    escal: p.tier === "major" ? 2000 : p.tier === "league" ? 2500 : Math.round(show * 0.1),
    start: day,
    end: day + (p.tier === "amateur" ? 3650 : 365 * (promo === "ufc" ? 3 : 2)),
    champClause: p.tier === "major" || p.tier === "league",
    signBonus: 0,
  };
}

/** A promotion's level: its fighters' mean overall and spread, by tier and prestige. */
export function levelOf(promo: PromoId): [number, number] | null {
  const p = PROMOTIONS[promo];
  const lvl = TIER_LEVEL[p.tier];
  if (!lvl) return null;
  const prestigeShift = (p.prestige - (p.tier === "regional" ? 40 : p.tier === "local" ? 17 : 6)) * 0.12;
  return [lvl[0] + prestigeShift, lvl[1]];
}

function populate(w: World, rng: Rng, promo: PromoId): void {
  const p = PROMOTIONS[promo];
  const lvl = levelOf(promo);
  if (!lvl || p.region === "global") return;
  for (const d of p.divisions) {
    const women = DIVISIONS[d].sex === "F";
    const count = Math.round(p.rosterPerDiv * (women ? 0.6 : 1));
    const members: Fighter[] = [];
    for (let k = 0; k < count; k++) {
      const ageMean = p.tier === "amateur" ? 21 : p.tier === "local" ? 25.5 : 27.5;
      const age = Math.round(clamp(rng.normal(ageMean, p.tier === "amateur" ? 2.2 : 3.6), p.tier === "amateur" ? 17 : 19, 38));
      const o = clamp(rng.normal(lvl[0], lvl[1]), 35, 80);
      const f = generateFighter(rng, { id: nextId(w, "f"), region: p.region as RegionId, div: d, ovr: o, age, day: w.day, amateur: p.tier === "amateur", taken: namesInUse(w) });
      f.gym = pickGym(w, rng, f.country, o).id;
      if (p.tier === "amateur") f.am = makeRecord(rng, o, age, 0, true);
      else {
        f.rec = makeRecord(rng, o, age, p.tier === "local" ? 1 : 2, false);
        f.am = makeRecord(rng, o, Math.min(age, 22), 0, true);
      }
      f.promo = promo;
      f.contract = contractFor(promo, f, w.day, rng);
      f.elo = entryElo(promo, ovrOf(f.attrs), 1500) + (f.rec.w - f.rec.l) * 6;
      f.lastFight = w.day - rng.int(14, Math.round(p.gap * 1.3));
      f.streak = rng.chance(0.6) ? rng.int(1, 3) : -rng.int(1, 2);
      f.pop = Math.round(clamp((o - 40) * 0.6 + rng.normal(0, 5), 1, 40));
      f.joined = w.day;
      w.fighters[f.id] = f;
      touchRoster(w, f);
      members.push(f);
    }
    // The champion: the best of them, usually.
    if (p.tier !== "amateur" || rng.chance(0.8)) {
      const champ = members.slice().sort((a, b) => ovrOf(b.attrs) + b.rec.w * 0.3 - (ovrOf(a.attrs) + a.rec.w * 0.3))[rng.chance(0.75) ? 0 : 1];
      if (champ) {
        w.promos[promo].champs[d] = champ.id;
        champ.elo += 60;
        champ.streak = Math.max(champ.streak, rng.int(2, 5));
        champ.reigns = 1;
        w.promos[promo].reigns.push({ fighter: champ.id, promo, div: d, won: w.day - rng.int(40, 500), defenses: rng.int(0, 2), how: "won" });
        if (champ.contract) champ.contract.show = Math.round(champ.contract.show * 1.6);
      }
    }
  }
}

function freeAgentPool(w: World, rng: Rng): void {
  for (const region of REGION_IDS) {
    const n = region === "na" || region === "sa" || region === "ee" ? 30 : 16;
    for (let k = 0; k < n; k++) {
      const men = rng.chance(0.85);
      const div: DivisionId = men ? rng.pick(["FLY", "BW", "FW", "LW", "WW", "MW", "LHW", "HW"]) : rng.pick(["WSW", "WFLY", "WBW"]);
      const o = clamp(rng.normal(55, 6), 40, 72);
      const age = Math.round(clamp(rng.normal(27, 4), 19, 38));
      const f = generateFighter(rng, { id: nextId(w, "f"), region, div, ovr: o, age, day: w.day, taken: namesInUse(w) });
      f.gym = pickGym(w, rng, f.country, o).id;
      f.rec = makeRecord(rng, o, age, 1, false);
      f.elo = 1150 + (o - 54) * 9;
      f.lastFight = w.day - rng.int(30, 300);
      w.fighters[f.id] = f;
      touchRoster(w, f);
    }
  }
}

export function createWorld(roster: RosterFile, o: NewGameOptions): World {
  const seed = o.seed >>> 0;
  const rng = new Rng(seed);
  const day = 0;
  const career: Career = {
    mode: o.mode,
    name: o.managerName ?? o.name,
    fighters: [],
    money: 0,
    ledger: [],
    monthly: [],
    fc: {},
    fightOffers: [],
    contractOffers: [],
    sponsors: [],
    living: 1500,
    pitches: [],
    achievements: [],
  };
  const w: World = {
    v: SAVE_VERSION,
    id: `w${seed.toString(36)}${Date.now().toString(36)}`,
    name: o.name,
    created: Date.now(),
    seed,
    rng: rng.s,
    day,
    start: day,
    fighters: {},
    bouts: {},
    events: {},
    promos: {},
    gyms: {},
    news: [],
    inbox: [],
    career,
    ids: {},
    p4p: [],
    awards: [],
    hof: [],
    stamp: 0,
    upcoming: [],
  };
  for (const id of PROMO_IDS) w.promos[id] = blankPromo(id);

  // Gyms: the real ones, then rooms in every country.
  for (const g of roster.gyms) w.gyms[g.id] = realGym(g);
  for (const c of COUNTRY_LIST) {
    const n = Math.max(1, Math.round(Math.sqrt(c.talent) * 1.6));
    for (let k = 0; k < n; k++) makeGym(w, rng, c.code, clamp(rng.normal(38 + Math.sqrt(c.talent) * 3, 10), 15, 70));
  }

  // The real fighters.
  const ufcRank = new Map<string, number>();
  for (const [d, r] of Object.entries(roster.ufc.ranks)) {
    if (!r) continue;
    if (r.c) ufcRank.set(r.c, 0);
    r.e.forEach((id, i) => ufcRank.set(id, i + 1));
    void d;
  }
  const pflRank = new Map<string, number>();
  for (const id of Object.values(roster.pfl.champs)) if (id) pflRank.set(id, 0);
  for (const list of Object.values(roster.pfl.ranks)) list?.forEach((id, i) => pflRank.set(id, i + 1));
  const p4p = new Map(roster.ufc.p4p.map((id, i) => [id, i + 1] as const));
  const ctx = {
    rankOf: (id: string) => (id.startsWith("ufc-") ? ufcRank.get(id) ?? null : pflRank.get(id) ?? null),
    p4p: (id: string) => p4p.get(id) ?? null,
    day,
    balance: leagueBalance(roster.fighters),
  };
  for (const rf of roster.fighters) {
    const f = realFighter(rf, ctx, seed);
    if (f.promo === "pfl" && !PROMOTIONS.pfl.divisions.includes(f.div)) {
      f.promo = null; // the PFL runs no women's strawweight division
    }
    if (!f.gym || !w.gyms[f.gym]) f.gym = pickGym(w, rng, f.country, ovrOf(f.attrs)).id;
    const rank = f.promo ? ctx.rankOf(f.id) : null;
    if (f.promo) f.contract = contractFor(f.promo, f, day, rng, { rank });
    f.joined = day;
    const gap = f.promo === "ufc" ? 200 : 170;
    f.lastFight = day - rng.int(rank === 0 ? 60 : 21, gap);
    w.fighters[f.id] = f;
    touchRoster(w, f);
  }
  // UFC titles, rankings and ratings from the official list.
  const ups = w.promos.ufc;
  for (const [d, r] of Object.entries(roster.ufc.ranks) as [DivisionId, { c: string | null; e: string[] }][]) {
    if (r.c && w.fighters[r.c]) {
      ups.champs[d] = r.c;
      const f = w.fighters[r.c];
      // The real reign when the fight histories have it; otherwise an estimate.
      const est = day - rng.int(120, 700);
      const real = roster.titles?.[r.c];
      ups.reigns.push({ fighter: r.c, promo: "ufc", div: d, won: real ? Math.min(day - 1, dayOfIso(real[0])) : est, defenses: real?.[1] ?? 0, how: "won" });
      f.elo = 1860;
    } else ups.champs[d] = null;
    ups.ranks[d] = r.e.filter((id) => w.fighters[id]?.promo === "ufc");
    ups.ranks[d]!.forEach((id, i) => (w.fighters[id].elo = 1800 - i * 9));
  }
  for (const f of Object.values(w.fighters)) {
    if (f.promo === "ufc" && !ufcRank.has(f.id)) f.elo = Math.round(clamp(1480 + (ovrOf(f.attrs) - 72) * 13 + clamp(f.streak, -3, 8) * 6, 1380, 1665));
  }
  const pps = w.promos.pfl;
  for (const d of PROMOTIONS.pfl.divisions) {
    const c = roster.pfl.champs[d];
    pps.champs[d] = c && w.fighters[c] ? c : null;
    if (c && w.fighters[c]) {
      w.fighters[c].elo = 1690;
      const est = day - rng.int(90, 500);
      const real = roster.titles?.[c];
      pps.reigns.push({ fighter: c, promo: "pfl", div: d, won: real ? Math.min(day - 1, dayOfIso(real[0])) : est, defenses: real?.[1] ?? 0, how: "won" });
    }
    const ic = roster.pfl.interim[d];
    pps.interim[d] = ic && w.fighters[ic] ? ic : null;
    if (ic && w.fighters[ic]) w.fighters[ic].elo = 1660;
    pps.ranks[d] = (roster.pfl.ranks[d] ?? []).filter((id) => w.fighters[id]?.promo === "pfl");
    pps.ranks[d]!.forEach((id, i) => (w.fighters[id].elo = 1650 - i * 11));
  }
  for (const f of Object.values(w.fighters)) {
    if (f.promo === "pfl" && !pflRank.has(f.id) && pps.interim[f.div] !== f.id) f.elo = Math.round(clamp(1390 + (ovrOf(f.attrs) - 66) * 11 + clamp(f.streak, -3, 8) * 5, 1250, 1600));
  }
  w.p4p = roster.ufc.p4p.filter((id) => w.fighters[id]?.promo === "ufc");

  // PFL divisions with few real fighters get generated depth.
  for (const d of PROMOTIONS.pfl.divisions) {
    const have = Object.values(w.fighters).filter((f) => f.promo === "pfl" && f.div === d).length;
    const want = DIVISIONS[d].sex === "F" ? 14 : 22;
    for (let k = have; k < want; k++) {
      const region = rng.pick(["na", "we", "ee", "sa", "af", "wa"] as RegionId[]);
      const o2 = clamp(rng.normal(66, 4.5), 55, 78);
      const age = Math.round(clamp(rng.normal(29, 3.5), 22, 38));
      const f = generateFighter(rng, { id: nextId(w, "f"), region, div: d, ovr: o2, age, day, taken: namesInUse(w) });
      f.gym = pickGym(w, rng, f.country, o2).id;
      f.rec = makeRecord(rng, o2, age, 3, false);
      f.promo = "pfl";
      f.contract = contractFor("pfl", f, day, rng);
      f.elo = Math.round(1390 + (o2 - 66) * 11);
      f.lastFight = day - rng.int(30, 160);
      f.pop = Math.round(clamp((o2 - 45) * 0.8, 5, 45));
      f.joined = day;
      w.fighters[f.id] = f;
      touchRoster(w, f);
    }
  }
  // Divisions the real PFL rankings don't cover are ranked by rating; then the PFL's pound for pound.
  for (const d of PROMOTIONS.pfl.divisions) if (!pps.ranks[d]?.length) updateRankings(w, "pfl", [d]);
  pps.p4p = p4pOf(w, "pfl", 10);

  // Every region's ladder.
  for (const id of PROMO_IDS) populate(w, rng, id);
  freeAgentPool(w, rng);
  touch(w);
  for (const id of PROMO_IDS) if (PROMOTIONS[id].rankSize && id !== "ufc" && id !== "pfl") updateRankings(w, id);

  // First events: every promotion starts within its own interval.
  for (const id of PROMO_IDS) {
    const p = PROMOTIONS[id];
    const ps = w.promos[id];
    const first = id === "ufc" ? 5 : Math.round(rng.range(3, Math.max(8, 365 / p.eventsPerYear)));
    let d0 = first;
    while (((d0 % 7) + 7) % 7 !== p.day) d0++;
    ps.nextEvent = d0;
  }
  ensureSchedule(w, rng);
  w.rng = rng.s;

  setupCareer(w, roster, o);
  updateP4P(w);
  initBmf(w);
  welcome(w, o);
  return w;
}

function difficultyMoney(o: NewGameOptions, base: number): number {
  return Math.round(base * (o.difficulty === "easy" ? 1.8 : o.difficulty === "hard" ? 0.6 : 1));
}

export function addControlled(w: World, f: Fighter): void {
  f.ctrl = true;
  if (!w.career.fighters.includes(f.id)) w.career.fighters.push(f.id);
  w.career.fc[f.id] = {
    id: f.id,
    plan: defaultTraining(f),
    camp: null,
    goals: [],
    progress: [{ day: w.day, ovr: Math.round(ovrOf(f.attrs)) }],
    dayJob: false,
    manager: null,
    mediaStyle: "confident",
    shortNotice: true,
  };
}

function setupCareer(w: World, roster: RosterFile, o: NewGameOptions): void {
  const c = w.career;
  if (o.mode === "fighter") {
    let f: Fighter | undefined;
    if (o.takeover && w.fighters[o.takeover]) {
      f = w.fighters[o.takeover];
      const champ = f.promo ? w.promos[f.promo].champs[f.div] === f.id : false;
      const est = (f.contract?.show ?? 10000) * (f.rec.w + f.rec.l) * 0.25;
      c.money = difficultyMoney(o, clamp(est, 15000, champ ? 2500000 : 600000));
      c.living = f.promo === "ufc" ? (champ ? 15000 : 5000) : 3000;
    } else if (o.created) {
      f = createPlayerFighter(w, o.created, o);
      const start = o.created.start;
      c.money = difficultyMoney(o, start === "amateur" ? 2500 : start === "debut" ? 4000 : 9000);
      c.living = start === "amateur" ? 1100 : start === "debut" ? 1500 : 2200;
    }
    if (f) {
      addControlled(w, f);
      if (o.created && o.created.start !== "regional") c.fc[f.id].dayJob = true;
      c.name = fullName(f);
    }
  } else {
    c.money = difficultyMoney(o, 60000);
    c.living = 4500;
    c.agency = { name: o.agency || "New Agency", rep: 22, cut: 15, staff: 1, scouting: [] };
    for (const id of o.clients ?? []) {
      const f = w.fighters[id];
      if (f) addControlled(w, f);
    }
  }
  touch(w);
}

export function createPlayerFighter(w: World, cf: CreatedFighter, o: NewGameOptions): Fighter {
  const region = countryOf(cf.country).region;
  const level = cf.start === "amateur" ? 47 : cf.start === "debut" ? 53 : 61;
  const potBy: Record<Talent, number> = { average: 72, prospect: 82, phenom: 90 };
  const pot = potBy[cf.talent] + (o.difficulty === "easy" ? 3 : o.difficulty === "hard" ? -3 : 0);
  const f = withRng(w, (rng) => {
    // The chosen body shapes the fighter: height moves strength and footwork.
    const g = generateFighter(rng, { id: nextId(w, "p"), country: cf.country, region, div: cf.div, ovr: level, age: cf.age, day: w.day, art: cf.art, pot, height: cf.height, reach: cf.reach, build: cf.build, walk: cf.walk });
    if (cf.build) g.build = cf.build;
    g.first = cf.first;
    g.surname = cf.surname;
    g.nick = cf.nick || undefined;
    g.hometown = cf.hometown || g.hometown;
    g.height = cf.height;
    g.reach = cf.reach;
    g.stance = cf.stance;
    g.hid.pot = pot;
    // A created fighter gets an ordinary body clock: no hidden early fade.
    g.hid.aging = "normal";
    g.hid.peak = Math.round(clamp(rng.normal(29.5, 0.8), 28, 31) * 10) / 10;
    g.hid.consistency = Math.max(g.hid.consistency, 11);
    g.pers.professionalism = Math.max(g.pers.professionalism, 13);
    g.gym = cf.gym && w.gyms[cf.gym] ? cf.gym : pickGym(w, rng, cf.country, level + 8).id;
    if (cf.start === "regional") {
      g.rec = { w: 5, l: 1, d: 0, nc: 0, koW: 2, subW: 1, decW: 2, koL: 0, subL: 0, decL: 1 };
      g.am = { w: 6, l: 2, d: 0, nc: 0, koW: 2, subW: 2, decW: 2, koL: 0, subL: 1, decL: 1 };
    } else if (cf.start === "debut") {
      g.am = { w: 4, l: 1, d: 0, nc: 0, koW: 1, subW: 1, decW: 2, koL: 0, subL: 0, decL: 1 };
    }
    g.amateur = cf.start === "amateur";
    const tier = cf.start === "amateur" ? "amateur" : cf.start === "debut" ? "local" : "regional";
    const p = promoFor(region, tier) ?? promoFor("na", tier)!;
    if (!p.divisions.includes(cf.div)) {
      // Small scenes without the division: start in the nearest region that has it.
      const alt = REGION_IDS.map((r) => promoFor(r, tier)).find((x) => x && x.divisions.includes(cf.div));
      g.promo = alt?.id ?? p.id;
    } else g.promo = p.id;
    g.contract = contractFor(g.promo!, g, w.day, rng, { fights: tier === "amateur" ? 99 : 3 });
    g.elo = entryElo(g.promo!, ovrOf(g.attrs), 1200);
    g.lastFight = cf.start === "amateur" ? null : w.day - 60;
    g.pop = cf.start === "regional" ? 8 : 2;
    g.joined = w.day;
    g.best = Math.round(ovrOf(g.attrs));
    return g;
  });
  // The styles they came up with: as deep as the start level allows.
  const depth = cf.start === "amateur" ? 26 : cf.start === "debut" ? 34 : 44;
  if (cf.strike) switchStyle(f, cf.strike);
  if (cf.grapple) switchStyle(f, cf.grapple);
  const st = f.style!;
  st.sm = Math.round(clamp(depth + (styleFit(f.attrs, st.s) - 50) * 0.15, 15, 60));
  st.gm = Math.round(clamp(depth - 4 + (styleFit(f.attrs, st.g) - 50) * 0.15, 12, 55));
  st.known = undefined;
  grantStyleTech(f);
  w.fighters[f.id] = f;
  touchRoster(w, f);
  return f;
}

function welcome(w: World, o: NewGameOptions): void {
  const c = w.career;
  const f = c.fighters[0] ? w.fighters[c.fighters[0]] : undefined;
  if (o.mode === "fighter" && f) {
    const p = f.promo ? PROMOTIONS[f.promo] : null;
    w.inbox.unshift({
      id: nextId(w, "m"),
      day: w.day,
      from: w.gyms[f.gym]?.headCoach ?? "Your coach",
      subject: "Welcome to the team",
      body: `Good to have you at ${w.gyms[f.gym]?.name ?? "the gym"}. ${p ? `You're signed to ${p.name}. ` : ""}Set your training week on the Training page, keep an eye on your inbox for fight offers, and press Continue to move the calendar on. When a fight is signed, the camp starts: plan the cut, pick the sparring partners and build the game plan.`,
      kind: "info",
      read: false,
      fighter: f.id,
    });
  } else {
    w.inbox.unshift({
      id: nextId(w, "m"),
      day: w.day,
      from: "Agency office",
      subject: `${c.agency?.name ?? "The agency"} opens its doors`,
      body: `You manage ${c.fighters.length} fighter${c.fighters.length === 1 ? "" : "s"}. You take ${c.agency?.cut ?? 15}% of every purse and 20% of sponsorship deals. Negotiate their contracts, choose their fights and camps, find them sponsors, and sign more talent from the Scouting page. A good stable builds your reputation; a bad deal costs you clients.`,
      kind: "info",
      read: false,
    });
  }
  addNews(w, { kind: "other", text: "A new season of MMA is under way. The UFC, the PFL and promotions in eight regions have cards on the calendar." });
}

/** Fighters a new manager can sign at the start: young talent outside the top level. */
export function starterClients(w: World, n = 24): Fighter[] {
  const pool = Object.values(w.fighters).filter(
    (f) => f.status === "active" && !f.ctrl && f.promo && ["regional", "local", "league"].includes(PROMOTIONS[f.promo].tier) && f.hid.pot >= 70,
  );
  pool.sort((a, b) => b.hid.pot + ovrOf(b.attrs) * 0.3 - (a.hid.pot + ovrOf(a.attrs) * 0.3));
  const out: Fighter[] = [];
  const seen = new Set<string>();
  for (const f of pool) {
    const key = `${f.promo}:${f.div}`;
    if (seen.has(key) && out.length < n * 0.7) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= n) break;
  }
  return out;
}

export function regionCountries(region: RegionId) {
  return countriesIn(region);
}

export { pickCountry };
export const ART_LIST = Object.values(ARTS);
export const seedFrom = (s: string) => hashString(s);
