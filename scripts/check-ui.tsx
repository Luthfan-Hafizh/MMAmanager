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
import { CreateForm } from "../src/ui/pages/NewGame";
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
import { FightSim, simulate } from "../src/engine/sim";
import { retirePlayer } from "../src/career/retire";
import { becomeManager } from "../src/career/retire";
import { declineFight, hireManager, makeContractOffer } from "../src/career/offers";
import { cancelBout, offerFight, withdraw } from "../src/world/matchmaking";
import { withRng } from "../src/world/core";
import { neighbourDivisions } from "../src/data/divisions";
import { adviseFight, ask, QUESTIONS } from "../src/career/advisor";
import { playerInjured } from "../src/career/injury";
import { INJURY, makeInjury } from "../src/data/injuries";
import { Media, PressRoom } from "../src/ui/pages/Media";
import { callOut, calloutChoices, talkableFights, talkFight } from "../src/career/social";
import { heatOf } from "../src/career/rivals";
import { answerQuestion, finishSession, preQuestions, startSession } from "../src/career/media";
import { rankThen } from "../src/ui/pages/Events";
import { PROMOTIONS } from "../src/data/promotions";
import type { Bout } from "../src/model/types";
import { scaleDay } from "../src/career/weighin";
import { forceLife, LIFE_IDS } from "../src/career/life";
import { boutLimit } from "../src/career/shortnotice";
import { makeBout } from "../src/world/matchmaking";
import { bmfPairing } from "../src/world/belts";
import { Rng } from "../src/core/rng";
import { applyResult, signTo } from "../src/world/results";
import { neckWork, templatePlan, trainingWeek } from "../src/career/training";
import { justDethroned, updateRankings } from "../src/world/rankings";
import { rankOf } from "../src/world/core";
import { repair } from "../src/world/create";
import { declineChoices, rapport, rapportLabel } from "../src/career/promoter";
import { DeclinePicker } from "../src/ui/decline";

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
  check("Media", <Media />);
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
    if ((out.log?.length ?? 0) < 25 * rounds.length) {
      failures++;
      console.log(`  FAIL play by play: only ${out.log?.length} lines in ${rounds.length} rounds`);
    }
    // Live corner calls: the corner calls during the rounds, your answers are logged and reported.
    const live = new FightSim({ a: x, b: y, rounds: 3, roundSec: 300, div: x.div, seed: 7, log: true, aiCorner: [false, true] });
    let calls = 0;
    let follow = 0;
    let g = 0;
    while (!live.over && g++ < 20000) {
      if (live.between) {
        live.nextRound();
        continue;
      }
      live.step();
      const adv = live.liveAdvice(0, 0.7);
      if (adv) {
        calls++;
        live.act(0, adv.options[0].shout, { key: adv.key, text: adv.text, label: adv.options[0].label, by: "you" });
      }
      if (live.cornerFeedback(0)) follow++;
    }
    const lo = live.outcome();
    const mine = lo.log?.filter((l) => l.kind === "call").length ?? 0;
    // A fight stopped early has time for fewer calls: about one every three minutes fought.
    const secs = (lo.round - 1) * 300 + lo.time;
    const want = secs >= 540 ? 3 : secs >= 240 ? 2 : 1;
    if (calls < want || !mine || live.calls.filter((c) => c.i === 0).length !== calls || !live.calls.some((c) => c.i === 1)) {
      failures++;
      console.log(`  FAIL live calls: ${calls} calls, ${mine} logged, ${live.calls.length} recorded, ${follow} follow-ups (${x.surname} ${x.div} vs ${y.surname} ${y.div}: ${lo.method} R${lo.round} ${lo.time}s)`);
    }
    check("Fight report with your calls", <FightReport data={{ a: x, b: y, rounds: lo.rounds ?? [], rcards: lo.rcards, log: lo.log, winner: lo.winner, method: lo.method, detail: lo.detail, endRound: lo.round, endTime: lo.time }} />);
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

