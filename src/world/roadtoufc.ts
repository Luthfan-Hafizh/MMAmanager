// Road to UFC, Asia's way into the UFC since 2022 (Australia and New Zealand joined in
// 2025): every year four brackets of eight prospects, at flyweight, bantamweight,
// featherweight and lightweight. The opening round is two nights in Shanghai in May,
// the semifinals there in August, and the four finals go on a UFC card; each winner
// gets a UFC contract. A fighter in a bracket fights only in it until knocked out, an
// alternate steps in for a withdrawal, and with no alternate the opponent goes through.

import type { Rng } from "../core/rng";
import { fmtDate, ymd } from "../core/time";
import { countryOf } from "../data/countries";
import { DIVISIONS, type DivisionId } from "../data/divisions";
import { PROMOTIONS, RTU_DIVS } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Bout, Fighter, Message, MMAEvent, RtuBracket, World } from "../model/types";
import { addNews, availableFrom, fullName, touch } from "./core";
import { makeBout, offerFight, orderCard } from "./matchmaking";
import { asiaProspect } from "./market";
import { signTo } from "./results";
import { closeMessages, notify } from "../career/inbox";
import { acceptFight, makeContractOffer } from "../career/offers";

/** The season a year's tournament is (2022 was the first). */
export const rtuSeason = (year: number) => year - 2021;

const ROUNDS = ["opening round", "semifinal", "final"];

/** "Road to UFC semifinal". */
export function rtuLabel(r: { round: number }): string {
  return `Road to UFC ${ROUNDS[r.round] ?? "final"}`;
}

export function bracketOf(w: World, id: string): RtuBracket | undefined {
  return w.rtu?.find((t) => t.id === id);
}

/** The latest season's brackets, the newest year first. */
export function latestBrackets(w: World): RtuBracket[] {
  const list = w.rtu ?? [];
  const year = Math.max(...list.map((t) => t.year), -1);
  return list.filter((t) => t.year === year);
}

// ---------- who is held ----------

const heldCache = new WeakMap<World, { key: string; set: Set<string> }>();

/** Fighters still in a bracket: nobody books them for anything else until they're out. */
export function heldByRtu(w: World, f: Fighter): boolean {
  const list = w.rtu;
  if (!list?.length) return false;
  let key = "";
  for (const t of list) key += `${t.id}:${t.v},`;
  let h = heldCache.get(w);
  if (!h || h.key !== key) {
    const set = new Set<string>();
    for (const t of list) if (!t.done) for (const id of t.slots[t.slots.length - 1]) if (id) set.add(id);
    heldCache.set(w, (h = { key, set }));
  }
  return h.set.has(f.id);
}

// ---------- the field ----------

/** The prospects the scouts would take: Asia and Oceania, outside the UFC and the PFL, 31 or younger, a record worth a look. */
function eligible(w: World, f: Fighter, day: number): boolean {
  if (f.status !== "active" || f.amateur) return false;
  const region = countryOf(f.country).region;
  if (region !== "ea" && region !== "oc") return false;
  if (f.promo) {
    const tier = PROMOTIONS[f.promo].tier;
    if (tier !== "regional" && tier !== "local") return false;
  }
  if (f.tags?.includes("ufc-alum") || f.tags?.includes("rtu")) return false;
  const age = (day - f.birth) / 365.25;
  if (age < 19 || age > 31) return false;
  if (f.rec.w < 4 || f.rec.l > f.rec.w || ovrOf(f.attrs) < 55) return false;
  if (availableFrom(f) > day - 21) return false;
  // Already booked for a fight too close to the opening round.
  const b = f.booked ? w.bouts[f.booked] : undefined;
  if (b && b.status === "booked" && b.day > day - 35) return false;
  return !heldByRtu(w, f);
}

const score = (f: Fighter, day: number) => ovrOf(f.attrs) + Math.max(0, 28 - (day - f.birth) / 365.25) * 0.5 + Math.max(-2, f.streak) * 0.8;

function candidates(w: World, d: DivisionId, day: number, taken: Set<string>): Fighter[] {
  return Object.values(w.fighters)
    .filter((f) => f.div === d && !taken.has(f.id) && eligible(w, f, day))
    .sort((a, b) => score(b, day) - score(a, day));
}

