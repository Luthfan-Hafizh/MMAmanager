import { useState } from "react";
import { ageYears, fmtDate, clock } from "../../core/time";
import { cmOf, heightText, kgOf, money } from "../../core/util";
import { countryOf } from "../../data/countries";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS } from "../../data/promotions";
import { ARTS } from "../../data/styles";
import { MASTERY_NAMES, TECHNIQUES, TECH_IDS, type TechId } from "../../data/techniques";
import { groupScore, ovr, ovrBand, styleOf } from "../../model/attributes";
import type { Bout, Fighter, World } from "../../model/types";
import { methodText } from "../../engine/sim";
import { boutsOf, fullName, rankLabel, recordText, resultFor, amRecordText } from "../../world/core";
import { potentialText, primeText } from "../../world/development";
import { useWorld } from "../../state/store";
import { Link } from "../router";
import { AttrGrid, Empty, FighterLink, Flag, Form, Ovr, Panel, PromoBadge, Stars, Tabs } from "../components";

type Tab = "overview" | "fights" | "stats" | "techniques";

export function FighterPage({ id, tab }: { id: string; tab?: string }) {
  const w = useWorld();
  const f = w.fighters[id];
  const [t, setT] = useState<Tab>((tab as Tab) ?? "overview");
  if (!f) return <Empty title="Fighter not found" />;
  return (
    <div className="stack">
      <Hero w={w} f={f} />
      <Tabs<Tab> value={t} onChange={setT} tabs={[{ id: "overview", label: "Overview" }, { id: "fights", label: "Fight history" }, { id: "stats", label: "Statistics" }, { id: "techniques", label: "Techniques" }]} />
      {t === "overview" && <Overview w={w} f={f} />}
      {t === "fights" && <History w={w} f={f} />}
      {t === "stats" && <Stats w={w} f={f} />}
      {t === "techniques" && <Techniques f={f} />}
    </div>
  );
}

function Hero({ w, f }: { w: World; f: Fighter }) {
  const o = ovr(f.attrs);
  const rank = rankLabel(w, f);
  const div = DIVISIONS[f.div];
  const r = f.rec;
  const wins = Math.max(1, r.w);
  return (
    <div className="hero">
      <div className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 18 }}>
        <div style={{ minWidth: 0 }}>
          <div className="name">
            <small>
              {rank === "C" ? `${PROMOTIONS[f.promo!].short} champion · ` : rank === "IC" ? "Interim champion · " : rank ? `${rank} · ` : ""}
              {div.name}
              {f.status === "retired" ? " · Retired" : ""}
            </small>
            {f.first}
            {f.nick ? <span className="dim" style={{ fontSize: 22, display: "block" }}>"{f.nick}"</span> : " "}
            {f.surname}
          </div>
          <div className="facts">
            <span className="row tight"><Flag code={f.country} lg /> <b>{countryOf(f.country).name}</b></span>
            <span>Hometown <b>{f.hometown}</b></span>
            <span>Age <b>{ageYears(f.birth, w.day)}</b></span>
            <span>Ht <b>{heightText(f.height)}</b> ({cmOf(f.height)} cm)</span>
            <span>Reach <b>{f.reach}"</b></span>
            <span>Walks around <b>{f.walk} lb</b> ({kgOf(f.walk)} kg)</span>
            <span>Stance <b>{f.stance}</b></span>
            <span>Base <b>{ARTS[f.base].name}</b></span>
            <span>Team <b>{w.gyms[f.gym]?.name ?? "-"}</b></span>
            <span className="row tight">{<PromoBadge p={f.promo} />}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 20, alignItems: "stretch" }}>
          <div className="panel" style={{ padding: "12px 16px", minWidth: 200 }}>
            <div className="tiny dim up disp">Pro record</div>
            <div className="big">{recordText(f)}</div>
            <div className="small" style={{ marginTop: 6, display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "2px 10px" }}>
              <span className="dim">(T)KO</span><b>{r.koW}-{r.koL}</b><span className="dim">{Math.round((r.koW / wins) * 100)}% of wins</span>
              <span className="dim">Sub</span><b>{r.subW}-{r.subL}</b><span className="dim">{Math.round((r.subW / wins) * 100)}%</span>
              <span className="dim">Dec</span><b>{r.decW}-{r.decL}</b><span className="dim">{Math.round((r.decW / wins) * 100)}%</span>
            </div>
            {(f.am.w + f.am.l) > 0 && <div className="tiny dim" style={{ marginTop: 6 }}>Amateur {amRecordText(f)}</div>}
          </div>
          <div className="panel" style={{ padding: "12px 16px", minWidth: 170 }}>
            <div className="tiny dim up disp">Rating</div>
            <div className="row" style={{ marginTop: 6 }}>
              <Ovr v={o} />
              <div>
                <Stars v={o} />
                <div className="small">{ovrBand(o)}</div>
              </div>
            </div>
            <div className="small dim" style={{ marginTop: 8 }}>{styleOf(f.attrs)} · {primeText(f, w.day)}</div>
            <div className="small dim">{f.ctrl ? potentialText(f, 1) : potentialText(f, 0.5)}</div>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <Form w={w} f={f} n={10} />
        {f.streak !== 0 && <span className={`badge ${f.streak > 0 ? "good" : "bad"}`}>{Math.abs(f.streak)} {f.streak > 0 ? "win" : "loss"}{Math.abs(f.streak) > 1 ? (f.streak > 0 ? "s" : "es") : ""} in a row</span>}
        {f.reigns > 0 && <span className="badge gold">{f.reigns} title reign{f.reigns > 1 ? "s" : ""}</span>}
        {f.tags?.includes("dwcs") && <span className="badge info">Contender Series</span>}
        <span className="small dim">Popularity {Math.round(f.pop)}</span>
      </div>
    </div>
  );
}