// The spotlight: call-outs, fight talk, a press conference, both kinds of weight miss, every life event, the BMF call.
{
  const sw2 = createWorld(roster, { name: "UI", seed: 84, mode: "fighter", difficulty: "normal", takeover: "ufc-arman-tsarukyan" });
  const me = sw2.fighters[sw2.career.fighters[0]];
  const fail = (what: string) => { failures++; console.log(`  FAIL ${what}`); };
  setWorld(sw2);
  // Calling someone out builds heat and leaves a quote.
  const t = calloutChoices(sw2, me).find((x) => x.id !== sw2.promos.ufc.champs[me.div]) ?? calloutChoices(sw2, me)[0];
  const r = withRng(sw2, (rng) => callOut(sw2, rng, me, t, "trash"));
  if (!r.quote || heatOf(sw2, me.id, t.id) <= 0) fail("a call-out left no heat");
  const again = withRng(sw2, (rng) => callOut(sw2, rng, me, t, "callout"));
  if (again.quote) fail("the call-out cooldown did not hold");
  // A fight booked against someone else, for the press and the scale.
  const ev = sw2.upcoming.map((id) => sw2.events[id]).find((e) => e.promo === "ufc" && e.day - sw2.day > 20)!;
  const opp = calloutChoices(sw2, me).find((x) => !x.booked && x.id !== t.id && x.id !== sw2.promos.ufc.champs[me.div])!;
  const b = makeBout(sw2, ev, me, opp, "regular");
  const s = withRng(sw2, (rng) => startSession(sw2, rng, me, b, "presser"));
  if (s.questions.length < 3) fail(`a press conference with only ${s.questions.length} questions`);
  const pop0 = me.pop;
  s.questions.forEach((q, i) => answerQuestion(sw2, s, i, q.answers.findIndex((a) => a.tone === "confident") >= 0 ? q.answers.findIndex((a) => a.tone === "confident") : 0));
  const sum = finishSession(sw2, s);
  if (!s.done || !sum || me.pop <= pop0) fail("the press conference did not settle");
  console.log(`Press conference: ${s.questions.length} questions ("${s.questions[0].q}"). ${sum}`);
  check("Press room", <PressRoom sid={s.id} />);
  // The scale: the player misses (the extra hour), then the opponent misses (take the fine).
  const lim = boutLimit(b);
  withRng(sw2, (rng) => scaleDay(sw2, rng, b, { [b.a === me.id ? "a" : "b"]: { weight: lim + 2.4, made: false, drain: 0.2, text: "" } }));
  const miss = sw2.inbox.find((m) => m.ref === b.id && m.needs && m.data?.step === "miss");
  if (!miss) fail("no decision when the player missed weight");
  else {
    check("Inbox (missed weight)", <Inbox id={miss.id} />);
    console.log(`Missed weight, the extra hour: ${answer(sw2, miss.id, "miss:hour")}`);
  }
  const face = sw2.inbox.find((m) => m.ref === b.id && m.needs && m.data?.step === "faceoff");
  if (b.status === "booked" && !face) fail("no face-off after the scale");
  if (face) console.log(`Face-off: ${answer(sw2, face.id, "faceoff:talk")}`);
  if (b.status === "booked") {
    b.weighIn = undefined;
    const os = b.a === me.id ? "b" : "a";
    withRng(sw2, (rng) => scaleDay(sw2, rng, b, { [os === "a" ? "b" : "a"]: { weight: lim, made: true, drain: 0.1, text: "" } }, { [os]: { weight: lim + 3.2, miss: true } }));
    const om = sw2.inbox.find((m) => m.ref === b.id && m.needs && m.data?.step === "oppmiss");
    if (!om) fail("no decision when the opponent missed weight");
    else {
      check("Inbox (opponent missed weight)", <Inbox id={om.id} />);
      console.log(`Opponent missed weight, hold out for more: ${answer(sw2, om.id, "oppmiss:more")}`);
    }
  }
  // Every unexpected event that can happen to this fighter now, answered.
  let made = 0;
  for (const id of LIFE_IDS) {
    const m = forceLife(sw2, me, id);
    if (!m) continue;
    made++;
    if (made === 1) check("Inbox (life event)", <Inbox id={m.id} />);
    const text = answer(sw2, m.id, m.actions![m.actions!.length - 1].id);
    if (!text) fail(`life event ${id} gave no answer`);
  }
  console.log(`Life events: ${made} of ${LIFE_IDS.length} possible for ${me.surname} right now, all answered`);
  // Fight talk about the division.
  play(sw2, 35);
  const talk = talkableFights(sw2, me, 3);
  if (talk[0]) console.log(`Fight talk: ${withRng(sw2, (rng) => talkFight(sw2, rng, me, talk[0], "doubt"))}`);
  // The BMF: a popular lightweight calls for it and is first in line.
  me.pop = Math.max(me.pop, 60);
  me.booked = null;
  const holder = sw2.promos.ufc.bmf?.holder ? sw2.fighters[sw2.promos.ufc.bmf.holder!] : null;
  if (holder) {
    const fc = sw2.career.fc[me.id];
    fc.lastSocial = undefined;
    withRng(sw2, (rng) => callOut(sw2, rng, me, holder, "callout", { asBmf: true }));
    if ((fc.bmfCall ?? 0) < sw2.day) fail("the BMF call did not register");
    const nev = sw2.upcoming.map((id) => sw2.events[id]).find((e) => e.promo === "ufc" && e.kind === "numbered" && (sw2.promos.ufc.bmf!.last ?? 0) + 240 <= e.day);
    let picked = false;
    for (let k = 0; k < 12 && nev && !picked; k++) {
      const pair = bmfPairing(sw2, new Rng(900 + k), nev, () => true);
      picked = !!pair && pair.some((x) => x.id === me.id);
    }
    console.log(`BMF: ${me.surname} called out ${holder.surname}; first in line for the next BMF fight: ${picked}`);
    if (nev && !picked) fail("a player who called for the BMF title was not picked");
  }
  setWorld(sw2);
  check("Media (rivals, moments, BMF)", <Media />);
  check("Fighter (call-out panel)", <FighterPage id={t.id} />);
  check("Contracts (the team)", <Contracts />);
  check("Home (spotlight)", <Home />);
}