/** About three months before the opening round the field is named, and the player's fighters who made it are asked. */
function nameFields(w: World, rng: Rng, year: number, day: number): void {
  const taken = new Set<string>();
  const made: RtuBracket[] = [];
  for (const d of RTU_DIVS) {
    // Mostly Asia's prospects: Australia and New Zealand, there since 2025, take two places at most.
    const pool: Fighter[] = [];
    let oceania = 0;
    for (const f of candidates(w, d, day, taken)) {
      if (pool.length >= 10) break;
      if (countryOf(f.country).region === "oc") {
        if (oceania >= 2) continue;
        oceania++;
      }
      pool.push(f);
    }
    // Short of ten at the weight, the scouts look further across Asia.
    while (pool.length < 10) pool.push(asiaProspect(w, rng, d, oceania >= 2 ? "ea" : undefined));
    for (const f of pool) taken.add(f.id);
    // Seeds one to eight meet 1v8, 4v5, 3v6, 2v7.
    const order = [0, 7, 3, 4, 2, 5, 1, 6].map((i) => pool[i].id);
    const t: RtuBracket = { id: `rtu-${year}-${d}`, year, div: d, slots: [order], alts: pool.slice(8).map((f) => f.id), evs: [null, null, null], made: [false, false, false], adv: {}, v: 0 };
    (w.rtu ??= []).push(t);
    made.push(t);
    for (const id of order) if (w.fighters[id].ctrl) invite(w, t, w.fighters[id], day);
  }
  addNews(w, {
    kind: "other",
    promo: "rtu",
    fighters: made.map((t) => t.slots[0][0]!).filter(Boolean),
    text: `Road to UFC Season ${rtuSeason(year)}: thirty-two of Asia's and Oceania's best prospects in four brackets of eight, from ${fmtDate(day)} in Shanghai. Three wins and the UFC contract is theirs.`,
  });
  touch(w);
}

function invite(w: World, t: RtuBracket, f: Fighter, day: number): void {
  const fc = w.career.fc[f.id];
  if (!fc) return;
  fc.rtu = { id: t.id, day: w.day };
  const who = w.career.mode === "manager" ? fullName(f) : "you";
  const short = f.promo ? PROMOTIONS[f.promo].short : null;
  notify(w, {
    kind: "contract",
    fighter: f.id,
    ref: `rtu:${t.id}:${f.id}`,
    from: "Road to UFC",
    subject: `Invitation: Road to UFC Season ${rtuSeason(t.year)}`,
    body: `The UFC's scouts in Asia want ${who} in this year's ${DIVISIONS[t.div].name.toLowerCase()} bracket: eight prospects, and three wins between the opening round and a UFC contract. The opening round is in Shanghai on ${fmtDate(day)}, the semifinals in August, and the final on a UFC card.${short ? ` The ${short} deal lets ${w.career.mode === "manager" ? "the fighter" : "you"} go for it.` : ""} While in the bracket, there are no other fights.`,
    needs: true,
    actions: [
      { id: "rtu:yes", label: "Enter the tournament", primary: true },
      { id: "rtu:no", label: "Not this year", danger: true },
    ],
    facts: [
      { k: "Opening round", v: `${fmtDate(day)}, Shanghai` },
      { k: "Then", v: "The semifinals in August, the final on a UFC card" },
      { k: "At stake", v: "A UFC contract for the winner", tone: "good" },
      { k: "Purse", v: "$6,000 + $6,000 to win" },
      { k: "Answer by", v: fmtDate(w.day + 14) },
    ],
  });
}

/** The answer to the invitation. */
export function answerRtu(w: World, m: Message, action: string): string {
  const f = m.fighter ? w.fighters[m.fighter] : null;
  const inv = f ? w.career.fc[f.id]?.rtu : undefined;
  if (!f || !inv || inv.yes !== undefined) return "";
  const t = bracketOf(w, inv.id);
  if (action === "rtu:yes" && t && !t.made[0]) {
    inv.yes = true;
    touch(w);
    return `In: the ${DIVISIONS[t.div].name.toLowerCase()} bracket of Road to UFC Season ${rtuSeason(t.year)}.`;
  }
  inv.yes = false;
  if (t && !t.made[0]) {
    const i = t.slots[0].indexOf(f.id);
    if (i >= 0) t.slots[0][i] = nextAlt(w, t, w.day + 60);
    t.v++;
  }
  touch(w);
  return "Not this year. The scouts will look again next season.";
}

// ---------- the rounds ----------

/** Fit and free for a fight on this day. */
function fitFor(w: World, id: string | null, day: number): boolean {
  const f = id ? w.fighters[id] : null;
  if (!f || f.status !== "active" || availableFrom(f) > day - 14) return false;
  if (f.promo === "ufc" || f.promo === "pfl") return false;
  return !f.booked || w.bouts[f.booked]?.status !== "booked";
}

