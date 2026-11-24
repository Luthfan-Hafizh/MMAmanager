import { useState } from "react";
import { ageYears, fmtDate, clock } from "../../core/time";
import { cmOf, heightText } from "../../core/util";
import { countryOf } from "../../data/countries";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS, PROMO_IDS } from "../../data/promotions";
import { ARTS } from "../../data/styles";
import { MASTERY_NAMES, TECHNIQUES, TECH_IDS, type TechId } from "../../data/techniques";
import { groupScore, ovr, ovrBand, styleOf } from "../../model/attributes";
import type { Bout, Fighter, World } from "../../model/types";
import { methodText } from "../../engine/sim";
import { beltNote, isBeltFight, stakeLabel } from "../../world/belts";
import { boutsOf, isChampion, rankLabel, recordText, resultFor, amRecordText } from "../../world/core";
import { potentialText, primeText } from "../../world/development";
import { changed, toast, useWorld } from "../../state/store";
import { retirePlayer } from "../../career/retire";
import { go, Link } from "../router";
import { AttrGrid, Empty, FighterLink, Flag, Form, Panel, Stars, Tabs } from "../components";
import { Band, BodyTarget, Donut, Mark } from "../art";
import { goatRank, legacyText } from "../../world/legacy";
import { headToHead } from "../../world/odds";

type Tab = "overview" | "fights" | "stats" | "techniques";

export function FighterPage({ id, tab }: { id: string; tab?: string }) {
  const w = useWorld();
  const f = w.fighters[id];
  const [t, setT] = useState<Tab>((tab as Tab) ?? "overview");
  if (!f) return <div className="wrap page-body"><Empty title="Fighter not found" /></div>;
  return (
    <>
      <Hero w={w} f={f} tabs={<Tabs<Tab> value={t} onChange={setT} tabs={[{ id: "overview", label: "Overview" }, { id: "stats", label: "Stats & records" }, { id: "fights", label: "Fight history" }, { id: "techniques", label: "Techniques" }]} />} />
      {t === "stats" ? (
        <Stats w={w} f={f} />
      ) : (
        <div className="wrap page-body">
          {t === "overview" && <Overview w={w} f={f} />}
          {t === "fights" && <History w={w} f={f} />}
          {t === "techniques" && <Techniques f={f} />}
        </div>
      )}
    </>
  );
}