// Turning pro: a debut signing clears the amateur flag, and loading repairs a fighter left as an amateur.
{
  const aw = createWorld(roster, { name: "UI", seed: 85, mode: "fighter", difficulty: "normal", created: { first: "Pro", surname: "Debut", sex: "M", country: "RU", div: "LW", age: 18, height: 70, reach: 71, stance: "orthodox", art: "wrestling", talent: "prospect", start: "amateur" } });
  const me = aw.fighters[aw.career.fighters[0]];
  me.am = { ...me.am, w: 3, l: 4 };
  withRng(aw, (rng) => signTo(aw, me, "cffc", rng));
  if (me.amateur) { failures++; console.log("  FAIL a pro debut left the amateur flag on"); }
  me.amateur = true;
  repair(aw);
  if (me.amateur) { failures++; console.log("  FAIL loading did not repair a pro left as an amateur"); }
  setWorld(aw);
  // React marks the joins between text pieces with empty comments.
  const html = renderToString(<Home />).replace(/<!-- -->/g, "");
  if (!html.includes("Pro record") || !html.includes("Amateur 3-4")) { failures++; console.log("  FAIL Home does not show the pro record with the amateur record under it"); }
  else console.log("Turning pro: the flag clears on a debut and on load; Home shows the pro record and Amateur 3-4");
}

// Neck work: the strength sessions build the chin, less after knockouts, and a knockout loss says what it cost.
{
  const fail = (what: string) => { failures++; console.log(`  FAIL ${what}`); };
  const nw = createWorld(roster, { name: "UI", seed: 86, mode: "fighter", difficulty: "normal", created: { first: "Neck", surname: "Work", sex: "M", country: "BR", div: "LW", age: 22, height: 70, reach: 71, stance: "orthodox", art: "boxing", talent: "prospect", start: "amateur" } });
  const me = nw.fighters[nw.career.fighters[0]];
  const chinOf = (tpl: string, f = me) => trainingWeek(nw, structuredClone(f), templatePlan(tpl), new Rng(1), false).growth.chin ?? 0;
  const sc = chinOf("conditioning");
  const bal = chinOf("balanced");
  const none = chinOf("taper");
  const ko = structuredClone(me);
  ko.rec = { ...ko.rec, l: 3, koL: 3 };
  const cracked = chinOf("conditioning", ko);
  if (!(sc > bal && bal > 0 && none === 0)) fail(`strength sessions should build the chin, more with more of them (S&C ${sc}, balanced ${bal}, taper ${none})`);
  if (!(cracked < sc * 0.75)) fail(`three knockout losses should leave less for neck work (${cracked} against ${sc})`);
  const y = structuredClone(me);
  const c0 = y.attrs.chin;
  for (let i = 0; i < 52; i++) trainingWeek(nw, y, templatePlan("conditioning"), new Rng(10 + i), true);
  const yb = structuredClone(me);
  for (let i = 0; i < 52; i++) trainingWeek(nw, yb, templatePlan("balanced"), new Rng(10 + i), true);
  const year = y.attrs.chin - c0;
  const yearBal = yb.attrs.chin - c0;
  if (!(year > 0.5 && year < 2.5 && yearBal > 0.1 && yearBal < year)) fail(`a year of training should add a sensible amount of chin (S&C ${year.toFixed(2)}, balanced ${yearBal.toFixed(2)})`);
  nw.career.fc[me.id].plan = templatePlan("conditioning");
  setWorld(nw);
  const page = renderToString(<Training />).replace(/<!-- -->/g, "");
  if (!page.includes("Chin (neck work)") || !page.includes("· neck work")) fail("the training page does not show the neck work");
  nw.fighters[me.id] = ko;
  const page2 = renderToString(<Training />).replace(/<!-- -->/g, "");
  if (!page2.includes("After 3 knockout losses, neck work does")) fail("the training page does not say what the knockouts cost the neck work");
  nw.fighters[me.id] = me;
  console.log(`Neck work: chin +${year.toFixed(2)} a year on the S&C week, +${yearBal.toFixed(2)} on a balanced week; three knockout losses leave ${Math.round(neckWork(ko) * 100)}%`);

  // A knockout loss: the result says what it cost the chin.
  const kw = createWorld(roster, { name: "UI", seed: 87, mode: "fighter", difficulty: "normal", takeover: "ufc-joshua-van" });
  const jv = kw.fighters[kw.career.fighters[0]];
  const ev = kw.upcoming.map((id) => kw.events[id]).find((e) => e.promo === "ufc" && e.day - kw.day > 20)!;
  const opp = Object.values(kw.fighters).find((x) => x.promo === "ufc" && x.div === jv.div && x.id !== jv.id && !x.booked && x.status === "active")!;
  const b = makeBout(kw, ev, jv, opp, "regular");
  const o = quickSim(kw, b);
  o.winner = b.a === jv.id ? "b" : "a";
  o.method = "KO";
  o.detail = "punches";
  const chin0 = jv.attrs.chin;
  withRng(kw, (rng) => applyResult(kw, rng, b, o));
  const msg = kw.inbox.find((m) => m.ref === b.id && m.kind === "result");
  if (!(jv.attrs.chin < chin0)) fail("a knockout loss did not cost any chin");
  else if (!msg?.body.includes("took something off the chin") || !msg.facts?.some((x) => x.k === "Chin")) fail("the result of a knockout loss does not say what it cost the chin");
  else console.log(`Knockout loss: ${msg.body.slice(msg.body.indexOf("The knockout"))}`);
}

