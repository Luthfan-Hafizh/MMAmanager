// The shell: top bar with the date, the money and Continue; the sidebar; the pages.

import { useEffect, useState, type ReactNode } from "react";
import { fmtDate, DOW, ymd } from "../core/time";
import { money } from "../core/util";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import { blocking, unread } from "../career/inbox";
import { fightNight } from "../sim/advance";
import { continueGame, getState, useStore, useVersion } from "../state/store";
import { Icons, Logo } from "./icons";
import { go, Link, useRoute } from "./router";
import { Flag, Ovr } from "./components";
import { ovr } from "../model/attributes";
import { fullName, rankLabel } from "../world/core";
import { Title } from "./pages/Title";
import { NewGame } from "./pages/NewGame";
import { Home } from "./pages/Home";
import { Inbox } from "./pages/Inbox";
import { FighterPage } from "./pages/FighterPage";
import { Training } from "./pages/Training";
import { NextFight } from "./pages/NextFight";
import { FightNight } from "./pages/FightNight";
import { Contracts } from "./pages/Contracts";
import { Finances } from "./pages/Finances";
import { Events, EventPage } from "./pages/Events";
import { Rankings } from "./pages/Rankings";
import { News } from "./pages/News";
import { Fighters } from "./pages/Fighters";
import { Promotions, PromotionPage } from "./pages/Promotions";
import { Settings } from "./pages/Settings";
import { Agency, Scouting } from "./pages/Agency";

export function App() {
  const world = useStore((s) => s.world);
  const busy = useStore((s) => s.busy);
  const t = useStore((s) => s.toast);
  const route = useRoute();
  let body: ReactNode;
  if (!world) body = route.parts[0] === "new" ? <NewGame /> : <Title />;
  else body = <Shell />;
  return (
    <>
      {body}
      {busy && (
        <div className="busy">
          <div>
            <span className="spinner" /> {busy}
          </div>
        </div>
      )}
      {t && <div className={`toast ${t.kind}`}>{t.text}</div>}
    </>
  );
}

function pageFor(parts: string[]): { title: string; sub?: string; el: ReactNode } {
  const w = getState().world!;
  const [p0, p1, p2] = parts;
  switch (p0) {
    case "inbox":
      return { title: "Inbox", el: <Inbox id={p1} /> };
    case "fighter": {
      const f = w.fighters[p1 ?? w.career.fighters[0]];
      return { title: f ? fullName(f) : "Fighter", sub: f ? `${DIVISIONS[f.div].name}${f.promo ? ` · ${PROMOTIONS[f.promo].short}` : ""}` : "", el: <FighterPage id={p1 ?? w.career.fighters[0]} tab={p2} /> };
    }
    case "training":
      return { title: "Training", sub: "The week, the intensity and the technique to drill", el: <Training id={p1} /> };
    case "fight":
      return { title: "Next fight", sub: "Camp, scouting and the game plan", el: <NextFight id={p1} /> };
    case "fightnight":
      return { title: "Fight night", el: <FightNight /> };
    case "contracts":
      return { title: "Contracts", sub: "Deals, offers and negotiation", el: <Contracts id={p1} /> };
    case "finances":
      return { title: "Finances", el: <Finances /> };
    case "events":
      return { title: "Events", sub: "The calendar of every promotion", el: <Events promo={p1} /> };
    case "event":
      return { title: w.events[p1]?.name ?? "Event", sub: w.events[p1] ? `${fmtDate(w.events[p1].day, { dow: true })} · ${w.events[p1].venue}, ${w.events[p1].city}` : "", el: <EventPage id={p1} /> };
    case "rankings":
      return { title: "Rankings", el: <Rankings promo={p1} div={p2} /> };
    case "news":
      return { title: "News", el: <News /> };
    case "fighters":
      return { title: "Fighters", sub: "Search every fighter in the world", el: <Fighters /> };
    case "promotions":
      return p1 ? { title: PROMOTIONS[p1 as keyof typeof PROMOTIONS]?.name ?? "Promotion", el: <PromotionPage id={p1} /> } : { title: "Promotions", sub: "From the amateur circuits to the UFC", el: <Promotions /> };
    case "settings":
      return { title: "Settings", el: <Settings /> };
    case "agency":
      return { title: w.career.agency?.name ?? "Agency", sub: "Your management company", el: <Agency /> };
    case "scouting":
      return { title: "Scouting", sub: "Fighters you could sign", el: <Scouting /> };
    default:
      return { title: "Home", sub: w.career.mode === "manager" ? w.career.agency?.name : undefined, el: <Home /> };
  }
}