function nextAlt(w: World, t: RtuBracket, day: number): string | null {
  while (t.alts.length) {
    const id = t.alts.shift()!;
    if (fitFor(w, id, day) && !heldByRtu(w, w.fighters[id])) return id;
  }
  return null;
}

/** The night a round is fought on: Road to UFC's own in Shanghai, and a UFC card for the finals. */
function roundEvent(w: World, t: RtuBracket, r: number): MMAEvent | null {
  if (t.evs[r]) return w.events[t.evs[r]!] ?? null;
  if (r < 2) {
    for (const id of w.upcoming) {
      const e = w.events[id];
      if (e?.rtu && e.rtu.year === t.year && e.rtu.round === r && e.rtu.divs.includes(t.div)) return e;
    }
    return null;
  }
  // One night for all four finals: a UFC card two to seven months out, in Asia or the Gulf if there is one.
  for (const s of w.rtu ?? []) {
    if (s.year === t.year && s.evs[2] && w.events[s.evs[2]]?.status === "planned") return w.events[s.evs[2]];
  }
  let best: MMAEvent | null = null;
  let bestScore = -Infinity;
  for (const id of w.upcoming) {
    const e = w.events[id];
    if (!e || e.promo !== "ufc" || e.status !== "planned") continue;
    const days = e.day - w.day;
    if (days < 70) continue;
    if (days > 220) break;
    const s = (FINAL_PLACES.has(e.country) ? 10 : 0) + (e.kind === "fightnight" ? 3 : 0) - days / 60;
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return best;
}

const FINAL_PLACES = new Set(["CN", "SG", "AU", "NZ", "JP", "KR", "PH", "TH", "AE", "QA", "SA", "AZ"]);

/** Make the round's fights once the fighters are known and the night is near enough. */
function bookRound(w: World, rng: Rng, t: RtuBracket): void {
  const r = t.slots.length - 1;
  if (t.done || r > 2 || t.made[r]) return;
  const ev = roundEvent(w, t, r);
  if (!ev || ev.status === "done") return;
  if (r === 0) {
    if (ev.day - w.day > PROMOTIONS.rtu.lead) return;
    // An invitation still open: the answer first (it lapses after two weeks).
    if (t.slots[0].some((id) => id && w.career.fc[id]?.rtu?.id === t.id && w.career.fc[id].rtu!.yes === undefined) && ev.day - w.day > 21) return;
  }
  t.evs[r] = ev.id;
  const list = t.slots[r];
  for (let p = 0; p < list.length / 2; p++) {
    for (const i of [2 * p, 2 * p + 1]) {
      if (list[i] && fitFor(w, list[i], ev.day)) continue;
      // Out, or the place given up: the next alternate, and for the opening round the scouts find another prospect.
      if (list[i] || r === 0) list[i] = nextAlt(w, t, ev.day) ?? (r === 0 ? asiaProspect(w, rng, t.div).id : null);
    }
    const a = list[2 * p];
    const b = list[2 * p + 1];
    if (a && b) book(w, rng, t, ev, r, p, w.fighters[a], w.fighters[b]);
    else t.adv[`${r}:${p}`] = a ?? b ?? null;
  }
  t.made[r] = true;
  t.v++;
  orderCard(w, ev);
}

function book(w: World, rng: Rng, t: RtuBracket, ev: MMAEvent, r: number, p: number, a: Fighter, b: Fighter): void {
  const tag = { id: t.id, round: r, slot: p };
  const mine = a.ctrl ? a : b.ctrl ? b : null;
  if (mine) {
    const o = offerFight(w, rng, ev, mine, mine === a ? b : a, "regular");
    const bout = o ? Object.values(w.bouts).find((x) => x.pending === o.id) : undefined;
    if (o && bout) {
      bout.rtu = tag;
      acceptFight(w, o.id);
      return;
    }
  }
  makeBout(w, ev, a, b, "regular").rtu = tag;
}

/** Who goes through from a fight: the winner; after a draw or a no contest, the one who did more; called off, whoever can still fight. */
function through(w: World, b: Bout, ev: MMAEvent): string | null {
  if (b.status === "done" && b.res) {
    if (b.res.winner) return b.res.winner === "a" ? b.a : b.b;
    return (b.res.perf?.[0] ?? 0) >= (b.res.perf?.[1] ?? 0) ? b.a : b.b;
  }
  const can = [b.a, b.b].filter((id) => {
    const f = w.fighters[id];
    return !!f && f.status === "active" && availableFrom(f) <= ev.day + 14 && b.replaced !== id;
  });
  return can[0] ?? null;
}

/** After a night with bracket fights: who went through, and the rounds that are complete move on. */
export function rtuResults(w: World, rng: Rng, ev: MMAEvent): void {
  if (!w.rtu?.length) return;
  for (const id of ev.bouts) {
    const b = w.bouts[id];
    if (!b?.rtu) continue;
    const t = bracketOf(w, b.rtu.id);
    const key = `${b.rtu.round}:${b.rtu.slot}`;
    if (!t || t.done || key in t.adv) continue;
    t.adv[key] = through(w, b, ev);
    t.v++;
  }
  for (const t of w.rtu) settle(w, rng, t);
}

function settle(w: World, rng: Rng, t: RtuBracket): void {
  const r = t.slots.length - 1;
  if (t.done || r > 2 || !t.made[r]) return;
  const pairs = t.slots[r].length / 2;
  for (let p = 0; p < pairs; p++) if (!(`${r}:${p}` in t.adv)) return;
  const next = Array.from({ length: pairs }, (_, p) => t.adv[`${r}:${p}`] ?? null);
  t.slots.push(next);
  t.v++;
  if (r === 2) crown(w, rng, t, next[0]);
}

function crown(w: World, rng: Rng, t: RtuBracket, id: string | null): void {
  t.done = true;
  t.winner = id ?? undefined;
  t.v++;
  const f = id ? w.fighters[id] : null;
  if (!f) return;
  f.tags = [...new Set([...(f.tags ?? []), "rtu"])];
  addNews(w, {
    kind: "signing",
    promo: "ufc",
    fighters: [f.id],
    big: true,
    text: `${fullName(f)} wins Road to UFC Season ${rtuSeason(t.year)} at ${DIVISIONS[t.div].name.toLowerCase()}, and with it a UFC contract.`,
  });
  if (f.ctrl) {
    notify(w, { kind: "contract", fighter: f.id, from: "Road to UFC", subject: `Road to UFC champion: Season ${rtuSeason(t.year)}`, body: `${fullName(f)} won the ${DIVISIONS[t.div].name.toLowerCase()} bracket. The UFC's offer is on its way.` });
    makeContractOffer(w, rng, f, "ufc", { note: "Road to UFC winner: the contract that comes with the tournament." });
  } else signTo(w, f, "ufc", rng);
  touch(w);
}

// ---------- withdrawals ----------

/** A fighter pulled out of a bracket fight: the next alternate who can make it takes the place. */
export function rtuReplacement(w: World, b: Bout, outId: string): Fighter | null {
  const t = b.rtu ? bracketOf(w, b.rtu.id) : undefined;
  if (!t) return null;
  const id = nextAlt(w, t, b.day);
  if (!id) return null;
  const i = t.slots[b.rtu!.round].indexOf(outId);
  if (i >= 0) t.slots[b.rtu!.round][i] = id;
  t.v++;
  return w.fighters[id];
}

// ---------- every day ----------

export function rtuDaily(w: World, rng: Rng): void {
  // The season's first night about three months out: the field is named (a world that
  // began too close to it waits for the next season).
  for (const id of w.upcoming) {
    const e = w.events[id];
    if (!e?.rtu || e.rtu.round !== 0) continue;
    if (e.day - w.day > 92) break;
    if (!(w.rtu ?? []).some((t) => t.year === e.rtu!.year) && e.day - w.day >= 50) nameFields(w, rng, e.rtu.year, e.day);
    break;
  }
  if (!w.rtu?.length) return;
  // Invitations left two weeks without an answer are a no.
  for (const fid of w.career.fighters) {
    const inv = w.career.fc[fid]?.rtu;
    if (!inv || inv.yes !== undefined || w.day <= inv.day + 14) continue;
    const m = w.inbox.find((x) => x.ref === `rtu:${inv.id}:${fid}`);
    if (m) answerRtu(w, m, "rtu:no");
    else inv.yes = false;
    closeMessages(w, `rtu:${inv.id}:${fid}`, "No answer");
  }
  for (const t of w.rtu) bookRound(w, rng, t);
  // Seasons long done drop off the record.
  const y = ymd(w.day).y;
  if (w.rtu.some((t) => t.done && t.year < y - 2)) w.rtu = w.rtu.filter((t) => !t.done || t.year >= y - 2);
}