// The interim belt: every fight is for it (the unification with the champion back, a
// defence while the champion is out), losing one loses it, and two refusals cost it.
{
  const fail = (what: string) => { failures++; console.log(`  FAIL ${what}`); };
  const setup = (seed: number) => {
    const iw = createWorld(roster, { name: "UI", seed, mode: "fighter", difficulty: "normal", takeover: "ufc-arman-tsarukyan" });
    const me = iw.fighters[iw.career.fighters[0]];
    const ps = iw.promos.ufc;
    const champ = iw.fighters[ps.champs[me.div]!];
    ps.interim[me.div] = me.id;
    ps.reigns.push({ fighter: me.id, promo: "ufc", div: me.div, won: iw.day - 180, defenses: 0, how: "interim", interim: true });
    for (const f of [me, champ]) {
      if (f.booked && iw.bouts[f.booked]) cancelBout(iw, iw.bouts[f.booked], "test");
      f.lastFight = iw.day - 180;
      f.injury = null;
      f.susp = 0;
    }
    const ev = iw.upcoming.map((id) => iw.events[id]).find((e) => e.promo === "ufc" && e.day - iw.day > 40)!;
    return { iw, me, ps, champ, ev };
  };
  {
    const { iw, me, champ, ev } = setup(88);
    const o = withRng(iw, (rng) => offerFight(iw, rng, ev, me));
    const b = o ? Object.values(iw.bouts).find((x) => x.pending === o.id) : undefined;
    if (!o || o.kind !== "title" || o.opp !== champ.id || b?.stake !== "unify") fail(`with the champion fit, the interim champion should be offered the unification (got ${o?.kind ?? "nothing"}, ${b?.stake})`);
    else console.log(`Interim champion, the champion fit: offered the unification with ${champ.surname} over ${b.rounds} rounds`);
  }
  {
    const { iw, me, champ, ev } = setup(89);
    champ.injury = withRng(iw, (rng) => makeInjury(rng, INJURY.acl, iw.day, "training"));
    champ.injury.until = iw.day + 365;
    const o = withRng(iw, (rng) => offerFight(iw, rng, ev, me));
    const b = o ? Object.values(iw.bouts).find((x) => x.pending === o.id) : undefined;
    if (!o || !b || o.kind !== "interim" || b.stake !== "interim-defence") fail(`with the champion out a year, the interim champion should defend the interim belt (got ${o?.kind ?? "nothing"}, ${b?.stake})`);
    else {
      const opp = iw.fighters[o.opp];
      b.pending = undefined;
      const out = quickSim(iw, b);
      out.winner = b.a === me.id ? "b" : "a";
      out.method = "DEC";
      out.detail = "unanimous decision";
      withRng(iw, (rng) => applyResult(iw, rng, b, out));
      if (iw.promos.ufc.interim[me.div] !== opp.id || b.res?.belt?.[b.a === me.id ? "a" : "b"] !== "Lost the interim title") fail("losing an interim defence did not pass the interim belt to the winner");
      else console.log(`Interim champion, the champion out a year: defends against ${opp.surname}, loses, and ${opp.surname} is the interim champion`);
    }
  }
  {
    const { iw, me, champ, ev } = setup(90);
    champ.injury = withRng(iw, (rng) => makeInjury(rng, INJURY.acl, iw.day, "training"));
    champ.injury.until = ev.day + 40;
    const o = withRng(iw, (rng) => offerFight(iw, rng, ev, me));
    if (o) fail(`with the champion nearly back, the interim champion was offered a ${o.kind} fight`);
    setWorld(iw);
    const home = renderToString(<Home />).replace(/<!-- -->/g, "");
    if (!home.includes("You hold the interim belt")) fail("Home does not tell a waiting interim champion why there is no fight");
    const other = Object.values(iw.fighters).find((x) => x.promo === "ufc" && x.div === me.div && x.id !== me.id && x.id !== champ.id && !x.booked && x.status === "active")!;
    const b = makeBout(iw, ev, me, other, "regular");
    if (b.kind !== "interim" || b.rounds !== 5) fail(`an ordinary fight made for the interim champion stayed ${b.kind} over ${b.rounds} rounds`);
    b.kind = "regular";
    b.stake = undefined;
    b.rounds = 3;
    repair(iw);
    const loaded = iw.bouts[b.id];
    if (loaded.kind !== "interim" || loaded.stake !== "interim-defence" || loaded.rounds !== 5) fail(`loading did not put the interim belt on a booked fight (${loaded.kind}, ${loaded.stake}, ${loaded.rounds} rounds)`);
    else console.log("Interim champion, the champion nearly back: no ordinary fight, Home says why; a fight made any other way, or booked in an old save, is an interim defence");
  }
  {
    const { iw, me, ps, ev } = setup(91);
    for (let i = 0; i < 2; i++) {
      const o = withRng(iw, (rng) => offerFight(iw, rng, ev, me));
      if (o) declineFight(iw, o.id);
    }
    const r = ps.reigns.find((x) => x.fighter === me.id && x.interim);
    if (ps.interim[me.div] === me.id || r?.ended !== "stripped") fail("turning down two fights for the belts did not cost the interim title");
    else console.log("Interim champion: two refusals and the interim title is taken");
  }
}

