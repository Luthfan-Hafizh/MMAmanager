// The shell: a black broadcast bar (date, bank, Continue) over a white navigation
// strip, then the page. Every page opens with a dark hero band.

import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { fmtDate, DOW, ymd } from "../core/time";
import { money } from "../core/util";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS, type PromoId } from "../data/promotions";
import { blocking, unread } from "../career/inbox";
import { fightNight } from "../sim/advance";
import { continueGame, getState, useStore, useVersion } from "../state/store";
import { underWay } from "../state/live";
import { Icons, Logo } from "./icons";
import { go, Link, useRoute } from "./router";
import { Band } from "./art";
import { ConfirmHost } from "./components";
import { Title } from "./pages/Title";
import { Home } from "./pages/Home";

// Pages load when first opened, so the first visit (on a phone above all) downloads less.
const NewGame = lazy(() => import("./pages/NewGame").then((m) => ({ default: m.NewGame })));
const Inbox = lazy(() => import("./pages/Inbox").then((m) => ({ default: m.Inbox })));
const FighterPage = lazy(() => import("./pages/FighterPage").then((m) => ({ default: m.FighterPage })));
const Training = lazy(() => import("./pages/Training").then((m) => ({ default: m.Training })));
const NextFight = lazy(() => import("./pages/NextFight").then((m) => ({ default: m.NextFight })));
const FightNight = lazy(() => import("./pages/FightNight").then((m) => ({ default: m.FightNight })));
const Contracts = lazy(() => import("./pages/Contracts").then((m) => ({ default: m.Contracts })));
const Finances = lazy(() => import("./pages/Finances").then((m) => ({ default: m.Finances })));
const Events = lazy(() => import("./pages/Events").then((m) => ({ default: m.Events })));
const EventPage = lazy(() => import("./pages/Events").then((m) => ({ default: m.EventPage })));
const Rankings = lazy(() => import("./pages/Rankings").then((m) => ({ default: m.Rankings })));
const News = lazy(() => import("./pages/News").then((m) => ({ default: m.News })));
const Fighters = lazy(() => import("./pages/Fighters").then((m) => ({ default: m.Fighters })));
const Promotions = lazy(() => import("./pages/Promotions").then((m) => ({ default: m.Promotions })));
const PromotionPage = lazy(() => import("./pages/Promotions").then((m) => ({ default: m.PromotionPage })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const Agency = lazy(() => import("./pages/Agency").then((m) => ({ default: m.Agency })));
const Scouting = lazy(() => import("./pages/Agency").then((m) => ({ default: m.Scouting })));
const Legacy = lazy(() => import("./pages/Legacy").then((m) => ({ default: m.Legacy })));
const Titles = lazy(() => import("./pages/Titles").then((m) => ({ default: m.Titles })));
const Media = lazy(() => import("./pages/Media").then((m) => ({ default: m.Media })));
const PressRoom = lazy(() => import("./pages/Media").then((m) => ({ default: m.PressRoom })));
const Help = lazy(() => import("./pages/Help").then((m) => ({ default: m.Help })));
const Compare = lazy(() => import("./pages/Compare").then((m) => ({ default: m.Compare })));

/** While a page's code arrives (a moment, the first time it's opened). */
function Loading() {
  return (
    <div className="wrap page-body" aria-busy="true">
      <p className="muted">Loading…</p>
    </div>
  );
}
import type { World } from "../model/types";

export function App() {
  const world = useStore((s) => s.world);
  const busy = useStore((s) => s.busy);
  const t = useStore((s) => s.toast);
  const route = useRoute();
  let body: ReactNode;
  if (!world) body = route.parts[0] === "new" ? <Suspense fallback={<Loading />}><NewGame /></Suspense> : <Title />;
  else body = <Shell />;
  return (
    <>
      {body}
      <ConfirmHost />
      {busy && (
        <div className="busy" role="status">
          <div>
            <span className="spinner" /> {busy}
          </div>
        </div>
      )}
      {t && <div className={`toast ${t.kind}`} role="status">{t.text}</div>}
    </>
  );
}

interface PageDef {
  title: string;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  el: ReactNode;
  /** The page draws its own hero band. */
  custom?: boolean;
}

function pageFor(parts: string[]): PageDef {
  const w = getState().world!;
  const [p0, p1, p2] = parts;
  const mode = w.career.mode;
  switch (p0) {
    case "inbox":
      return { title: "Inbox", eyebrow: "Messages and decisions", sub: "Offers, contracts, results and news from your team.", el: <Inbox id={p1} /> };
    case "fighter":
      return { title: "Fighter", el: <FighterPage id={p1 ?? w.career.fighters[0]} tab={p2} />, custom: true };
    case "training":
      return { title: "Training", eyebrow: "The gym", sub: "Ten sessions a week, an intensity and a technique to drill. Growth slows near the ceiling and with age.", el: <Training id={p1} /> };
    case "fight":
      return { title: mode === "manager" ? "Fights" : "Next fight", el: <NextFight id={p1} />, custom: true };
    case "fightnight":
      return { title: "Fight night", el: <FightNight />, custom: true };
    case "media":
      return p1 === "session" && p2 ? { title: "Press conference", el: <PressRoom sid={p2} />, custom: true } : { title: "Media", el: <Media id={p1} />, custom: true };
    case "contracts":
      return { title: "Contracts", eyebrow: "Business", sub: "Deals, offers, counter offers and the manager.", el: <Contracts id={p1} /> };
    case "finances":
      return { title: "Money", eyebrow: "Business", sub: "Purses, bonuses, sponsors and what comes out of them.", el: <Finances /> };
    case "events":
      return { title: "Events", eyebrow: p1 ? PROMOTIONS[p1 as PromoId]?.name : "Schedule and results", sub: "Every card of every promotion, from the IMMAF circuits to the UFC.", el: <Events promo={p1} /> };
    case "event":
      return { title: w.events[p1]?.name ?? "Event", el: <EventPage id={p1} />, custom: true };
    case "rankings":
      return { title: "Rankings", el: <Rankings promo={p1} div={p2} />, custom: true };
    case "news":
      return { title: "News", eyebrow: "Around the sport", sub: "Results, title changes, signings and the fights that fell through.", el: <News /> };
    case "fighters":
      return { title: "Athletes", eyebrow: "Every fighter in the world", sub: "Search the UFC, the PFL, eight regional scenes and the amateur circuits.", el: <Fighters /> };
    case "promotions":
      return p1
        ? { title: PROMOTIONS[p1 as PromoId]?.name ?? "Promotion", eyebrow: PROMOTIONS[p1 as PromoId]?.short, el: <PromotionPage id={p1} /> }
        : { title: "Promotions", eyebrow: "The ladder", sub: "Amateur circuits, local shows, regional promotions, the Contender Series, the PFL and the UFC.", el: <Promotions /> };
    case "settings":
      return { title: "Settings", eyebrow: "The game", el: <Settings /> };
    case "titles":
      return { title: "Title history", el: <Titles promo={p1} div={p2} />, custom: true };
    case "compare":
      return { title: "Compare", el: <Compare a={p1 && p1 !== "-" ? p1 : undefined} b={p2 && p2 !== "-" ? p2 : undefined} />, custom: true };
    case "help":
      return { title: "How to play", el: <Help />, custom: true };
    case "legacy":
      return { title: "Legacy", el: <Legacy tab={p1} promo={p2} />, custom: true };
    case "agency":
      return { title: w.career.agency?.name ?? "Agency", eyebrow: "Your management company", el: <Agency /> };
    case "scouting":
      return { title: "Scouting", eyebrow: "Fighters you could sign", sub: "Pitch to fighters at every level. Reputation, your cut and the stable you already have decide who says yes.", el: <Scouting /> };
    default:
      return { title: "Home", el: <Home />, custom: true };
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
    else if ((stop.kind === "decision" || stop.kind === "message") && stop.ref) go(`/inbox/${stop.ref}`);
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
  // A fight left mid-way waits on the fight-night screen, paused.
  const waiting = fn ? fn.bouts.map((id) => w.bouts[id]).some((b) => (w.fighters[b.a]?.ctrl || w.fighters[b.b]?.ctrl) && underWay(w, b)) : false;
  if (fn)
    return (
      <button className="go fight" onClick={onClick}>
        <span>Fight night<small>{waiting ? "Back to your fight" : fn.name}</small></span>
        <Icons.glove />
      </button>
    );
  if (decide.length)
    return (
      <button className="go decide" onClick={onClick}>
        <span>Decide<small>{decide.length} waiting</small></span>
        <Icons.alert />
      </button>
    );
  return (
    <button className="go" onClick={onClick} disabled={!!busy} title="Continue (Ctrl+Space)">
      <span>Continue<small>to the next event</small></span>
      <Icons.arrow />
    </button>
  );
}

/** The results ticker: the latest from the UFC, the PFL and your own fighters. */
function Ticker({ w }: { w: World }) {
  const mine = new Set(w.career.fighters);
  const items = w.news
    .filter((n) => (n.kind === "result" || n.kind === "title" || n.kind === "upset" || n.kind === "signing") && (n.promo === "ufc" || n.promo === "pfl" || n.big || n.fighters?.some((id) => mine.has(id))))
    .slice(0, 14);
  if (items.length < 3) return null;
  const tag = (k: string) => (k === "title" ? "Title" : k === "upset" ? "Upset" : k === "signing" ? "Signed" : "Result");
  return (
    <div className="ticker" aria-label="Latest results">
      <div className="lab">Latest</div>
      <div className="track">
        {[...items, ...items].map((n, i) => (
          <span key={`${n.id}-${i}`} className="it" aria-hidden={i >= items.length}>
            <b>{tag(n.kind)}</b>
            {n.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function Shell() {
  useVersion();
  const w = getState().world!;
  const route = useRoute();
  const page = pageFor(route.parts);
  const t = ymd(w.day);
  const at = route.parts[0] ?? "home";
  const decide = blocking(w).length;
  const u = unread(w);
  const mode = w.career.mode;
  useEffect(() => {
    document.title = `${page.title} · MMA Manager`;
  }, [page.title]);
  // The nav scrolls sideways on smaller screens: fade the edge while there's more, and keep the current page in view.
  const navRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const check = () => {
      el.dataset.more = el.scrollWidth - el.scrollLeft - el.clientWidth > 4 ? "1" : "";
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);
  useEffect(() => {
    const on = navRef.current?.querySelector<HTMLElement>("a.on");
    if (on && navRef.current && navRef.current.scrollWidth > navRef.current.clientWidth) on.scrollIntoView({ block: "nearest", inline: "center" });
  }, [at]);
  const me = w.career.fighters[0] ? w.fighters[w.career.fighters[0]] : undefined;
  const nav = (to: string, label: string, count?: number, soft?: boolean) => (
    <Link to={to} className={at === to.split("/")[1] ? "on" : ""}>
      {label}
      {!!count && <span className={`dot${soft ? " soft" : ""}`}>{count}</span>}
    </Link>
  );
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="bar-top">
        <div className="inner">
          <Link to="/home" className="wordmark">
            <Logo size={28} />
            <span className="full">MMA <b>Manager</b></span>
          </Link>
          <div className="bar-date">
            <div className="d">{DOW[t.dow]} {fmtDate(w.day)}</div>
            <div className="s">
              {mode === "manager" ? w.career.agency?.name : me ? `${me.surname} · ${DIVISIONS[me.div].short}${me.promo ? ` · ${PROMOTIONS[me.promo].short}` : ""}` : "Career"}
            </div>
          </div>
          <div className={`bar-money${w.career.money < 0 ? " neg" : ""}`} title="Bank balance">{money(w.career.money)}</div>
          <ContinueButton />
        </div>
      </header>
      <nav className="bar-nav" aria-label="Main">
        <div className="inner" ref={navRef}>
          {nav("/home", "Home")}
          {nav("/inbox", "Inbox", decide || u, !decide)}
          {mode === "fighter" ? (
            <>
              {nav("/fighter", "Profile")}
              {nav("/training", "Training")}
              {nav("/fight", "Fight")}
              {nav("/media", "Media")}
              {nav("/contracts", "Contracts")}
              {nav("/finances", "Money")}
            </>
          ) : (
            <>
              {nav("/agency", "Clients")}
              {nav("/scouting", "Scouting")}
              {nav("/training", "Training")}
              {nav("/fight", "Fights")}
              {nav("/media", "Media")}
              {nav("/contracts", "Contracts")}
              {nav("/finances", "Money")}
            </>
          )}
          <span className="sep" />
          {nav("/events", "Events")}
          {nav("/rankings", "Rankings")}
          {nav("/fighters", "Athletes")}
          {nav("/news", "News")}
          {nav("/promotions", "Promotions")}
          {nav("/legacy", "Legacy")}
          <span className="sep" />
          {nav("/help", "Guide")}
          {nav("/settings", "Settings")}
        </div>
      </nav>
      <Ticker w={w} />
      <main id="main">
        <Suspense fallback={<Loading />}>
          {page.custom ? (
            page.el
          ) : (
            <>
              <Band eyebrow={page.eyebrow} title={page.title} sub={page.sub} />
              <div className="wrap page-body">{page.el}</div>
            </>
          )}
        </Suspense>
      </main>
    </>
  );
}
