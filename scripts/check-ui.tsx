// Render every page to HTML in Node, for a fighter career and a manager career,
// to catch crashes without a browser.
//   npm run check:ui
import { renderToString } from "react-dom/server";
import rosterJson from "../public/data/roster.json";
import { createWorld, starterClients, addControlled } from "../src/world/create";
import type { RosterFile } from "../src/world/real";
import { setWorld } from "../src/state/store";
import { advance, fightNight, openFightNight, quickSim, resolvePlayerBout } from "../src/sim/advance";
import { answer, autoAnswer } from "../src/career/actions";
import type { World } from "../src/model/types";
import { Home } from "../src/ui/pages/Home";
import { Inbox } from "../src/ui/pages/Inbox";
import { FighterPage } from "../src/ui/pages/FighterPage";
import { Training } from "../src/ui/pages/Training";
import { NextFight } from "../src/ui/pages/NextFight";
import { Contracts } from "../src/ui/pages/Contracts";
import { Finances } from "../src/ui/pages/Finances";
import { Events, EventPage } from "../src/ui/pages/Events";
import { Rankings } from "../src/ui/pages/Rankings";
import { News } from "../src/ui/pages/News";
import { Fighters } from "../src/ui/pages/Fighters";
import { Promotions, PromotionPage } from "../src/ui/pages/Promotions";
import { Settings } from "../src/ui/pages/Settings";
import { Agency, Scouting } from "../src/ui/pages/Agency";
import { FightNight } from "../src/ui/pages/FightNight";
import { Legacy } from "../src/ui/pages/Legacy";
import { Titles } from "../src/ui/pages/Titles";
import { BoutPreview } from "../src/ui/pages/Events";
import { FightReport, reportOf } from "../src/ui/report";
import { simulate } from "../src/engine/sim";
import { retirePlayer } from "../src/career/retire";
import { becomeManager } from "../src/career/retire";
import { hireManager, makeContractOffer } from "../src/career/offers";
import { withdraw } from "../src/world/matchmaking";
import { withRng } from "../src/world/core";
import { neighbourDivisions } from "../src/data/divisions";
import { adviseFight, ask, QUESTIONS } from "../src/career/advisor";
import { playerInjured } from "../src/career/injury";
import { INJURY } from "../src/data/injuries";

const g = globalThis as unknown as Record<string, unknown>;
g.window = { location: { hash: "" }, addEventListener() {}, removeEventListener() {} };
g.localStorage = { getItem: () => null, setItem() {} };
g.document = { documentElement: { dataset: {} }, querySelector: () => null, title: "" };

const roster = rosterJson as unknown as RosterFile;
let failures = 0;

function play(w: World, days: number) {
  let guard = 0;
  const end = w.day + days;
  while (w.day < end && guard++ < 1000) {
    const r = advance(w, 7);
    if (r.stop?.kind === "decision") autoAnswer(w);
    const ev = fightNight(w);
    if (ev) for (const b of openFightNight(w, ev)) resolvePlayerBout(w, b, quickSim(w, b));
  }
}