// A champion who loses the belt goes straight to number one; an interim champion heads the list without a number.
{
  const fail = (what: string) => { failures++; console.log(`  FAIL ${what}`); };
  const rw = createWorld(roster, { name: "UI", seed: 92, mode: "fighter", difficulty: "normal", takeover: "ufc-arman-tsarukyan" });
  const ps = rw.promos.ufc;
  const d = "WW" as const;
  const champ = rw.fighters[ps.champs[d]!];
  const low = rw.fighters[ps.ranks[d]![9]];
  for (const f of [champ, low]) if (f.booked && rw.bouts[f.booked]) cancelBout(rw, rw.bouts[f.booked], "test");
  const ev = rw.upcoming.map((id) => rw.events[id]).find((e) => e.promo === "ufc" && e.day - rw.day > 20)!;
  const b = makeBout(rw, ev, champ, low, "title");
  const out = quickSim(rw, b);
  out.winner = b.a === low.id ? "a" : "b";
  out.method = "KO";
  out.detail = "punch";
  withRng(rw, (rng) => applyResult(rw, rng, b, out));
  updateRankings(rw, "ufc", [d]);
  if (ps.champs[d] !== low.id || rankOf(rw, champ) !== 1) fail(`the champion who lost the belt is ranked ${rankOf(rw, champ)}, not number one`);
  else console.log(`Lost the belt: ${champ.surname} is number one behind the new champion ${low.surname}`);
  // An interim champion above the list doesn't take the number one.
  const ic = rw.fighters[ps.ranks[d]![3]];
  ps.interim[d] = ic.id;
  updateRankings(rw, "ufc", [d]);
  if (ps.ranks[d]![0] !== ic.id || rankOf(rw, champ) !== 1) fail(`with an interim champion, the former champion is ranked ${rankOf(rw, champ)}`);
  setWorld(rw);
  const page = renderToString(<Rankings />).replace(/<!-- -->/g, "");
  if (!page.includes(">IC<")) fail("the rankings page does not mark the interim champion");
  // Fighting again ends it: the rankings take over.
  champ.lastFight = (champ.lastFight ?? rw.day) + 60;
  if (justDethroned(rw, "ufc", d).has(champ.id)) fail("the former champion kept number one after fighting again");
  else console.log("With an interim champion heading the list, the former champion is still number one; a fight later the rankings take over");
}

