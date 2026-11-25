import { useState, Fragment } from "react";
import { clock, DOW, fmtDate, MONTHS, ymd } from "../../core/time";
import { countryOf } from "../../data/countries";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS, TIER_NAME, type Tier } from "../../data/promotions";
import type { Bout, MMAEvent, World } from "../../model/types";
import { methodText } from "../../engine/sim";
import { cardSection } from "../../world/calendar";
import { beltNote, isBeltFight, stakeLabel } from "../../world/belts";
import { rankLabel, recordText } from "../../world/core";
import { headToHead, moneyline, oddsOf, preview } from "../../world/odds";
import { useWorld } from "../../state/store";
import { go, Link } from "../router";
import { Empty, Flag, Seg, Tabs, Versus } from "../components";
import { Band } from "../art";
import { groupScore } from "../../model/attributes";
import type { FightRecord, Fighter } from "../../model/types";
import { recordAfter } from "../../world/report";
import { FightReport, reportOf } from "../report";
import { styleLabel } from "../../world/fightstyle";

const recText = (r: FightRecord) => `${r.w}-${r.l}${r.d ? `-${r.d}` : ""}${r.nc ? ` (${r.nc} NC)` : ""}`;

/** The record that belongs next to a bout: amateur for amateur fights, and as it stood after the fight once it is over. */
function boutRecord(w: World, f: Fighter, b: Bout): string {
  const am = PROMOTIONS[b.promo]?.tier === "amateur";
  const r = b.status === "done" ? recordAfter(w, f, b) : am ? f.am : f.rec;
  return `${recText(r)}${am ? " amateur" : ""}`;
}

const TIERS: (Tier | "all" | "mine")[] = ["mine", "all", "major", "league", "tryout", "regional", "local", "amateur"];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function Events({ promo }: { promo?: string }) {
  const w = useWorld();
  const [tab, setTab] = useState<"upcoming" | "results">("upcoming");
  const [tier, setTier] = useState<Tier | "all" | "mine">(promo ? "all" : "mine");
  const mine = new Set(w.career.fighters.map((id) => w.fighters[id]?.promo).filter(Boolean));
  const filt = (e: MMAEvent) =>
    (promo ? e.promo === promo : true) &&
    (tier === "all" ? true : tier === "mine" ? mine.has(e.promo) || e.promo === "ufc" || e.promo === "pfl" : PROMOTIONS[e.promo].tier === tier);
  const upcoming = w.upcoming.map((id) => w.events[id]).filter(filt).slice(0, 60);
  const results = Object.values(w.events).filter((e) => e.status === "done" && filt(e)).sort((a, b) => b.day - a.day).slice(0, 60);
  const list = tab === "upcoming" ? upcoming : results;
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "upcoming", label: "Upcoming" }, { id: "results", label: "Past events" }]} />
      {!promo && <Seg value={tier} onChange={setTier} options={TIERS.map((t) => ({ v: t, label: t === "mine" ? "My promotions" : t === "all" ? "All" : TIER_NAME[t as Tier] }))} />}
      <div className="panel">
        {list.length === 0 ? (
          <Empty title="No events" />
        ) : (
          list.map((e, i) => {
            // A heading for each month, so the schedule reads like a calendar.
            const t = ymd(e.day);
            const prev = i > 0 ? ymd(list[i - 1].day) : null;
            const head = !prev || prev.m !== t.m || prev.y !== t.y;
            return (
              <Fragment key={e.id}>
                {head && <div className="ev-month">{MONTH_NAMES[t.m]} {t.y}</div>}
                <EventRow w={w} e={e} />
              </Fragment>
            );
          })
        )}
      </div>
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
  const stake = main ? stakeLabel(main) : null;
  if (e.status === "planned") {
    // No card yet: one quiet line, so the cards that are made stand out.
    return (
      <div className={`ev-row tba${mine ? " mine" : ""}`} onClick={() => go(`/event/${e.id}`)}>
        <div className="when"><span>{DOW[t.dow]}</span><b>{t.d}</b></div>
        <div style={{ minWidth: 0 }}>
          <div className="headline">{e.name}</div>
          <div className="where">Card to be announced about {Math.round(p.lead / 7)} weeks out · {e.venue}, {e.city}</div>
        </div>
        <div className="acts"><span className="btn sm ghost">Details</span></div>
      </div>
    );
  }
  return (
    <div className={`ev-row${mine ? " mine" : ""}`} onClick={() => go(`/event/${e.id}`)}>
      <div className="when"><span>{DOW[t.dow]}</span><b>{t.d}</b><span>{MONTHS[t.m]} {t.y}</span></div>
      <div style={{ minWidth: 0 }}>
        <div className="nm">{e.name}{stake && stake !== "Title eliminator" ? ` · ${stake}` : ""}</div>
        <div className="headline">{main ? `${w.fighters[main.a]?.surname} vs ${w.fighters[main.b]?.surname}` : e.status === "done" ? "No fights" : "Card to be announced"}</div>
        <div className="where">{e.venue}, {e.city} · {p.name}</div>
      </div>
      <div className="acts"><span className="btn sm">{e.status === "done" ? "Results" : "Fight card"}</span></div>
    </div>
  );
}

