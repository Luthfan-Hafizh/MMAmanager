// The calendar of events. The UFC runs a card most Saturdays (about thirteen
// numbered events and thirty Fight Nights a year), the PFL two a month, the
// Contender Series ten Tuesdays from August, and every region its own shows.

import type { Rng } from "../core/rng";
import { hashString } from "../core/rng";
import { nextDow, ymd, dayOf } from "../core/time";
import { PROMOTIONS, PROMO_IDS, VENUES, type PromoId, RTU_DIVS } from "../data/promotions";
import { countryOf } from "../data/countries";
import type { MMAEvent, World } from "../model/types";
import { nextId } from "./core";
import { type DivisionId } from "../data/divisions";

const HORIZON = 200;

function winterBreak(day: number, ufc: boolean): boolean {
  const t = ymd(day);
  if (t.m === 11 && t.d >= (ufc ? 20 : 18)) return true;
  if (t.m === 0 && t.d <= (ufc ? 15 : 9)) return true;
  return false;
}

function splitCity(s: string): { city: string; country: string } {
  const [city, country] = s.split(", ");
  return { city, country: country ?? "US" };
}

function venueFor(rng: Rng, city: string, promo: PromoId, numbered: boolean): string {
  const list = VENUES[city];
  if (promo === "ufc" && city === "Las Vegas") return numbered ? "T-Mobile Arena" : "Meta APEX";
  if (list && list.length) return rng.pick(list);
  const p = PROMOTIONS[promo];
  if (p.tier === "amateur") return `${city} Sports Hall`;
  if (p.tier === "local") return rng.pick([`${city} Convention Centre`, `${city} Events Centre`, `${city} Arena`]);
  return `${city} Arena`;
}

function addEvent(w: World, ev: Omit<MMAEvent, "id" | "bouts" | "status">): MMAEvent {
  const e: MMAEvent = { ...ev, id: nextId(w, "evt"), bouts: [], status: "planned" };
  w.events[e.id] = e;
  w.upcoming.push(e.id);
  return e;
}

export function sortUpcoming(w: World): void {
  w.upcoming.sort((a, b) => w.events[a].day - w.events[b].day);
}

/** Keep every promotion's calendar filled about seven months ahead. */
export function ensureSchedule(w: World, rng: Rng): void {
  let added = false;
  for (const id of PROMO_IDS) {
    const p = PROMOTIONS[id];
    const ps = w.promos[id];
    if (!ps) continue;
    if (id === "dwcs") {
      added = scheduleDwcs(w, rng) || added;
      continue;
    }
    if (id === "rtu") {
      added = scheduleRtu(w) || added;
      continue;
    }
    let guard = 0;
    while (ps.nextEvent <= w.day + HORIZON && guard++ < 60) {
      const day = ps.nextEvent;
      const interval = 365 / p.eventsPerYear;
      if (winterBreak(day, id === "ufc") || (id !== "ufc" && rng.chance(0.06))) {
        ps.nextEvent = nextDow(day + 7, p.day);
        continue;
      }
      createEvent(w, rng, id, day);
      added = true;
      let step = id === "ufc" ? 7 : Math.round(interval * (0.8 + rng.next() * 0.4));
      if (id === "ufc" && rng.chance(9 / 52)) step = 14; // a week off
      ps.nextEvent = nextDow(day + Math.max(5, step), p.day);
    }
  }
  if (added) sortUpcoming(w);
}

function createEvent(w: World, rng: Rng, id: PromoId, day: number): MMAEvent {
  const p = PROMOTIONS[id];
  const ps = w.promos[id];
  if (id === "ufc") {
    const sinceNumbered = day - (ps.cityCount["__lastNumbered"] ?? -999);
    const numbered = sinceNumbered >= 25 && (sinceNumbered >= 35 || rng.chance(0.55));
    let place: string;
    if (numbered) place = rng.chance(0.35) ? "Las Vegas, US" : rng.pick(p.cities.filter((c) => !c.startsWith("Las Vegas")));
    else place = rng.chance(0.55) ? "Las Vegas, US" : rng.pick(p.cities);
    const { city, country } = splitCity(place);
    if (numbered) {
      ps.cityCount["__lastNumbered"] = day;
      const number = ps.counter++;
      return addEvent(w, { promo: id, name: `UFC ${number}`, day, city, country, venue: venueFor(rng, city, id, true), kind: "numbered", number });
    }
    return addEvent(w, { promo: id, name: "UFC Fight Night", day, city, country, venue: venueFor(rng, city, id, false), kind: "fightnight" });
  }
  const place = rng.pick(p.cities);
  const { city, country } = splitCity(place);
  if (p.naming === "city") {
    const year = ymd(day).y;
    const key = `${year}:${city}`;
    const k = (ps.cityCount[key] ?? 0) + 1;
    ps.cityCount[key] = k;
    return addEvent(w, { promo: id, name: `${p.short} ${city}${k > 1 ? ` ${k}` : ""}`, day, city, country, venue: venueFor(rng, city, id, false), kind: "standard" });
  }
  const number = ps.counter++;
  if (p.naming === "amateur") {
    return addEvent(w, { promo: id, name: `${p.short} Open ${number}`, day, city, country, venue: venueFor(rng, city, id, false), kind: "amateur", number });
  }
  return addEvent(w, { promo: id, name: `${p.short} ${number}`, day, city, country, venue: venueFor(rng, city, id, false), kind: "standard", number });
}