function Overview({ w, f }: { w: World; f: Fighter }) {
  const bouts = boutsOf(w, f).filter((b) => b.status === "done").slice(-5).reverse();
  const nextB = f.booked ? w.bouts[f.booked] : null;
  return (
    <div className="grid">
      <div className="c8">
        <Panel title="Attributes" hint="1-20, the way management games rate players">
          <AttrGrid f={f} />
        </Panel>
      </div>
      <div className="c4 stack">
        <Panel title="Strengths">
          <Profile f={f} />
        </Panel>
        {nextB && nextB.status === "booked" && !nextB.pending && (
          <Panel title="Next fight">
            <div className="row">
              vs <FighterLink w={w} id={nextB.a === f.id ? nextB.b : nextB.a} rank />
            </div>
            <div className="small dim" style={{ marginTop: 4 }}>
              <Link to={`/event/${nextB.ev}`}>{w.events[nextB.ev]?.name}</Link> · {fmtDate(nextB.day)}
            </div>
          </Panel>
        )}
        <Panel title="Last fights" flush>
          {bouts.length ? bouts.map((b) => <MiniBout key={b.id} w={w} b={b} f={f} />) : <Empty title="No fights in this world yet">The record above was built before October 2026.</Empty>}
        </Panel>
      </div>
    </div>
  );
}