// A home town picked from the country's cities or typed in, and shown where the fighter is from.
{
  const fail = (what: string) => { failures++; console.log(`  FAIL ${what}`); };
  const base = { first: "Home", surname: "Town", sex: "M" as const, country: "BR", div: "BW" as const, age: 21, height: 67, reach: 69, stance: "orthodox" as const, art: "bjj" as const, talent: "prospect" as const, start: "debut" as const };
  const form = renderToString(<CreateForm cf={base} setCf={() => {}} onBack={() => {}} onNext={() => {}} />);
  if (!form.includes("Home town") || !form.includes("Curitiba") || !form.includes("Somewhere else")) fail("the creation form does not offer the country's towns and somewhere else");
  // The picks are small tiles and Next sits in the bar at the foot of the screen, so
  // nobody scrolls to the bottom of a long column of cards to go on.
  const flat = form.replace(/<!-- -->/g, "");
  const bar = flat.slice(flat.indexOf('class="create-bar"'));
  if (!flat.includes('class="create-bar"') || !bar.includes(">Next</button>")) fail("the creation form has no bar with Next");
  else if (flat.includes('class="choice')) fail("the creation form lays its picks out as big cards again");
  else if (!bar.includes("<b>Home Town</b>")) fail("the creation form's bar does not name the fighter");
  else console.log(`Creating a fighter: ${(flat.match(/class="tile[ "]/g) ?? []).length} pick tiles; Next in the bar at the foot of the screen, under "Home Town"`);
  const typed = renderToString(<CreateForm cf={{ ...base, hometown: "Itaquaquecetuba" }} setCf={() => {}} onBack={() => {}} onNext={() => {}} />);
  if (!typed.includes('value="Itaquaquecetuba"')) fail("a typed home town does not show in its own box");
  const hw = createWorld(roster, { name: "UI", seed: 93, mode: "fighter", difficulty: "normal", created: { ...base, hometown: "Itaquaquecetuba" } });
  const me = hw.fighters[hw.career.fighters[0]];
  setWorld(hw);
  const page = renderToString(<FighterPage id={me.id} />).replace(/<!-- -->/g, "");
  const home = renderToString(<Home />).replace(/<!-- -->/g, "");
  if (me.hometown !== "Itaquaquecetuba" || !page.includes("Itaquaquecetuba, Brazil") || !home.includes("Itaquaquecetuba, Brazil")) fail("the chosen home town is not the fighter's, or does not show on the fighter page and Home");
  else console.log("Home town: the form offers Brazil's cities or a typed town; Itaquaquecetuba, Brazil shows on the fighter page and Home");
}

// Beating the champion: an old save's fight with no belt on it gives the winner the
// title shot, and a top contender who calls out the champion gets a title fight.
{
  const fail = (what: string) => { failures++; console.log(`  FAIL ${what}`); };
  const setupChamp = (seed: number) => {
    const cw2 = createWorld(roster, { name: "UI", seed, mode: "fighter", difficulty: "normal", takeover: "ufc-arman-tsarukyan" });
    const me = cw2.fighters[cw2.career.fighters[0]];
    const ps = cw2.promos.ufc;
    const champ = cw2.fighters[ps.champs[me.div]!];
    for (const f of [me, champ]) {
      if (f.booked && cw2.bouts[f.booked]) cancelBout(cw2, cw2.bouts[f.booked], "test");
      f.lastFight = cw2.day - 200;
      f.injury = null;
      f.susp = 0;
    }
    ps.contender[me.div] = null;
    const ev = cw2.upcoming.map((id) => cw2.events[id]).find((e) => e.promo === "ufc" && e.day - cw2.day > 20)!;
    return { cw2, me, ps, champ, ev };
  };
  {
    const { cw2, me, ps, champ, ev } = setupChamp(94);
    const b = makeBout(cw2, ev, me, champ, "regular");
    // As the old version booked it: no belt on the fight.
    b.kind = "regular";
    b.stake = undefined;
    b.rounds = 3;
    const out = quickSim(cw2, b);
    out.winner = b.a === me.id ? "a" : "b";
    out.method = "SUB";
    out.detail = "neck crank";
    withRng(cw2, (rng) => applyResult(cw2, rng, b, out));
    repair(cw2);
    const msg = cw2.inbox.find((m) => m.subject === "First in line for the title" && m.fighter === me.id);
    if (ps.contender[me.div] !== me.id || !msg) fail("beating the champion in a fight with no belt on it did not make the winner first in line");
    else console.log(`Old save, beat the champion ${champ.surname} with no belt on it: first in line for the title, and told so`);
  }
  {
    const { cw2, me, champ, ev } = setupChamp(95);
    me.streak = Math.max(me.streak, 2);
    const rf = rankOf(cw2, me);
    cw2.career.fc[me.id].callout = { target: champ.id, until: cw2.day + 30, ok: false };
    const o = withRng(cw2, (rng) => offerFight(cw2, rng, ev, me));
    if (rf === null || rf < 1 || rf > 5) console.log(`  (skipped the call-out check: ${me.surname} is ranked ${rf})`);
    else if (!o || o.kind !== "title" || o.opp !== champ.id) fail(`a #${rf} contender who called out the champion was offered ${o ? `a ${o.kind} fight` : "nothing"}`);
    else console.log(`#${rf} ${me.surname} called out the champion ${champ.surname}: offered the title fight`);
  }
}