function ContinueButton() {
  const w = getState().world!;
  const busy = useStore((s) => s.busy);
  const decide = blocking(w);
  const fn = fightNight(w);
  const onClick = async () => {
    if (fn) return go("/fightnight");
    if (decide.length) return go(`/inbox/${decide[0].id}`);
    const r = await continueGame(7);
    const stop = r?.stop;
    if (!stop) return;
    if (stop.kind === "fight") go("/fightnight");
    else if (stop.kind === "decision" && stop.ref) go(`/inbox/${stop.ref}`);
    else if (stop.kind === "message" && stop.ref) go(`/inbox/${stop.ref}`);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === " " && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void onClick();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (fn)
    return (
      <button className="continue fight" onClick={onClick}>
        <Icons.glove /> <span>Fight night<small>{fn.name}</small></span>
      </button>
    );
  if (decide.length)
    return (
      <button className="continue decide" onClick={onClick}>
        <Icons.alert /> <span>Decision<small>{decide.length} waiting</small></span>
      </button>
    );
  return (
    <button className="continue" onClick={onClick} disabled={!!busy} title="Continue (Ctrl+Space)">
      <span>Continue</span> <Icons.arrow />
    </button>
  );
}

function Shell() {
  useVersion();
  const w = getState().world!;
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const { title, sub, el } = pageFor(route.parts);
  const t = ymd(w.day);
  useEffect(() => setOpen(false), [route.path]);
  const mine = w.career.fighters.map((id) => w.fighters[id]).filter(Boolean);
  const me = mine[0];
  const u = unread(w);
  const decide = blocking(w).length;
  const mode = w.career.mode;
  const at = route.parts[0] ?? "home";
  const nav = (to: string, label: string, icon: ReactNode, count?: number, soft?: boolean) => (
    <Link to={to} className={`${at === to.split("/")[1] ? "on" : ""}`}>
      {icon}
      {label}
      {!!count && <span className={`count${soft ? " soft" : ""}`}>{count}</span>}
    </Link>
  );
  useEffect(() => {
    document.title = `${title} · MMA Manager`;
  }, [title]);
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <button className="btn ghost sm burger" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            <Icons.menu />
          </button>
          <Logo />
          <div className="brand-name">
            MMA <span>Manager</span>
          </div>
        </div>
        <div className="crumbs">
          <h1>{title}</h1>
          {sub && <span className="sub">{sub}</span>}
        </div>
        <div className="top-date">
          <b>
            {DOW[t.dow]} {fmtDate(w.day)}
          </b>
          <span>{mode === "manager" ? "Manager" : "Fighter"} career</span>
        </div>
        <div className={`top-money${w.career.money < 0 ? " neg" : ""}`} title="Bank balance">
          {money(w.career.money)}
        </div>
        <ContinueButton />
      </header>
      <nav className={`side${open ? " open" : ""}`}>
        {me && mode === "fighter" && (
          <div className="side-card" onClick={() => go(`/fighter/${me.id}`)}>
            <Ovr v={ovr(me.attrs)} />
            <div className="ellip">
              <div className="nm ellip">
                {rankLabel(w, me) && <span className="gold-t">{rankLabel(w, me)} </span>}
                {fullName(me)}
              </div>
              <div className="meta row tight">
                <Flag code={me.country} /> {DIVISIONS[me.div].short} · {me.promo ? PROMOTIONS[me.promo].short : "Free agent"} · {me.rec.w}-{me.rec.l}
              </div>
            </div>
          </div>
        )}
        {mode === "manager" && (
          <div className="side-card" onClick={() => go("/agency")}>
            <div className="ovr" style={{ fontSize: 15 }}>{Math.round(w.career.agency?.rep ?? 0)}</div>
            <div className="ellip">
              <div className="nm ellip">{w.career.agency?.name}</div>
              <div className="meta">{mine.length} clients · reputation</div>
            </div>
          </div>
        )}
        <div className="nav">
          {nav("/home", "Home", <Icons.home />)}
          {nav("/inbox", "Inbox", <Icons.inbox />, decide || u, !decide)}
          {mode === "fighter" ? (
            <>
              {nav("/fighter", "Profile", <Icons.user />)}
              {nav("/training", "Training", <Icons.training />)}
              {nav("/fight", "Next fight", <Icons.glove />)}
              {nav("/contracts", "Contracts", <Icons.contract />)}
              {nav("/finances", "Finances", <Icons.money />)}
            </>
          ) : (
            <>
              {nav("/agency", "Clients", <Icons.users />)}
              {nav("/scouting", "Scouting", <Icons.binoculars />)}
              {nav("/training", "Training", <Icons.training />)}
              {nav("/fight", "Fights", <Icons.glove />)}
              {nav("/contracts", "Contracts", <Icons.contract />)}
              {nav("/finances", "Finances", <Icons.money />)}
            </>
          )}
          <div className="nav-group">World</div>
          {nav("/events", "Events", <Icons.calendar />)}
          {nav("/rankings", "Rankings", <Icons.trophy />)}
          {nav("/news", "News", <Icons.news />)}
          {nav("/fighters", "Fighters", <Icons.search />)}
          {nav("/promotions", "Promotions", <Icons.building />)}
          <div className="nav-group">Game</div>
          {nav("/settings", "Settings", <Icons.settings />)}
        </div>
      </nav>
      <main className="main">
        <div className="page">{el}</div>
      </main>
    </div>
  );
}