function Profile({ f }: { f: Fighter }) {
  const st = groupScore(f.attrs, "striking");
  const gr = groupScore(f.attrs, "grappling");
  const ph = groupScore(f.attrs, "physical");
  const me = groupScore(f.attrs, "mental");
  const sorted = (Object.entries(f.attrs) as [string, number][]).sort((a, b) => b[1] - a[1]);
  const best = sorted.slice(0, 3).map(([k]) => k);
  const worst = sorted.slice(-3).map(([k]) => k);
  const name = (k: string) => k.replace(/([A-Z])/g, " $1").toLowerCase().replace("tdd", "takedown defence").replace("sub def", "submission defence").replace("subs", "submissions");
  const row = (label: string, v: number) => (
    <div>
      <div className="spread small"><span className="dim">{label}</span><b>{v.toFixed(1)}</b></div>
      <div className="bar thin"><i style={{ width: `${(v / 20) * 100}%`, background: v >= 15 ? "var(--a-great)" : v >= 12 ? "var(--a-good)" : v >= 9 ? "var(--a-fair)" : "var(--a-weak)" }} /></div>
    </div>
  );
  return (
    <div className="stack" style={{ gap: 8 }}>
      {row("Striking", st)}
      {row("Grappling", gr)}
      {row("Physical", ph)}
      {row("Mental", me)}
      <div className="small" style={{ marginTop: 4 }}>
        <span className="good">Best:</span> {best.map(name).join(", ")}
        <br />
        <span className="bad">Weakest:</span> {worst.map(name).join(", ")}
      </div>
    </div>
  );
}

function MiniBout({ w, b, f }: { w: World; b: Bout; f: Fighter }) {
  const r = resultFor(b, f.id);
  const opp = b.a === f.id ? b.b : b.a;
  return (
    <div className="list-row">
      <span className="form"><i className={r ?? "D"}>{r === "NC" ? "N" : r}</i></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <FighterLink w={w} id={opp} />
        <div className="tiny dim">{b.res ? `${methodText(b.res.method, b.res.detail)}${b.res.method !== "DEC" ? `, R${b.res.round} ${clock(b.res.time)}` : ""}` : ""}</div>
      </div>
      <Link to={`/event/${b.ev}`} className="tiny dim nowrap">{fmtDate(b.day)}</Link>
    </div>
  );
}