/** The Contender Series: ten Tuesday nights from the first week of August. */
function scheduleDwcs(w: World, rng: Rng): boolean {
  const ps = w.promos.dwcs;
  const y = ymd(w.day).y;
  let added = false;
  for (const year of [y, y + 1]) {
    const key = `season:${year}`;
    if (ps.cityCount[key]) continue;
    const first = nextDow(dayOf(year, 7, 1), 1);
    if (first + 70 < w.day) {
      ps.cityCount[key] = 1;
      continue;
    }
    if (first > w.day + HORIZON) continue;
    ps.cityCount[key] = 1;
    const season = year - 2016;
    for (let k = 0; k < 10; k++) {
      const day = first + k * 7;
      if (day < w.day + 3) continue;
      addEvent(w, {
        promo: "dwcs",
        name: `Contender Series S${season}, Week ${k + 1}`,
        day,
        city: "Las Vegas",
        country: "US",
        venue: "Meta APEX",
        kind: "tryout",
        number: k + 1,
      });
      added = true;
    }
  }
  return added;
}

/** Road to UFC: the opening round over a Friday and Saturday from mid-May, the semifinals on a Saturday from late August, both in Shanghai. */
function scheduleRtu(w: World): boolean {
  const ps = w.promos.rtu;
  if (!ps) return false;
  const y = ymd(w.day).y;
  let added = false;
  for (const year of [y, y + 1]) {
    const key = `season:${year}`;
    if (ps.cityCount[key]) continue;
    const first = nextDow(dayOf(year, 4, 15), 4);
    // Too late for this year's field: the next season it is.
    if (first < w.day + 60) {
      ps.cityCount[key] = 1;
      continue;
    }
    if (first > w.day + HORIZON) continue;
    ps.cityCount[key] = 1;
    const season = year - 2021;
    const semis = nextDow(dayOf(year, 7, 20), 5);
    const nights: [number, number, DivisionId[], string][] = [
      [first, 0, RTU_DIVS.slice(0, 2), "Opening Round, Night 1"],
      [first + 1, 0, RTU_DIVS.slice(2, 4), "Opening Round, Night 2"],
      [semis, 1, RTU_DIVS, "Semifinals"],
    ];
    for (const [day, round, divs, label] of nights) {
      addEvent(w, { promo: "rtu", name: `Road to UFC Season ${season}: ${label}`, day, city: "Shanghai", country: "CN", venue: "UFC Performance Institute Shanghai", kind: "tournament", number: season, rtu: { year, round, divs } });
      added = true;
    }
  }
  return added;
}

export function eventsOn(w: World, day: number): MMAEvent[] {
  const out: MMAEvent[] = [];
  for (const id of w.upcoming) {
    const e = w.events[id];
    if (e.day === day) out.push(e);
    else if (e.day > day) break;
  }
  return out;
}

export function upcomingOf(w: World, promo?: PromoId, limit = 50): MMAEvent[] {
  const out: MMAEvent[] = [];
  for (const id of w.upcoming) {
    const e = w.events[id];
    if (promo && e.promo !== promo) continue;
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function markDone(w: World, ev: MMAEvent): void {
  ev.status = "done";
  const i = w.upcoming.indexOf(ev.id);
  if (i >= 0) w.upcoming.splice(i, 1);
}

/** Flavour seed for an event (for repeatable descriptions). */
export function eventSeed(ev: MMAEvent): number {
  return hashString(ev.id + ev.name);
}

export function countryName(code: string): string {
  return countryOf(code).name;
}

/** Billing sections: numbered UFC cards 5 main card / 4 prelims / early prelims; others 5-6 main card. */
export function cardSection(ev: MMAEvent, index: number): "Main card" | "Prelims" | "Early prelims" {
  const n = ev.bouts.length;
  if (ev.kind === "numbered") {
    if (index < 5) return "Main card";
    if (index < 9) return "Prelims";
    return "Early prelims";
  }
  const main = ev.kind === "fightnight" ? 6 : ev.kind === "tryout" || ev.kind === "tournament" ? n : 5;
  return index < main ? "Main card" : "Prelims";
}