function check(name: string, el: JSX.Element) {
  try {
    const html = renderToString(el);
    if (html.length < 50) throw new Error("rendered almost nothing");
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}

function pages(w: World, label: string) {
  setWorld(w);
  const me = w.career.fighters[0];
  const ev = Object.values(w.events).find((e) => e.status === "done" && e.promo === "ufc") ?? Object.values(w.events)[0];
  const next = w.upcoming.map((id) => w.events[id]).find((e) => e.status === "booked") ?? w.events[w.upcoming[0]];
  console.log(`${label}: day ${w.day}, ${w.career.fighters.length} controlled`);
  check("Home", <Home />);
  check("Inbox", <Inbox />);
  check("Fighter", <FighterPage id={me} />);
  for (const t of ["fights", "stats", "techniques"]) check(`Fighter ${t}`, <FighterPage id={me} tab={t} />);
  check("Fighter (real)", <FighterPage id="ufc-ilia-topuria" />);
  check("Training", <Training />);
  check("Next fight", <NextFight />);
  check("Contracts", <Contracts />);
  check("Finances", <Finances />);
  check("Events", <Events />);
  check("Event done", <EventPage id={ev.id} />);
  check("Event next", <EventPage id={next.id} />);
  check("Rankings", <Rankings promo="ufc" div="LW" />);
  check("Rankings P4P", <Rankings promo="ufc" div="p4p" />);
  check("Rankings LFA", <Rankings promo="lfa" />);
  check("News", <News />);
  check("Fighters", <Fighters />);
  check("Promotions", <Promotions />);
  check("Promotion", <PromotionPage id="ufc" />);
  check("Settings", <Settings />);
  check("Fight night", <FightNight />);
  check("Legacy", <Legacy />);
  check("Title history", <Titles promo="ufc" div="LW" />);
  check("Title history BMF", <Titles promo="ufc" div="bmf" />);
  check("Title history PFL", <Titles promo="pfl" />);
  // Fight reports: a finished bout's round by round (packed numbers), and a full report with the log.
  const doneBout = Object.values(w.bouts).find((b) => b.status === "done" && b.res?.rx && w.fighters[b.a] && w.fighters[b.b]);
  if (doneBout) {
    check("Bout report (packed rounds)", <BoutPreview w={w} b={doneBout} />);
    const data = reportOf(w, doneBout);
    if (!data || data.rounds.length !== (doneBout.res?.rx?.length ?? 0)) {
      failures++;
      console.log("  FAIL bout report: the packed rounds did not unpack");
    }
  }
  const [x, y] = Object.values(w.fighters).filter((f) => f.status === "active" && f.promo === "ufc").slice(0, 2);
  if (x && y) {
    const out = simulate({ a: x, b: y, rounds: 3, roundSec: 300, div: x.div, seed: 99, log: true });
    const rounds = out.rounds ?? [];
    check("Fight report with key moments", <FightReport data={{ a: x, b: y, rounds, rcards: out.rcards, log: out.log, winner: out.winner, method: out.method, detail: out.detail, endRound: out.round, endTime: out.time }} />);
    if (!rounds.length || rounds[0][0].hd === undefined) {
      failures++;
      console.log("  FAIL fight report: no end-of-round condition recorded");
    }
    if ((out.log?.length ?? 0) < 40 * rounds.length) {
      failures++;
      console.log(`  FAIL play by play: only ${out.log?.length} lines in ${rounds.length} rounds`);
    }
  }
  if (w.career.mode === "manager") {
    check("Agency", <Agency />);
    check("Scouting", <Scouting />);
  }
}

const fw = createWorld(roster, { name: "UI", seed: 77, mode: "fighter", difficulty: "normal", created: { first: "Ui", surname: "Check", sex: "F", country: "BR", div: "WFLY", age: 22, height: 66, reach: 67, stance: "southpaw", art: "bjj", talent: "prospect", start: "amateur" } });
pages(fw, "Fighter career, day 0");
play(fw, 240);
pages(fw, "Fighter career, after 240 days");

const tw = createWorld(roster, { name: "UI", seed: 78, mode: "fighter", difficulty: "normal", takeover: "ufc-ilia-topuria" });
play(tw, 200);
pages(tw, "Real fighter career");

// Retire the real fighter, look at the after-career screen, then open an agency.
const top = tw.fighters[tw.career.fighters[0]];
if (top.booked) top.booked = null;
retirePlayer(tw, top);
pages(tw, "Retired fighter");
becomeManager(tw, "Topuria Management");
pages(tw, "Retired fighter turned manager");

// A short-notice call and a contract offer, with a manager to advise.
{
  const sw = createWorld(roster, { name: "UI", seed: 80, mode: "fighter", difficulty: "normal", takeover: "ufc-bilal-hasan" });
  const me = sw.fighters[sw.career.fighters[0]];
  hireManager(sw, me, 80);
  const divs = [me.div, neighbourDivisions(me.div).up].filter(Boolean);
  const open = () => sw.career.fightOffers.find((o) => o.status === "open" && o.shortNotice);
  // Let the cards fill up (turning down the regular offers so the phone can ring), then pull someone out.
  for (let week = 0; week < 20 && !open(); week++) {
    for (const m of sw.inbox) if (m.needs && !m.done) answer(sw, m.id, m.kind === "offer" ? "decline" : m.actions?.[0]?.id ?? "ok");
    advance(sw, 7);
    if (me.booked) continue;
    for (const id of sw.upcoming) {
      if (open()) break;
      const ev = sw.events[id];
      const days = ev.day - sw.day;
      if (ev.promo !== "ufc" || days < 2 || days > 21) continue;
      for (const bid of [...ev.bouts]) {
        const b = sw.bouts[bid];
        if (b.status !== "booked" || b.pending || !divs.includes(b.div) || b.a === me.id || b.b === me.id) continue;
        withRng(sw, (rng) => withdraw(sw, rng, b, b.a, "illness"));
        if (open()) break;
      }
    }
  }
  const offer = open();
  if (!offer) {
    failures++;
    console.log("  FAIL no short-notice call came in the check world");
  } else {
    const a = adviseFight(sw, me, offer);
    console.log(`Short-notice call: ${offer.notice} days, ${offer.limit ? `${offer.limit} lb catchweight` : offer.div}, advice "${a.label}": ${a.headline}`);
  }
  withRng(sw, (rng) => makeContractOffer(sw, rng, me, "ufc", { renewal: true }));
  setWorld(sw);
  const msg = sw.inbox.find((m) => m.kind === "offer" && m.needs);
  const cmsg = sw.inbox.find((m) => m.kind === "contract" && m.needs);
  console.log("Short notice and a contract offer, with a manager");
  check("Home (offer)", <Home />);
  if (msg) check("Inbox (short-notice call)", <Inbox id={msg.id} />);
  if (cmsg) check("Inbox (contract)", <Inbox id={cmsg.id} />);
  check("Contracts (offer, manager)", <Contracts />);
  for (const q of QUESTIONS) if (!ask(sw, me, q.id).a) { failures++; console.log(`  FAIL no answer to "${q.q}"`); }
}

// Injuries: a champion's torn ACL (keep the belt, an interim title is made), and a camp injury (postpone).
{
  const cw = createWorld(roster, { name: "UI", seed: 81, mode: "fighter", difficulty: "normal", takeover: "ufc-joshua-van" });
  const champ = cw.fighters[cw.career.fighters[0]];
  const div = champ.div;
  withRng(cw, (rng) => playerInjured(cw, rng, champ, INJURY.acl, "training"));
  const belt = cw.inbox.find((m) => m.kind === "injury" && m.needs && m.actions?.some((a) => a.id === "hold"));
  if (!belt) {
    failures++;
    console.log("  FAIL no keep-or-vacate decision for an injured champion");
  }
  setWorld(cw);
  console.log(`Injured champion: ${champ.injury?.name}, fight-ready in ${Math.round(((champ.injury?.until ?? 0) - cw.day) / 30.4)} months`);
  check("Home (injured champion)", <Home />);
  check("Training (injured)", <Training />);
  if (belt) {
    check("Inbox (belt decision)", <Inbox id={belt.id} />);
    answer(cw, belt.id, "hold");
    if (!cw.career.fc[champ.id].hold) { failures++; console.log("  FAIL keeping the belt did not register"); }
  }
  play(cw, 200);
  const interim = Object.values(cw.bouts).some((b) => b.promo === "ufc" && b.div === div && b.kind === "interim");
  console.log(`  interim ${div} title booked while the champion is out: ${interim ? "yes" : "no"}`);
  if (!interim) { failures++; console.log("  FAIL no interim title while the champion holds the belt injured"); }
  if (cw.promos.ufc.champs[div] !== champ.id && cw.promos.ufc.champs[div] !== null && !cw.promos.ufc.interim[div]) console.log("  (the belt changed hands)");
}
{
  const iw = createWorld(roster, { name: "UI", seed: 82, mode: "fighter", difficulty: "normal", takeover: "ufc-bilal-hasan" });
  const me = iw.fighters[iw.career.fighters[0]];
  for (let k = 0; k < 30 && !(me.booked && !iw.bouts[me.booked].pending); k++) {
    advance(iw, 7);
    for (const m of iw.inbox) if (m.needs && !m.done) answer(iw, m.id, m.kind === "offer" ? "accept" : m.actions?.[0]?.id ?? "ok");
  }
  const b = me.booked ? iw.bouts[me.booked] : undefined;
  if (!b) {
    failures++;
    console.log("  FAIL the camp-injury fighter never got booked");
  } else {
    // Close to fight night, so it can't heal in time.
    for (let k = 0; k < 80 && b.day - iw.day > 24 && b.status === "booked"; k++) {
      advance(iw, 1);
      for (const m of iw.inbox) if (m.needs && !m.done) answer(iw, m.id, m.actions?.[0]?.id ?? "ok");
    }
    const before = b.ev;
    withRng(iw, (rng) => playerInjured(iw, rng, me, INJURY.hand, "training"));
    const msg = iw.inbox.find((m) => m.kind === "injury" && m.needs && m.ref === b.id);
    setWorld(iw);
    if (msg) {
      check("Inbox (hurt in camp)", <Inbox id={msg.id} />);
      const acts = msg.actions?.map((a) => a.id).join("/");
      const t = msg.actions?.some((a) => a.id === "postpone") ? answer(iw, msg.id, "postpone") : answer(iw, msg.id, "pull-out");
      console.log(`Hurt in camp (${me.injury?.name}, ${Math.round((me.injury!.until - b.day) / 7)} weeks past fight night, options ${acts}): ${t}${b.ev !== before ? " (moved)" : ""}`);
    } else console.log(`Hurt in camp: ${me.injury?.name}, no choice needed (${me.booked === b.id ? "heals in time" : "out of the fight"})`);
    check("Home (hurt in camp)", <Home />);
    check("Next fight (after the injury)", <NextFight />);
  }
}

// A champion out too long: an interim belt, then stripped, the interim champion promoted.
{
  const xw = createWorld(roster, { name: "UI", seed: 83, mode: "fighter", difficulty: "normal", takeover: "ufc-joshua-van" });
  const champ = xw.fighters[xw.career.fighters[0]];
  const div = champ.div;
  withRng(xw, (rng) => playerInjured(xw, rng, champ, INJURY["leg-break"], "training"));
  const belt = xw.inbox.find((m) => m.kind === "injury" && m.needs && m.actions?.some((a) => a.id === "hold"));
  if (belt) answer(xw, belt.id, "hold");
  play(xw, 460);
  const ps = xw.promos.ufc;
  const stripped = ps.reigns.some((r) => r.fighter === champ.id && r.ended === "stripped");
  const promoted = ps.reigns.some((r) => r.div === div && r.how === "promoted");
  const warned = xw.inbox.some((m) => m.subject === "The belt is at risk");
  console.log(`Champion out ${Math.round(((champ.injury?.until ?? xw.day) - 0) / 30.4)} months: warned ${warned}, stripped ${stripped}, interim promoted ${promoted}, champion now ${ps.champs[div] ? xw.fighters[ps.champs[div]!].surname : "vacant"}`);
  if (!stripped) { failures++; console.log("  FAIL a champion out well over a year was not stripped"); }
  setWorld(xw);
  check("Title history (stripped)", <Titles promo="ufc" div={div} />);
  check("Fighter (stripped champion)", <FighterPage id={champ.id} tab="fights" />);
}

const mw = createWorld(roster, { name: "UI", seed: 79, mode: "manager", difficulty: "normal", agency: "Check Management" });
for (const f of starterClients(mw, 3)) addControlled(mw, f);
pages(mw, "Manager, day 0");
play(mw, 200);
pages(mw, "Manager, after 200 days");

if (failures) {
  console.log(`${failures} page(s) failed`);
  process.exit(1);
}
console.log("Every page renders.");
