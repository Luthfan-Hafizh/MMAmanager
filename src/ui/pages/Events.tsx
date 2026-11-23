import { useState } from "react";
import { clock, DOW, fmtDate, MONTHS, ymd } from "../../core/time";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS, PROMO_IDS, TIER_NAME, type PromoId, type Tier } from "../../data/promotions";
import type { Bout, MMAEvent, World } from "../../model/types";
import { methodText } from "../../engine/sim";
import { cardSection } from "../../world/calendar";
import { recordText } from "../../world/core";
import { useWorld } from "../../state/store";
import { go, Link } from "../router";
import { Empty, FighterLink, Panel, Seg, Tabs } from "../components";

const TIERS: (Tier | "all" | "mine")[] = ["mine", "all", "major", "league", "tryout", "regional", "local", "amateur"];

export function Events({ promo }: { promo?: string }) {
  const w = useWorld();
  const [tab, setTab] = useState<"upcoming" | "results">("upcoming");
  const [tier, setTier] = useState<Tier | "all" | "mine">(promo ? "all" : "mine");
  const mine = new Set(w.career.fighters.map((id) => w.fighters[id]?.promo).filter(Boolean));
  const filt = (e: MMAEvent) =>
    (promo ? e.promo === promo : true) &&
    (tier === "all" ? true : tier === "mine" ? mine.has(e.promo) || e.promo === "ufc" || e.promo === "pfl" : PROMOTIONS[e.promo].tier === tier);
  const upcoming = w.upcoming.map((id) => w.events[id]).filter(filt).slice(0, 80);
  const results = Object.values(w.events).filter((e) => e.status === "done" && filt(e)).sort((a, b) => b.day - a.day).slice(0, 80);
  const list = tab === "upcoming" ? upcoming : results;
  return (
    <div className="stack">
      <div className="row">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "upcoming", label: "Upcoming" }, { id: "results", label: "Results" }]} />
      </div>
      {!promo && (
        <div className="row">
          <Seg value={tier} onChange={setTier} options={TIERS.map((t) => ({ v: t, label: t === "mine" ? "My promotions" : t === "all" ? "All" : TIER_NAME[t as Tier] }))} />
        </div>
      )}
      <Panel title={tab === "upcoming" ? "Calendar" : "Results"} hint={`${list.length} events`} flush>
        {list.length === 0 ? <Empty title="No events" /> : list.map((e) => <EventRow key={e.id} w={w} e={e} />)}
      </Panel>
    </div>
  );
}