// The PFL's pound for pound and full rankings from the start, past fights' ranks, and the home town at the press conference.
{
  const fail = (what: string) => { failures++; console.log(`  FAIL ${what}`); };
  const pw = createWorld(roster, { name: "UI", seed: 96, mode: "fighter", difficulty: "normal", takeover: "ufc-arman-tsarukyan" });
  setWorld(pw);
  const pfl = renderToString(<Rankings promo="pfl" />).replace(/<!-- -->/g, "");
  if ((pw.promos.pfl.p4p?.length ?? 0) < 10 || !pfl.includes("Pound for pound") || !pfl.includes("in the PFL")) fail("the PFL has no pound-for-pound list");
  const unranked = PROMOTIONS.pfl.divisions.filter((d) => !pw.promos.pfl.ranks[d]?.length && Object.values(pw.fighters).some((f) => f.promo === "pfl" && f.div === d));
  if (unranked.length) fail(`PFL divisions with fighters and no rankings: ${unranked.join(", ")}`);
  if (pfl.includes(">NEW<")) fail("the first rankings mark everybody as new");
  const past = { rankA: 0, rankB: 3, kind: "title", res: { belt: { b: "Won the title" } } } as unknown as Bout;
  const unify = { rankA: 0, rankB: 1, kind: "title", stake: "unify", res: { belt: {} } } as unknown as Bout;
  if (rankThen(past, "a") !== "C" || rankThen(past, "b") !== "#3" || rankThen(unify, "b") !== "IC") fail("a finished fight does not show the ranks the fighters took into it");
  const me = pw.fighters[pw.career.fighters[0]];
  const ev = pw.upcoming.map((id) => pw.events[id]).find((e) => e.promo === "ufc" && e.day - pw.day > 20)!;
  const opp = Object.values(pw.fighters).find((x) => x.promo === "ufc" && x.div === me.div && x.id !== me.id && !x.booked && x.status === "active" && x.country !== me.country)!;
  if (me.booked && pw.bouts[me.booked]) cancelBout(pw, pw.bouts[me.booked], "test");
  const bt = makeBout(pw, ev, me, opp, "regular");
  ev.city = me.hometown;
  ev.country = me.country;
  const qs = withRng(pw, (rng) => preQuestions(pw, rng, me, bt, opp, "respect")).filter(Boolean);
  if (!qs.some((q) => q!.q.includes("is your home town"))) fail("no home-town question for a fight in the fighter's home town");
  else console.log(`PFL pound for pound (#1 ${pw.fighters[pw.promos.pfl.p4p![0]].surname}), every PFL division ranked, no "new" on the first rankings; finished fights show the ranks going in; ${me.hometown} gets its own press question`);
}