function Hero({ w, f, tabs }: { w: World; f: Fighter; tabs: React.ReactNode }) {
  const o = ovr(f.attrs);
  const rank = rankLabel(w, f);
  const div = DIVISIONS[f.div];
  const r = f.rec;
  const champ = isChampion(w, f);
  const firstRound = boutsOf(w, f).filter((b) => b.res && b.res.round === 1 && b.res.method !== "DEC" && resultFor(b, f.id) === "W").length;
  return (
    <Band
      eyebrow={
        <>
          {rank === "C" ? <span className="tag gold">Champion</span> : rank === "IC" ? <span className="tag gold">Interim champion</span> : rank ? <span className="tag red">{rank} {div.short}</span> : null}
          <span className="tag">{div.name}</span>
          <span className="tag">{f.status === "retired" ? "Retired" : f.promo ? PROMOTIONS[f.promo].short : "Free agent"}</span>
          {w.promos.ufc?.bmf?.holder === f.id && <span className="tag bmf">BMF</span>}
          {f.ctrl && <span className="tag red">Your fighter</span>}
          {f.tags?.includes("dwcs") && <span className="tag">Contender Series</span>}
        </>
      }
      first={<>{f.nick ? `"${f.nick}"` : f.first}</>}
      title={f.nick ? `${f.first} ${f.surname}` : f.surname}
      word={f.surname}
      right={
        <Mark gold={champ} label={rank === "C" ? "Champion" : rank === "IC" ? "Interim champion" : rank ? `${div.name} rank` : "Overall rating"} sub={`${rank ? `Overall ${o} · ` : ""}Legacy ${Math.round(f.legacy ?? 0)}${goatRank(w, f) ? ` · #${goatRank(w, f)} all-time` : ""}`}>
          {rank === "C" ? "C" : rank || o}
        </Mark>
      }
      tabs={tabs}
    >
      <div className="factgrid">
        <div><div className="k">Country</div><div className="v row tight"><Flag code={f.country} /> {countryOf(f.country).name}</div></div>
        <div><div className="k">Hometown</div><div className="v">{f.hometown}</div></div>
        <div><div className="k">Age</div><div className="v">{ageYears(f.birth, w.day)}</div></div>
        <div><div className="k">Height / reach</div><div className="v">{heightText(f.height)} ({cmOf(f.height)} cm) / {f.reach}"</div></div>
        <div><div className="k">Stance / base</div><div className="v">{f.stance.replace(/^./, (c) => c.toUpperCase())} / {ARTS[f.base].name}</div></div>
        <div><div className="k">Team</div><div className="v ellip">{w.gyms[f.gym]?.name ?? "-"}</div></div>
      </div>
      <div className="bignums">
        <div><div className="n">{recordText(f)}</div><div className="k">Pro record (W-L-D)</div></div>
        <div><div className="n">{r.koW}</div><div className="k">Wins by knockout</div></div>
        <div><div className="n">{r.subW}</div><div className="k">Wins by submission</div></div>
        <div><div className="n">{firstRound}</div><div className="k">First-round finishes here</div></div>
        <div><div className="n">{o}</div><div className="k">{ovrBand(o)}</div></div>
      </div>
    </Band>
  );
}

function Overview({ w, f }: { w: World; f: Fighter }) {
  const bouts = boutsOf(w, f).filter((b) => b.status === "done").slice(-5).reverse();
  const nextB = f.booked ? w.bouts[f.booked] : null;
  const r = f.rec;
  const wins = Math.max(1, r.w);
  return (
    <div className="grid">
      <div className="c8 stack">
        <section className="sec">
          <div className="sec-h"><h2>Attributes</h2><span className="hint">1 to 20, as management games rate them</span></div>
          <div className="panel"><div className="panel-b"><AttrGrid f={f} /></div></div>
        </section>
        <section className="sec">
          <div className="sec-h"><h2>Last fights</h2><div className="acts"><span className="dim small">Record before 5 Oct 2026 not itemised</span></div></div>
          <div className="panel">
            {bouts.length ? bouts.map((b) => <MiniBout key={b.id} w={w} b={b} f={f} />) : <Empty title="No fights in this world yet" />}
          </div>
        </section>
      </div>
      <div className="c4 stack">
        <Panel title="Record">
          <div className="recbox" style={{ borderColor: "var(--line)", background: "var(--sheet-2)" }}>
            <div style={{ borderColor: "var(--line)" }}><div className="label">W-L-D</div><div className="num" style={{ fontSize: 26 }}>{recordText(f)}</div></div>
            <div style={{ borderColor: "var(--line)" }}><div className="label">(T)KO</div><div className="num" style={{ fontSize: 26 }}>{r.koW}-{r.koL}</div></div>
            <div style={{ borderColor: "var(--line)" }}><div className="label">Sub</div><div className="num" style={{ fontSize: 26 }}>{r.subW}-{r.subL}</div></div>
            <div style={{ borderColor: "var(--line)" }}><div className="label">Dec</div><div className="num" style={{ fontSize: 26 }}>{r.decW}-{r.decL}</div></div>
          </div>
          <div className="stack" style={{ gap: 4, marginTop: 14 }}>
            <MethodRow label="KO/TKO" n={r.koW} total={wins} />
            <MethodRow label="Sub" n={r.subW} total={wins} />
            <MethodRow label="Dec" n={r.decW} total={wins} />
          </div>
          {(f.am.w + f.am.l) > 0 && <p className="small dim" style={{ marginTop: 10 }}>Amateur record {amRecordText(f)}</p>}
          <div className="row" style={{ marginTop: 8 }}><Form w={w} f={f} n={8} /></div>
        </Panel>
        <Panel title="Scouting">
          <Profile f={f} />
          <hr className="sep" />
          <div className="small">
            <div className="spread"><span className="label">Rating</span><span className="row tight"><Stars v={ovr(f.attrs)} /> {ovrBand(ovr(f.attrs))}</span></div>
            <div className="spread" style={{ marginTop: 6 }}><span className="label">Outlook</span><span>{potentialText(f, w.day, f.ctrl ? 1 : 0.5)}</span></div>
            <div className="spread" style={{ marginTop: 6 }}><span className="label">Career stage</span><span>{primeText(f, w.day)}</span></div>
            <div className="spread" style={{ marginTop: 6 }}><span className="label">Popularity</span><span>{Math.round(f.pop)}/100</span></div>
          </div>
        </Panel>
        <Rivals w={w} f={f} />
        {f.ctrl && w.career.mode === "fighter" && f.status === "active" && (
          <Panel title="The end">
            <p className="small muted">Retire whenever you choose. The team will say when they think it's time; nobody makes you stop.</p>
            <button className="btn danger sm" onClick={() => { if (confirm(`Retire ${f.first} ${f.surname}? This ends the fighting career.`)) { toast(retirePlayer(w, f)); changed(); go("/home"); } }}>Retire from MMA</button>
          </Panel>
        )}
        {nextB && nextB.status === "booked" && !nextB.pending && (
          <Panel title="Next fight" className="accent">
            <div className="row">vs <FighterLink w={w} id={nextB.a === f.id ? nextB.b : nextB.a} rank /></div>
            <div className="small dim" style={{ marginTop: 4 }}><Link to={`/event/${nextB.ev}`}>{w.events[nextB.ev]?.name}</Link> · {fmtDate(nextB.day)}</div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Rivals({ w, f }: { w: World; f: Fighter }) {
  const met = new Map<string, { w: number; l: number; d: number }>();
  for (const id of f.bouts) {
    const b = w.bouts[id];
    if (!b || b.status !== "done") continue;
    const opp = b.a === f.id ? b.b : b.a;
    const r = resultFor(b, f.id);
    const cur = met.get(opp) ?? { w: 0, l: 0, d: 0 };
    if (r === "W") cur.w++;
    else if (r === "L") cur.l++;
    else cur.d++;
    met.set(opp, cur);
  }
  const rows = [...met.entries()].filter(([, v]) => v.w + v.l + v.d > 1 || v.l > 0).slice(-6).reverse();
  if (!rows.length) return null;
  return (
    <Panel title="Rivals" hint="head to head" flush>
      {rows.map(([id, v]) => (
        <div key={id} className="list-row">
          <div style={{ flex: 1, minWidth: 0 }}><FighterLink w={w} id={id} rank /></div>
          <b className="num" style={{ fontSize: 18 }}>{v.w}-{v.l}{v.d ? `-${v.d}` : ""}</b>
        </div>
      ))}
    </Panel>
  );
}

function MethodRow({ label, n, total }: { label: string; n: number; total: number }) {
  return (
    <div className="methodrow">
      <b>{label}</b>
      <div className="bar"><i style={{ width: `${(n / total) * 100}%`, background: "var(--red)" }} /></div>
      <span className="right small">{n} ({Math.round((n / total) * 100)}%)</span>
    </div>
  );
}

function Profile({ f }: { f: Fighter }) {
  const groups: [string, number][] = [
    ["Striking", groupScore(f.attrs, "striking")],
    ["Grappling", groupScore(f.attrs, "grappling")],
    ["Physical", groupScore(f.attrs, "physical")],
    ["Mental", groupScore(f.attrs, "mental")],
  ];
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="spread"><span className="label">Style</span><b className="disp up" style={{ fontSize: 17 }}>{styleOf(f.attrs)}</b></div>
      {groups.map(([k, v]) => (
        <div key={k}>
          <div className="spread small"><span className="label">{k}</span><b className="num" style={{ fontSize: 18 }}>{v.toFixed(1)}</b></div>
          <div className="bar thin"><i style={{ width: `${(v / 20) * 100}%`, background: "var(--ink)" }} /></div>
        </div>
      ))}
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
        <FighterLink w={w} id={opp} rank />
        <div className="tiny dim">{b.res ? `${methodText(b.res.method, b.res.detail)}${b.res.method !== "DEC" ? `, R${b.res.round} ${clock(b.res.time)}` : ""}` : ""}</div>
      </div>
      <Link to={`/event/${b.ev}`} className="tiny dim nowrap">{w.events[b.ev]?.name} · {fmtDate(b.day)}</Link>
    </div>
  );
}

/** Every belt a fighter has held in this world (and the real ones before it), with the BMF. */
function Belts({ w, f }: { w: World; f: Fighter }) {
  const rows: { belt: string; interim: boolean; bmf?: boolean; won: number; lost?: number; how: string; ended?: string; defenses: number; to: string }[] = [];
  for (const id of PROMO_IDS) {
    for (const r of w.promos[id].reigns) {
      if (r.fighter !== f.id) continue;
      rows.push({ belt: `${PROMOTIONS[id].short} ${DIVISIONS[r.div].name}`, interim: !!r.interim, won: r.won, lost: r.lost, how: r.how, ended: r.ended, defenses: r.defenses, to: `/titles/${id}/${r.div}` });
    }
  }
  for (const r of w.promos.ufc?.bmf?.reigns ?? []) {
    if (r.fighter === f.id) rows.push({ belt: "UFC BMF", interim: false, bmf: true, won: r.won, lost: r.lost, how: "won", ended: r.ended, defenses: r.defenses, to: "/titles/ufc/bmf" });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => b.won - a.won);
  const ENDED: Record<string, string> = { lost: "Lost it", vacated: "Vacated", stripped: "Stripped", retired: "Retired", moved: "Left", unified: "Unified", injury: "Vacated (injury)" };
  return (
    <section className="sec">
      <div className="sec-h"><h2>Belts</h2><span className="hint">{rows.length} reign{rows.length === 1 ? "" : "s"}</span></div>
      <div className="panel">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Belt</th><th>Won</th><th>Until</th><th>How it ended</th><th className="c">Defences</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.lost === undefined ? "hl" : ""}>
                  <td><Link to={r.to}><b>{r.belt}</b></Link> {r.bmf ? <span className="badge bmf">BMF</span> : r.interim ? <span className="badge">Interim</span> : <span className="badge gold">Champion</span>}</td>
                  <td className="nowrap">{fmtDate(r.won)}</td>
                  <td className="nowrap">{r.lost === undefined ? <b>Current</b> : fmtDate(r.lost)}</td>
                  <td className={`small${r.ended === "stripped" ? " bad" : ""}`}>{r.lost === undefined ? "" : ENDED[r.ended ?? ""] ?? r.ended ?? ""}</td>
                  <td className="c"><b className="num">{r.defenses}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function History({ w, f }: { w: World; f: Fighter }) {
  const bouts = boutsOf(w, f).filter((b) => b.status === "done").reverse();
  return (
    <>
    <Belts w={w} f={f} />
    <section className="sec">
      <div className="sec-h"><h2>Fight history</h2><span className="hint">{bouts.length} fights in this world</span></div>
      <div className="panel">
        {bouts.length === 0 ? (
          <Empty title="No fights yet" />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Opponent</th><th>Res.</th><th>Decision</th><th className="c">Rnd</th><th className="c">Time</th><th>Stakes</th><th>Event</th></tr></thead>
              <tbody>
                {bouts.map((b) => {
                  const r = resultFor(b, f.id);
                  const opp = b.a === f.id ? b.b : b.a;
                  return (
                    <tr key={b.id}>
                      <td className="nowrap">{fmtDate(b.day)}</td>
                      <td><FighterLink w={w} id={opp} />{b.shortNotice && b.sub === f.id ? <span className="tiny dim"> · short notice</span> : null}</td>
                      <td><span className="form"><i className={r ?? "D"}>{r === "NC" ? "N" : r}</i></span></td>
                      <td>{b.res ? methodText(b.res.method, b.res.detail) : ""}</td>
                      <td className="c">{b.res?.round}</td>
                      <td className="c">{b.res ? clock(b.res.time) : ""}</td>
                      <td>
                        {stakeLabel(b) ? <span className={`badge ${b.kind === "bmf" ? "bmf" : isBeltFight(b) ? "gold" : ""}`}>{stakeLabel(b)}</span> : <span className="dim">-</span>}
                        {beltNote(b, f.id) ? <div className="tiny" style={{ marginTop: 3 }}>{beltNote(b, f.id)}</div> : null}
                      </td>
                      <td><Link to={`/event/${b.ev}`}>{w.events[b.ev]?.name}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
    </>
  );
}

function Stats({ w, f }: { w: World; f: Fighter }) {
  const s = f.stats;
  const o = f.official;
  const mins = s.secs / 60;
  const has = s.fights > 0;
  const per15 = (v: number) => (s.secs ? ((v / s.secs) * 900).toFixed(2) : "0.00");
  const strAcc = has && s.sigA ? s.sigL / s.sigA : o ? o.acc / 100 : 0;
  const tdAcc = has && s.tdA ? s.tdL / s.tdA : 0;
  const useOfficial = !has && !!o && o.stand !== undefined;
  const P = useOfficial ? { dist: o!.stand ?? 0, clinch: o!.clinch ?? 0, ground: o!.ground ?? 0 } : { dist: s.dist, clinch: s.clinch, ground: s.ground };
  const Tg = useOfficial ? { head: o!.head ?? 0, body: o!.body ?? 0, leg: o!.leg ?? 0 } : { head: s.head, body: s.body, leg: s.leg };
  const pos = P.dist + P.clinch + P.ground || 1;
  const r = f.rec;
  const wins = Math.max(1, r.w);
  return (
    <>
      <div className="statsband">
        <div className="wrap">
          <div className="sec-h"><h2>Stats &amp; records</h2><span className="hint" style={{ color: "var(--band-ink-3)" }}>{has ? `${s.fights} fights and ${Math.round(mins)} minutes in this world` : o ? "Official UFC numbers before October 2026" : "No fights recorded yet"}</span></div>
          <div className="grid">
            <div className="c6 statcard">
              <h4>Striking accuracy</h4>
              <div className="donut-wrap">
                <Donut value={strAcc} />
                <div><div className="big">{Math.round(strAcc * 100)}%</div><div className="small dim">{has ? `${s.sigL} landed of ${s.sigA}` : "official"}</div></div>
              </div>
            </div>
            <div className="c6 statcard">
              <h4>Takedown accuracy</h4>
              <div className="donut-wrap">
                <Donut value={tdAcc} />
                <div><div className="big">{has ? `${Math.round(tdAcc * 100)}%` : "-"}</div><div className="small dim">{has ? `${s.tdL} landed of ${s.tdA}` : "no data yet"}</div></div>
              </div>
            </div>
            <div className="c6 statcard">
              <div className="pairs">
                <div><div className="v">{has ? (s.sigL / mins).toFixed(2) : o?.slpm ?? "-"}</div><div className="k">Sig. str. landed per min</div></div>
                <div><div className="v">{has ? (s.sigAbs / mins).toFixed(2) : o?.sapm ?? "-"}</div><div className="k">Sig. str. absorbed per min</div></div>
                <div><div className="v">{has ? per15(s.tdL) : o?.td ?? "-"}</div><div className="k">Takedowns per 15 min</div></div>
                <div><div className="v">{has ? per15(s.subA) : o?.sub ?? "-"}</div><div className="k">Submissions per 15 min</div></div>
              </div>
            </div>
            <div className="c6 statcard">
              <div className="pairs">
                <div><div className="v">{has && s.sigAbsA ? `${Math.round(((s.sigAbsA - s.sigAbs) / s.sigAbsA) * 100)}%` : o ? `${o.def}%` : "-"}</div><div className="k">Striking defence</div></div>
                <div><div className="v">{has && s.tdAbsA ? `${Math.round(((s.tdAbsA - s.tdAbs) / s.tdAbsA) * 100)}%` : o ? `${o.tdDef}%` : "-"}</div><div className="k">Takedown defence</div></div>
                <div><div className="v">{has ? s.kd : o?.kd ?? "-"}</div><div className="k">{has ? "Knockdowns" : "Knockdowns per 15"}</div></div>
                <div><div className="v">{has ? clock(s.secs / Math.max(1, s.fights)) : "-"}</div><div className="k">Average fight time</div></div>
              </div>
            </div>
            <div className="c4 statcard">
              <h4>Sig. str. by position</h4>
              {[["Standing", P.dist], ["Clinch", P.clinch], ["Ground", P.ground]].map(([k, v]) => (
                <div key={k as string} className="methodrow"><b>{k}</b><div className="bar"><i style={{ width: `${((v as number) / pos) * 100}%`, background: "var(--red)" }} /></div><span className="right small">{useOfficial ? `${v}%` : `${v} (${Math.round(((v as number) / pos) * 100)}%)`}</span></div>
              ))}
            </div>
            <div className="c4 statcard">
              <h4>Sig. str. by target</h4>
              <BodyTarget head={Tg.head} body={Tg.body} leg={Tg.leg} />
              {useOfficial && <p className="tiny dim" style={{ marginTop: 8 }}>Official UFC shares, in percent</p>}
            </div>
            <div className="c4 statcard">
              <h4>Win by method</h4>
              <MethodRow label="KO/TKO" n={r.koW} total={wins} />
              <MethodRow label="Dec" n={r.decW} total={wins} />
              <MethodRow label="Sub" n={r.subW} total={wins} />
            </div>
          </div>
        </div>
      </div>
      <div className="wrap" style={{ paddingBottom: 48 }} />
    </>
  );
}

function Techniques({ f }: { f: Fighter }) {
  const known = TECH_IDS.filter((t) => (f.tech[t] ?? 0) > 0);
  return (
    <section className="sec">
      <div className="sec-h"><h2>Signature techniques</h2><span className="hint">{known.length} known</span></div>
      <div className="panel">
        {known.length === 0 ? (
          <Empty title="No signature techniques yet">Drill them on the Training page.</Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>Technique</th><th>Group</th><th>Level</th><th>What it does</th></tr></thead>
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
      </div>
    </section>
  );
}