export function EventPage({ id }: { id: string }) {
  const w = useWorld();
  const e = w.events[id];
  const [sec, setSec] = useState<string>("all");
  if (!e) return <div className="wrap page-body"><Empty title="Event not found" /></div>;
  const p = PROMOTIONS[e.promo];
  const bouts = e.bouts.map((b) => w.bouts[b]);
  const main = bouts.find((b) => b.status !== "cancelled");
  const sections = [...new Set(bouts.map((b, i) => cardSection(e, i)))];
  const shown = bouts.map((b, i) => ({ b, s: cardSection(e, i) })).filter((x) => sec === "all" || x.s === sec);
  const odds = main ? oddsOf(main) : null;
  let last = "";
  return (
    <>
      <Band
        word={e.city}
        eyebrow={<><span>{p.name}</span><span className="dim">·</span><span>{fmtDate(e.day, { dow: true })}</span></>}
        first={e.name}
        title={main ? `${w.fighters[main.a]?.surname} vs ${w.fighters[main.b]?.surname}` : "Card to be announced"}
        sub={`${e.venue}, ${e.city}${e.status === "done" ? " · Final results" : e.status === "planned" ? ` · The card is made about ${Math.round(p.lead / 7)} weeks out` : ""}`}
        right={
          main && odds && main.status !== "done" ? (
            <div className="duo">
              <div><div className={`odds ${main.odds! >= 0.5 ? "fav" : "dog"}`}>{odds.a}</div><div className="k">{w.fighters[main.a].surname}</div></div>
              <div className="vs">VS</div>
              <div><div className={`odds ${main.odds! < 0.5 ? "fav" : "dog"}`}>{odds.b}</div><div className="k">{w.fighters[main.b].surname}</div></div>
            </div>
          ) : main?.res ? (
            <div className="mark"><div className="mark-big" style={{ fontSize: 120 }}>{main.res.method === "DEC" ? "DEC" : main.res.method}</div><div className="mark-label">Main event result</div><div className="mark-sub">{w.fighters[main.res.winner === "b" ? main.b : main.a].surname} {main.res.winner ? "wins" : "draw"}{main.res.method !== "DEC" ? `, round ${main.res.round}` : ""}</div></div>
          ) : undefined
        }
        tabs={
          sections.length > 1 ? (
            <div className="tabs" style={{ marginBottom: -34 }}>
              <button className={sec === "all" ? "on" : ""} onClick={() => setSec("all")}>Full card</button>
              {sections.map((s) => <button key={s} className={sec === s ? "on" : ""} onClick={() => setSec(s)}>{s}</button>)}
            </div>
          ) : undefined
        }
      />
      <div className="wrap page-body">
        <div className="panel">
          {e.status === "planned" && <Empty title="The card is not announced yet">Promotions book about {Math.round(p.lead / 7)} weeks ahead.</Empty>}
          {shown.map(({ b, s }) => {
            const head = s !== last ? <div className="section-h">{s}</div> : null;
            last = s;
            return (
              <div key={b.id}>
                {head}
                <BoutRow w={w} b={b} />
              </div>
            );
          })}
        </div>
        <p className="tiny dim" style={{ marginTop: 10 }}>Click a fight for the tale of the tape and the keys to victory. Odds are moneylines with the bookmaker's margin.</p>
      </div>
    </>
  );
}