// Turning a fight down: the matchmaker weighs the reason, the relationship pays for a
// weak one, ducking a name gets out, a valuable fighter can say no to the money once,
// and whoever was turned down is not the next offer.
{
  const fail = (what: string) => { failures++; console.log(`  FAIL ${what}`); };
  const dw = createWorld(roster, { name: "UI", seed: 97, mode: "fighter", difficulty: "normal", created: { first: "Turn", surname: "Down", sex: "M", country: "US", div: "WW", age: 25, height: 72, reach: 74, stance: "orthodox", art: "wrestling", talent: "prospect", start: "regional" } });
  setWorld(dw);
  const me = dw.fighters[dw.career.fighters[0]];
  const promo = me.promo!;
  const free = () => {
    if (me.booked && dw.bouts[me.booked]) cancelBout(dw, dw.bouts[me.booked], "test");
    me.booked = null;
    me.injury = null;
    me.susp = 0;
    me.lastFight = dw.day - 120;
  };
  const evs = dw.upcoming.map((id) => dw.events[id]).filter((e) => e.promo === promo && e.day - dw.day > 30);
  const msgOf = (id: string) => dw.inbox.find((m) => m.ref === id && m.needs && !m.done);
  free();
  const o1 = withRng(dw, (rng) => offerFight(dw, rng, evs[0], me));
  if (!o1) fail(`no ${promo} offer to turn down`);
  else {
    const choices = declineChoices(dw, o1);
    const picker = renderToString(<DeclinePicker w={dw} o={o1} onPick={() => {}} onCancel={() => {}} />).replace(/<!-- -->/g, "");
    if (choices.length !== 7 || choices.filter((c) => c.best).length !== 1 || !picker.includes("Tell the matchmaker why") || !picker.includes("Best reason")) fail("the reasons for turning a fight down don't show, or no single best reason");
    const before = rapport(dw, me.id, promo);
    const reply = answer(dw, msgOf(o1.id)!.id, "decline:hurt");
    const after = rapport(dw, me.id, promo);
    const firstOpp = o1.opp;
    if (after !== before - 6 || !/aren't convinced/.test(reply) || !dw.inbox.some((m) => m.subject === `Re: ${dw.fighters[firstOpp].surname}`)) fail(`a fit fighter claiming an injury should cost 6 and get a reply (${before} -> ${after}: ${reply})`);
    free();
    const o2 = withRng(dw, (rng) => offerFight(dw, rng, evs[1], me));
    if (!o2 || o2.opp === firstOpp) fail(`after turning down ${dw.fighters[firstOpp].surname}, the next offer should be someone else (got ${o2 ? dw.fighters[o2.opp].surname : "nothing"})`);
    else {
      // Ducking: a better, better-known opponent, turned down for "a bigger name".
      const opp = dw.fighters[o2.opp];
      opp.elo = me.elo + 120;
      opp.pop = 45;
      const news = dw.news.length;
      const r0 = rapport(dw, me.id, promo);
      answer(dw, msgOf(o2.id)!.id, "decline:bigger");
      const ducked = dw.news.slice(0, dw.news.length - news + 1).some((n) => n.text.includes(`turned down a fight with ${opp.first} ${opp.surname}`));
      if (rapport(dw, me.id, promo) !== r0 - 9 || !ducked || heatOf(dw, me.id, opp.id) < 8) fail(`turning down a better name for "a bigger name" should cost 9, make the news and start bad blood (${r0} -> ${rapport(dw, me.id, promo)}, news ${ducked}, heat ${heatOf(dw, me.id, opp.id)})`);
      // The money: a fighter the promotion values hears back once with more.
      free();
      me.pop = 55;
      // On strained terms (35 after those two) there's no better number: back to good terms first.
      dw.career.fc[me.id].rapport = { ...dw.career.fc[me.id].rapport, [promo]: 60 };
      const o3 = withRng(dw, (rng) => offerFight(dw, rng, evs[2], me));
      if (!o3 || o3.opp === firstOpp || o3.opp === opp.id) fail(`the third offer should be a third opponent (got ${o3 ? dw.fighters[o3.opp].surname : "nothing"})`);
      else {
        const show = o3.show;
        answer(dw, msgOf(o3.id)!.id, "decline:money");
        const again = msgOf(o3.id);
        const raised = o3.status === "open" && !!o3.raised && o3.show > show && !!again;
        if (again) answer(dw, again.id, "decline:money");
        if (!raised || o3.status !== "declined") fail(`a valuable fighter's "not for this money" should bring one better number, then the matchmaker walks (raised ${raised}, ${o3.status})`);
        else {
          setWorld(dw);
          const page = renderToString(<Contracts id={me.id} />).replace(/<!-- -->/g, "");
          if (!page.includes("Matchmakers") || !page.includes("Turned down")) fail("the Contracts page doesn't show the matchmakers and what moved them");
          else console.log(`Turning fights down: an excuse cost 6, ducking ${opp.surname} cost 9 and made the news, the money got ${PROMOTIONS[promo].short} up from ${show} to ${o3.show} once; three offers, three opponents; ${PROMOTIONS[promo].short} now ${rapportLabel(rapport(dw, me.id, promo)).toLowerCase()} terms (${Math.round(rapport(dw, me.id, promo))})`);
        }
      }
    }
  }
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