function EventRow({ w, e }: { w: World; e: MMAEvent }) {
  const t = ymd(e.day);
  const p = PROMOTIONS[e.promo];
  const main = e.bouts.map((id) => w.bouts[id]).find((b) => b.status !== "cancelled");
  const mine = e.bouts.some((id) => {
    const b = w.bouts[id];
    return b.status !== "cancelled" && (w.fighters[b.a]?.ctrl || w.fighters[b.b]?.ctrl);
  });
  return (
    <div className="list-row" style={{ cursor: "pointer", background: mine ? "var(--accent-soft)" : undefined }} onClick={() => go(`/event/${e.id}`)}>
      <div className="date"><b>{t.d}</b><span>{MONTHS[t.m]} {String(t.y).slice(2)}</span></div>
      <span className="promo-dot" style={{ background: p.color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="disp up" style={{ fontSize: 17, fontWeight: 700 }}>{e.name}</div>
        <div className="small dim ellip">{DOW[t.dow]} · {e.venue}, {e.city} · {p.short}{e.status === "planned" ? " · card not announced" : ` · ${e.bouts.filter((id) => w.bouts[id].status !== "cancelled").length} fights`}</div>
      </div>
      {main && e.status !== "planned" && (
        <div className="small right nowrap" style={{ minWidth: 0 }}>
          <b>{w.fighters[main.a]?.surname}</b> vs <b>{w.fighters[main.b]?.surname}</b>
          {(main.kind === "title" || main.kind === "vacant" || main.kind === "interim") && <div><span className="badge gold">Title</span></div>}
        </div>
      )}
    </div>
  );
}

export function EventPage({ id }: { id: string }) {
  const w = useWorld();
  const e = w.events[id];
  if (!e) return <Empty title="Event not found" />;
  const p = PROMOTIONS[e.promo];
  const bouts = e.bouts.map((b) => w.bouts[b]);
  let lastSection = "";
  return (
    <div className="grid">
      <div className="c12">
        <div className="hero">
          <div className="spread" style={{ flexWrap: "wrap" }}>
            <div className="name">
              <small>{p.name} · {fmtDate(e.day, { dow: true })}</small>
              {e.name}
            </div>
            <div className="small muted right">{e.venue}<br />{e.city}<br /><Link to={`/promotions/${e.promo}`}>{p.short} roster and champions</Link></div>
          </div>
        </div>
      </div>
      <div className="c12">
        <Panel title="Fight card" flush>
          {e.status === "planned" && <Empty title="The card is not announced yet">Promotions book about {Math.round(p.lead / 7)} weeks ahead.</Empty>}
          {bouts.map((b, i) => {
            const sec = cardSection(e, i);
            const head = sec !== lastSection ? <div className="section-h" key={`h${i}`}>{sec}</div> : null;
            lastSection = sec;
            return (
              <div key={b.id}>
                {head}
                <BoutRow w={w} b={b} />
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}

function BoutRow({ w, b }: { w: World; b: Bout }) {
  const done = b.status === "done" && b.res;
  const wa = done && b.res!.winner === "a";
  const wb = done && b.res!.winner === "b";
  const mine = w.fighters[b.a]?.ctrl || w.fighters[b.b]?.ctrl;
  const title = b.kind === "title" || b.kind === "vacant" || b.kind === "interim";
  const bonus = b.res?.bonus ?? [];
  return (
    <div className={`bout${mine ? " mine" : ""}${b.status === "cancelled" ? " cancel" : ""}`}>
      <div className={`a ${wa ? "won" : done && !wa && b.res!.winner ? "lost" : ""}`}>
        <div style={{ minWidth: 0, textAlign: "right" }}>
          <FighterLink w={w} id={b.a} rank />
          <div className="tiny dim">{w.fighters[b.a] ? recordText(w.fighters[b.a]) : ""}{bonus.includes("potn-a") ? " · Performance of the Night" : ""}</div>
        </div>
      </div>
      <div className="mid">
        {done ? (
          <>
            <b>{methodText(b.res!.method, b.res!.detail)}</b>
            {b.res!.method !== "DEC" && b.res!.method !== "DRAW" ? `R${b.res!.round} ${clock(b.res!.time)}` : b.res!.cards ? b.res!.cards.map(([x, y]) => `${Math.max(x, y)}-${Math.min(x, y)}`).join(", ") : ""}
            {bonus.includes("fotn") && <div><span className="badge gold">Fight of the Night</span></div>}
          </>
        ) : b.status === "cancelled" ? (
          <b>Cancelled</b>
        ) : (
          <>
            <b>{title ? (b.kind === "interim" ? "Interim title" : b.kind === "vacant" ? "Vacant title" : "Title fight") : b.kind === "eliminator" ? "Eliminator" : DIVISIONS[b.div].short}</b>
            {b.rounds} rounds{b.shortNotice ? " · short notice" : ""}{b.pending ? " · offered" : ""}
          </>
        )}
      </div>
      <div className={`b ${wb ? "won" : done && !wb && b.res!.winner ? "lost" : ""}`}>
        <div style={{ minWidth: 0 }}>
          <FighterLink w={w} id={b.b} rank />
          <div className="tiny dim">{w.fighters[b.b] ? recordText(w.fighters[b.b]) : ""}{bonus.includes("potn-b") ? " · Performance of the Night" : ""}</div>
        </div>
      </div>
    </div>
  );
}

export { PROMO_IDS };
export type { PromoId };