/** The rank a fighter took into a finished fight ("C", "IC", "#n" or "" unranked), or null when it wasn't recorded. */
export function rankThen(b: Bout, side: "a" | "b"): string | null {
  const r = side === "a" ? b.rankA : b.rankB;
  if (r === undefined) return null;
  if (r === null) return "";
  if (r === 0) return "C";
  const note = b.res?.belt?.[side];
  if (b.stake === "unify" || note === "Defended the interim title" || (b.kind === "interim" && note === "Lost the interim title")) return "IC";
  return `#${r}`;
}

function Corner({ w, b, id, side, result, bonus }: { w: World; b: Bout; id: string; side: "a" | "b"; result: "W" | "L" | "D" | null; bonus?: boolean }) {
  const f = w.fighters[id];
  if (!f) return <div />;
  // A finished fight shows the ranks going into it, an upcoming one the ranks now.
  const rl = (b.status === "done" ? rankThen(b, side) : null) ?? rankLabel(w, f);
  return (
    <div className={side}>
      {side === "b" && result && <span className={`wl ${result}`}>{result}</span>}
      <div style={{ minWidth: 0 }}>
        <Link to={`/fighter/${f.id}`} className="fname" style={{ display: "block" }}>
          <span className="first">{rl ? `${rl === "C" ? "Champion" : rl === "IC" ? "Interim champ" : rl} · ` : ""}{f.first}</span>
          {f.surname}
        </Link>
        <div className="meta">{boutRecord(w, f, b)}{bonus ? " · Performance of the Night" : ""}</div>
      </div>
      {side === "a" && result && <span className={`wl ${result}`}>{result}</span>}
    </div>
  );
}

function BoutRow({ w, b }: { w: World; b: Bout }) {
  const [open, setOpen] = useState(false);
  const done = b.status === "done" && b.res;
  const ra = done ? (b.res!.winner === "a" ? "W" : b.res!.winner === "b" ? "L" : "D") : null;
  const rb = done ? (b.res!.winner === "b" ? "W" : b.res!.winner === "a" ? "L" : "D") : null;
  const mine = w.fighters[b.a]?.ctrl || w.fighters[b.b]?.ctrl;
  const title = isBeltFight(b);
  const bonus = b.res?.bonus ?? [];
  const won = done && b.res!.winner ? beltNote(b, b.res!.winner === "a" ? b.a : b.b) : null;
  const odds = oddsOf(b);
  const A = w.fighters[b.a];
  const B = w.fighters[b.b];
  if (!A || !B) return null;
  return (
    <div className={`bout-wrap${mine ? " mine" : ""}`}>
      <div className={`bout${mine ? " mine" : ""}${b.status === "cancelled" ? " cancel" : ""}${title ? " title-bout" : ""}`} onClick={() => b.status !== "cancelled" && setOpen((o) => !o)} aria-expanded={open}>
        <Corner w={w} b={b} id={b.a} side="a" result={ra} bonus={bonus.includes("potn-a")} />
        <div className="mid">
          <div className={`wc${b.kind === "bmf" ? " bmf-t" : ""}`}>{stakeLabel(b, true) ?? `${DIVISIONS[b.div].name} bout`}</div>
          {done ? (
            <>
              <div className="res">{methodText(b.res!.method, b.res!.detail)}</div>
              <div>{b.res!.method !== "DEC" && b.res!.method !== "DRAW" ? `R${b.res!.round} · ${clock(b.res!.time)}` : b.res!.cards ? b.res!.cards.map(([x, y]) => `${Math.max(x, y)}-${Math.min(x, y)}`).join(" · ") : ""}</div>
              {won && <div className="tiny gold-t" style={{ fontWeight: 700 }}>{w.fighters[b.res!.winner === "a" ? b.a : b.b]?.surname}: {won.toLowerCase()}</div>}
              {bonus.includes("fotn") && <span className="badge gold" style={{ marginTop: 4 }}>Fight of the Night</span>}
            </>
          ) : b.status === "cancelled" ? (
            <div className="res">Cancelled</div>
          ) : (
            <>
              <div className="vs">VS</div>
              <div>{b.rounds} × {b.roundSec / 60} min{b.shortNotice ? " · short notice" : ""}{b.pending ? " · offered" : ""}</div>
            </>
          )}
        </div>
        <Corner w={w} b={b} id={b.b} side="b" result={rb} bonus={bonus.includes("potn-b")} />
      </div>
      <div className="bout-foot">
        <span className="l row tight" style={{ justifyContent: "flex-end" }}>{countryOf(A.country).name} <Flag code={A.country} /></span>
        <span className="c">
          {odds ? (
            <>
              <span className={`ml${b.odds! >= 0.5 ? " fav" : ""}`}>{odds.a}</span>
              <span className="label">{done ? "Closing odds" : "Odds"}</span>
              <span className={`ml${b.odds! < 0.5 ? " fav" : ""}`}>{odds.b}</span>
            </>
          ) : null}
        </span>
        <span className="row tight"><Flag code={B.country} /> {countryOf(B.country).name}</span>
      </div>
      {open && <BoutPreview w={w} b={b} />}
    </div>
  );
}