function History({ w, f }: { w: World; f: Fighter }) {
  const bouts = boutsOf(w, f).filter((b) => b.status === "done").reverse();
  return (
    <Panel title="Fight history" hint={`${bouts.length} fights in this world · record before 5 Oct 2026 not itemised`} flush>
      {bouts.length === 0 ? (
        <Empty title="No fights yet" />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Res</th><th>Opponent</th><th>Method</th><th className="c">Rd</th><th className="c">Time</th><th>Event</th><th>Date</th></tr>
            </thead>
            <tbody>
              {bouts.map((b) => {
                const r = resultFor(b, f.id);
                const opp = b.a === f.id ? b.b : b.a;
                const ev = w.events[b.ev];
                return (
                  <tr key={b.id}>
                    <td><span className="form"><i className={r ?? "D"}>{r === "NC" ? "N" : r}</i></span></td>
                    <td><FighterLink w={w} id={opp} /> {b.kind === "title" || b.kind === "vacant" ? <span className="badge gold">Title</span> : b.kind === "interim" ? <span className="badge gold">Interim</span> : null}</td>
                    <td>{b.res ? methodText(b.res.method, b.res.detail) : ""}</td>
                    <td className="c">{b.res?.round}</td>
                    <td className="c">{b.res ? clock(b.res.time) : ""}</td>
                    <td><Link to={`/event/${b.ev}`}>{ev?.name}</Link> <span className="dim small">{PROMOTIONS[b.promo].short}</span></td>
                    <td className="nowrap">{fmtDate(b.day)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Stats({ w, f }: { w: World; f: Fighter }) {
  const s = f.stats;
  const mins = s.secs / 60 || 1;
  const per15 = (v: number) => ((v / s.secs) * 900).toFixed(2);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
  const landed = s.head + s.body + s.leg || 1;
  const pos = s.dist + s.clinch + s.ground || 1;
  const o = f.official;
  return (
    <div className="grid">
      <div className="c8">
        <Panel title="In this world" hint={`${s.fights} fights · ${Math.round(mins)} minutes`}>
          {s.fights === 0 ? (
            <Empty title="No fights yet" />
          ) : (
            <div className="stat-tiles">
              <div className="tile"><div className="k">Sig. strikes landed / min</div><div className="v">{(s.sigL / mins).toFixed(2)}</div></div>
              <div className="tile"><div className="k">Striking accuracy</div><div className="v">{pct(s.sigL, s.sigA)}</div></div>
              <div className="tile"><div className="k">Absorbed / min</div><div className="v">{(s.sigAbs / mins).toFixed(2)}</div></div>
              <div className="tile"><div className="k">Striking defence</div><div className="v">{pct(s.sigAbsA - s.sigAbs, s.sigAbsA)}</div></div>
              <div className="tile"><div className="k">Takedowns / 15 min</div><div className="v">{per15(s.tdL)}</div></div>
              <div className="tile"><div className="k">Takedown accuracy</div><div className="v">{pct(s.tdL, s.tdA)}</div></div>
              <div className="tile"><div className="k">Takedown defence</div><div className="v">{pct(s.tdAbsA - s.tdAbs, s.tdAbsA)}</div></div>
              <div className="tile"><div className="k">Submissions / 15 min</div><div className="v">{per15(s.subA)}</div></div>
              <div className="tile"><div className="k">Knockdowns</div><div className="v">{s.kd}</div><div className="s">{s.kdAbs} suffered</div></div>
              <div className="tile"><div className="k">Control time</div><div className="v">{clock(s.ctrl)}</div><div className="s">{clock(s.ctrl / Math.max(1, s.fights))} a fight</div></div>
              <div className="tile"><div className="k">Target</div><div className="v small" style={{ fontSize: 16 }}>{Math.round((s.head / landed) * 100)} / {Math.round((s.body / landed) * 100)} / {Math.round((s.leg / landed) * 100)}</div><div className="s">head / body / legs, %</div></div>
              <div className="tile"><div className="k">Position</div><div className="v" style={{ fontSize: 16 }}>{Math.round((s.dist / pos) * 100)} / {Math.round((s.clinch / pos) * 100)} / {Math.round((s.ground / pos) * 100)}</div><div className="s">distance / clinch / ground, %</div></div>
            </div>
          )}
        </Panel>
      </div>
      <div className="c4">
        <Panel title="Official UFC statistics" hint="before October 2026">
          {o ? (
            <dl className="kv">
              <dt>Sig. strikes landed / min</dt><dd>{o.slpm}</dd>
              <dt>Sig. strikes absorbed / min</dt><dd>{o.sapm}</dd>
              <dt>Striking accuracy</dt><dd>{o.acc}%</dd>
              <dt>Striking defence</dt><dd>{o.def}%</dd>
              <dt>Takedowns / 15 min</dt><dd>{o.td}</dd>
              <dt>Takedown defence</dt><dd>{o.tdDef}%</dd>
              <dt>Submissions / 15 min</dt><dd>{o.sub}</dd>
              <dt>Knockdowns / 15 min</dt><dd>{o.kd}</dd>
            </dl>
          ) : (
            <Empty title="No official numbers">Only fighters on the UFC roster in October 2026 have them.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Techniques({ f }: { f: Fighter }) {
  const known = TECH_IDS.filter((t) => (f.tech[t] ?? 0) > 0);
  return (
    <Panel title="Signature techniques" hint={`${known.length} known`} flush>
      {known.length === 0 ? (
        <Empty title="No signature techniques yet">Drill them on the Training page.</Empty>
      ) : (
        <table className="tbl">
          <thead>
            <tr><th>Technique</th><th>Group</th><th>Level</th><th>What it does</th></tr>
          </thead>
          <tbody>
            {known.map((t: TechId) => (
              <tr key={t}>
                <td><b>{TECHNIQUES[t].name}</b> {TECHNIQUES[t].exclusive && <span className="badge info">Signature</span>}</td>
                <td>{TECHNIQUES[t].group}</td>
                <td><span className="stars">{"★".repeat(f.tech[t] ?? 0)}<span className="off">{"★".repeat(3 - (f.tech[t] ?? 0))}</span></span> <span className="small dim">{MASTERY_NAMES[f.tech[t] ?? 0]}</span></td>
                <td className="small muted">{TECHNIQUES[t].desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export { money, fullName };
