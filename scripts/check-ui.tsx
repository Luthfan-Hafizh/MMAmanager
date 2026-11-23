// Render every page to HTML in Node, for a fighter career and a manager career,
// to catch crashes without a browser.
//   npm run check:ui
import { renderToString } from "react-dom/server";
import rosterJson from "../public/data/roster.json";
import { createWorld, starterClients, addControlled } from "../src/world/create";
import type { RosterFile } from "../src/world/real";
import { setWorld } from "../src/state/store";
import { advance, fightNight, openFightNight, quickSim, resolvePlayerBout } from "../src/sim/advance";
import { autoAnswer } from "../src/career/actions";
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