export function BoutPreview({ w, b, tape = true }: { w: World; b: Bout; tape?: boolean }) {
  const A = w.fighters[b.a];
  const B = w.fighters[b.b];
  const pv = preview(w, b);
  const h2h = headToHead(w, b.a, b.b).filter((x) => x.id !== b.id);
  const report = b.status === "done" ? reportOf(w, b) : null;
  if (b.status === "done") {
    return (
      <div className="expand">
        {report ? (
          <FightReport data={report} />
        ) : (
          <p className="small dim">
            {b.res?.rcards?.length ? <>Scorecards: {b.res.rcards.map((r, i) => `R${i + 1} ${r.join(", ")}`).join(" · ")}. </> : null}
            Round-by-round numbers are kept for six months for small shows, and for good on the big stages, in title fights and in your own fights.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="expand">
      <div className="grid">
        {tape && <div className="c6">
          <div className="label" style={{ marginBottom: 6 }}>Tale of the tape</div>
          <div className="versus"><div className="l">{boutRecord(w, A, b)}</div><div className="m">Record</div><div className="r">{boutRecord(w, B, b)}</div></div>
          <div className="versus"><div className="l small">{styleLabel(A)}</div><div className="m">Styles</div><div className="r small">{styleLabel(B)}</div></div>
          <Versus label="Height (in)" a={A.height} b={B.height} higher="none" />
          <Versus label="Reach (in)" a={A.reach} b={B.reach} />
          <Versus label="Striking" a={groupScore(A.attrs, "striking")} b={groupScore(B.attrs, "striking")} fmt={(v) => v.toFixed(1)} />
          <Versus label="Grappling" a={groupScore(A.attrs, "grappling")} b={groupScore(B.attrs, "grappling")} fmt={(v) => v.toFixed(1)} />
          <Versus label="Win streak" a={Math.max(0, A.streak)} b={Math.max(0, B.streak)} />
        </div>}
        <div className={tape ? "c6" : "c12"}>
          <div className="label" style={{ marginBottom: 6 }}>Preview</div>
          <p className="small"><b>{pv.summary}</b>{b.odds !== undefined ? ` Implied chances ${Math.round(b.odds * 100)}% to ${Math.round((1 - b.odds) * 100)}%.` : ""}</p>
          <div className="keys">
            <div><h5>Keys for {A.surname}</h5><ul>{pv.keys[0].map((k, i) => <li key={i}>{k}</li>)}</ul></div>
            <div><h5>Keys for {B.surname}</h5><ul>{pv.keys[1].map((k, i) => <li key={i}>{k}</li>)}</ul></div>
          </div>
          {h2h.length > 0 && (
            <p className="small" style={{ marginTop: 10 }}>
              <b>History:</b> {h2h.map((x) => `${w.fighters[x.res?.winner === "a" ? x.a : x.b]?.surname ?? ""} won by ${x.res ? methodText(x.res.method, x.res.detail).toLowerCase() : ""} (${fmtDate(x.day)})`).join("; ")}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export { moneyline };
