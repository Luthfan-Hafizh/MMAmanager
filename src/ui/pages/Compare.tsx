// Any two fighters side by side: the tale of the tape, the attributes, the records
// and form, the opponents they share, their history, and the odds from simulated fights.

import { useMemo, useState } from "react";
import { ageYears } from "../../core/time";
import { hashString } from "../../core/rng";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS } from "../../data/promotions";
import { ATTR_GROUPS, ATTR_INFO, GROUP_NAMES, ovr, type AttrGroup, type AttrKey } from "../../model/attributes";
import type { Bout, Fighter, World } from "../../model/types";
import { methodText, winChance } from "../../engine/sim";
import { FIGHT_STYLES } from "../../data/fightstyles";
import { fightStyle } from "../../world/fightstyle";
import { rankLabel, recordText, resultFor, fullName } from "../../world/core";
import { useWorld } from "../../state/store";
import { go, Link } from "../router";
import { Empty, Flag, Form, Panel } from "../components";
import { Band } from "../art";

const heightText = (inches: number) => `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`;

export function Compare({ a, b }: { a?: string; b?: string }) {
  const w = useWorld();
  const A = a ? w.fighters[a] : undefined;
  const B = b ? w.fighters[b] : undefined;
  const set = (side: "a" | "b", id: string) => go(`/compare/${side === "a" ? id : A?.id ?? "-"}/${side === "b" ? id : B?.id ?? "-"}`);
  return (
    <>
      <Band eyebrow="Head to head" title={A && B ? `${A.surname} vs ${B.surname}` : "Compare fighters"} sub="Any two fighters side by side: the tale of the tape, the attributes, the opponents they share, and the odds from sixty simulated fights." />
      <div className="wrap page-body">
        <div className="cmp-pick">
          <Picker w={w} label="Fighter one" value={A} onPick={(id) => set("a", id)} />
          <span className="cmp-vs">vs</span>
          <Picker w={w} label="Fighter two" value={B} onPick={(id) => set("b", id)} />
        </div>
        {A && B ? <Head w={w} A={A} B={B} /> : <div className="panel"><Empty title="Pick two fighters">Search by name: any fighter in the world, active or retired.</Empty></div>}
      </div>
    </>
  );
}

function Picker({ w, label, value, onPick }: { w: World; label: string; value?: Fighter; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return Object.values(w.fighters)
      .filter((f) => fullName(f).toLowerCase().includes(t))
      .sort((x, y) => Number(y.status === "active") - Number(x.status === "active") || y.pop - x.pop)
      .slice(0, 8);
  }, [q, w]);
  return (
    <div className="cmp-picker">
      <div className="label">{label}</div>
      {value && <div className="cmp-cur"><Flag code={value.country} /> <b>{value.first} {value.surname}</b> <span className="dim small">{recordText(value)}</span></div>}
      <input className="input" placeholder={value ? "Change…" : "Search by name"} aria-label={`${label}: search by name`} value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <ul className="cmp-hits" role="listbox" aria-label={`${label}: matches`}>
          {hits.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => { onPick(f.id); setQ(""); }}>
                <Flag code={f.country} /> {fullName(f)} <span className="dim small">{recordText(f)} · {DIVISIONS[f.div].short}{f.status === "retired" ? " · retired" : f.promo ? ` · ${PROMOTIONS[f.promo].short}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Head({ w, A, B }: { w: World; A: Fighter; B: Fighter }) {
  const fin = (f: Fighter) => (f.rec.w ? `${Math.round(((f.rec.koW + f.rec.subW) / f.rec.w) * 100)}%` : "–");
  const rank = (f: Fighter) => {
    const r = rankLabel(w, f);
    return r === "C" ? "Champion" : r ?? "Unranked";
  };
  const rows: [string, string, string, number?][] = [
    ["Record", recordText(A), recordText(B), A.rec.w - A.rec.l - (B.rec.w - B.rec.l)],
    ["Age", String(ageYears(A.birth, w.day)), String(ageYears(B.birth, w.day))],
    ["Height", heightText(A.height), heightText(B.height), A.height - B.height],
    ["Reach", `${A.reach}"`, `${B.reach}"`, A.reach - B.reach],
    ["Stance", cap(A.stance), cap(B.stance)],
    ["Division", DIVISIONS[A.div].name, DIVISIONS[B.div].name],
    ["Where", A.status === "retired" ? "Retired" : A.promo ? `${PROMOTIONS[A.promo].short}, ${rank(A)}` : "Free agent", B.status === "retired" ? "Retired" : B.promo ? `${PROMOTIONS[B.promo].short}, ${rank(B)}` : "Free agent"],
    ["Striking", FIGHT_STYLES[fightStyle(A).s].name, FIGHT_STYLES[fightStyle(B).s].name],
    ["Grappling", FIGHT_STYLES[fightStyle(A).g].name, FIGHT_STYLES[fightStyle(B).g].name],
    ["Overall", String(Math.round(ovr(A.attrs))), String(Math.round(ovr(B.attrs))), ovr(A.attrs) - ovr(B.attrs)],
    ["Finish rate", fin(A), fin(B)],
    ["Streak", streakText(A.streak), streakText(B.streak), A.streak - B.streak],
  ];
  return (
    <div className="stack">
      <div className="grid">
        <div className="c7">
          <Panel title="Tale of the tape" flush>
            <table className="tbl cmp-tape">
              <thead>
                <tr>
                  <th className="r"><Link to={`/fighter/${A.id}`}>{fullName(A)}</Link></th>
                  <th className="c" />
                  <th><Link to={`/fighter/${B.id}`}>{fullName(B)}</Link></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([k, x, y, d]) => (
                  <tr key={k}>
                    <td className={`r${d !== undefined && d > 0 ? " cmp-up" : ""}`}>{x}</td>
                    <td className="c label">{k}</td>
                    <td className={d !== undefined && d < 0 ? "cmp-up" : ""}>{y}</td>
                  </tr>
                ))}
                <tr>
                  <td className="r"><Form w={w} f={A} n={5} /></td>
                  <td className="c label">Form</td>
                  <td><Form w={w} f={B} n={5} /></td>
                </tr>
              </tbody>
            </table>
          </Panel>
        </div>
        <div className="c5 stack">
          <Odds A={A} B={B} />
          <History w={w} A={A} B={B} />
        </div>
      </div>
      <Panel title="Attributes" hint="The higher of the two in bold">
        <div className="cmp-attrs">
          {(Object.keys(ATTR_GROUPS) as AttrGroup[]).map((g) => (
            <div key={g} className="cmp-group">
              <h4>{GROUP_NAMES[g]}</h4>
              {(ATTR_GROUPS[g] as readonly AttrKey[]).map((k) => {
                const x = A.attrs[k];
                const y = B.attrs[k];
                return (
                  <div key={k} className="cmp-attr" title={ATTR_INFO[k].desc}>
                    <b className={x > y + 0.4 ? "on" : ""}>{x.toFixed(0)}</b>
                    <span className="cmp-bar l"><i style={{ width: `${(x / 20) * 100}%` }} /></span>
                    <span className="cmp-k">{ATTR_INFO[k].name}</span>
                    <span className="cmp-bar"><i style={{ width: `${(y / 20) * 100}%` }} /></span>
                    <b className={y > x + 0.4 ? "on" : ""}>{y.toFixed(0)}</b>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
      <Shared w={w} A={A} B={B} />
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function streakText(n: number): string {
  return n > 0 ? `Won ${n}` : n < 0 ? `Lost ${-n}` : "–";
}

/** The odds from sixty simulated fights, at the heavier of the two weights, three rounds. */
function Odds({ A, B }: { A: Fighter; B: Fighter }) {
  const [p, setP] = useState<number | null>(null);
  const run = () => {
    const div = DIVISIONS[A.div].limit >= DIVISIONS[B.div].limit ? A.div : B.div;
    setP(winChance({ a: A, b: B, rounds: 3, roundSec: 300, div, seed: hashString(`${A.id}:${B.id}`), log: false, tier: 5 }, 60));
  };
  const line = (q: number) => (q >= 0.5 ? `-${Math.round((q / Math.max(0.01, 1 - q)) * 100)}` : `+${Math.round(((1 - q) / Math.max(0.01, q)) * 100)}`);
  return (
    <Panel title="The odds" hint="Sixty simulated fights, three rounds">
      {p === null ? (
        <button className="btn" onClick={run}>Simulate the matchup</button>
      ) : (
        <div className="cmp-odds">
          <div><div className="big">{Math.round(p * 100)}%</div><div className="small dim">{A.surname} · {line(p)}</div></div>
          <div className="r2"><div className="big">{Math.round((1 - p) * 100)}%</div><div className="small dim">{B.surname} · {line(1 - p)}</div></div>
        </div>
      )}
    </Panel>
  );
}

function doneBouts(w: World, f: Fighter): Bout[] {
  return f.bouts.map((id) => w.bouts[id]).filter((b) => b && b.status === "done" && b.res);
}

function History({ w, A, B }: { w: World; A: Fighter; B: Fighter }) {
  const met = doneBouts(w, A).filter((b) => b.a === B.id || b.b === B.id);
  return (
    <Panel title="Against each other">
      {met.length === 0 ? (
        <p className="small dim">They haven't fought in this world.</p>
      ) : (
        <ul className="cmp-list">
          {met.map((b) => {
            const r = resultFor(b, A.id);
            return (
              <li key={b.id}>
                <b>{r === "W" ? `${A.surname} won` : r === "L" ? `${B.surname} won` : r === "NC" ? "No contest" : "Draw"}</b> · {methodText(b.res!.method, b.res!.detail)}
                <div className="tiny dim">{w.events[b.ev]?.name ?? ""}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** Opponents both have fought, and how each did. */
function Shared({ w, A, B }: { w: World; A: Fighter; B: Fighter }) {
  const res = (f: Fighter) => {
    const m = new Map<string, string[]>();
    for (const b of doneBouts(w, f)) {
      const o = b.a === f.id ? b.b : b.a;
      if (o === A.id || o === B.id) continue;
      const r = resultFor(b, f.id);
      const how = b.res!.method === "DEC" ? "DEC" : b.res!.method === "TKO" ? "KO" : b.res!.method;
      (m.get(o) ?? m.set(o, []).get(o)!).push(`${r} ${how}`);
    }
    return m;
  };
  const ra = res(A);
  const rb = res(B);
  const common = [...ra.keys()].filter((o) => rb.has(o) && w.fighters[o]);
  return (
    <Panel title="Common opponents" flush>
      {common.length === 0 ? (
        <Empty title="None in this world yet" />
      ) : (
        <table className="tbl compact">
          <thead><tr><th className="r">{A.surname}</th><th className="c">Opponent</th><th>{B.surname}</th></tr></thead>
          <tbody>
            {common.map((o) => (
              <tr key={o}>
                <td className="r">{ra.get(o)!.map((x, i) => <span key={i} className={`cmp-r ${x[0]}`}>{x}</span>)}</td>
                <td className="c"><Link to={`/fighter/${o}`}>{w.fighters[o].first} {w.fighters[o].surname}</Link></td>
                <td>{rb.get(o)!.map((x, i) => <span key={i} className={`cmp-r ${x[0]}`}>{x}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
