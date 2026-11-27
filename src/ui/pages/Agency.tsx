import { useMemo, useState } from "react";
import { ageYears, weeksText } from "../../core/time";
import { DIVISIONS, DIVISION_IDS, type DivisionId } from "../../data/divisions";
import { PROMOTIONS, TIER_NAME, type Tier } from "../../data/promotions";
import { ovr } from "../../model/attributes";
import type { Fighter } from "../../model/types";
import { clientCapacity, dropClient, hireStaff, pitch, pitchChance } from "../../career/agency";
import { fullName, rankLabel, recordText, withRng } from "../../world/core";
import { outlookRoom, potentialText } from "../../world/development";
import { changed, toast, useWorld } from "../../state/store";
import { go } from "../router";
import { Empty, FighterLink, Form, Modal, Ovr, Panel, PromoBadge, Table, type Col } from "../components";

export function Agency() {
  const w = useWorld();
  const a = w.career.agency;
  if (!a) return <Empty title="Not a manager career" />;
  const clients = w.career.fighters.map((id) => w.fighters[id]).filter(Boolean);
  const cols: Col<Fighter>[] = [
    { key: "n", label: "Client", render: (f) => <FighterLink w={w} id={f.id} rank />, sort: (f) => f.surname },
    { key: "p", label: "Promotion", render: (f) => <PromoBadge p={f.promo} /> },
    { key: "d", label: "Division", render: (f) => DIVISIONS[f.div].short },
    { key: "r", label: "Record", render: (f) => recordText(f), align: "r", sort: (f) => f.rec.w },
    { key: "a", label: "Age", render: (f) => ageYears(f.birth, w.day), align: "r", sort: (f) => -f.birth },
    { key: "f", label: "Form", render: (f) => <Form w={w} f={f} /> },
    { key: "n2", label: "Next", render: (f) => (f.booked && w.bouts[f.booked] && !w.bouts[f.booked].pending ? `vs ${w.fighters[w.bouts[f.booked].a === f.id ? w.bouts[f.booked].b : w.bouts[f.booked].a].surname}, ${weeksText(w.bouts[f.booked].day - w.day)}` : "-") },
    { key: "o", label: "Ovr", render: (f) => <Ovr v={ovr(f.attrs)} sm />, align: "c", sort: (f) => ovr(f.attrs) },
    { key: "x", label: "", render: (f) => <button className="btn sm danger" onClick={(e) => { e.stopPropagation(); if (confirm(`Release ${fullName(f)} from the agency?`)) { dropClient(w, f); changed(); } }}>Release</button> },
  ];
  return (
    <div className="grid">
      <div className="c12">
        <div className="stat-tiles">
          <div className="tile"><div className="k">Reputation</div><div className="v">{Math.round(a.rep)}</div><div className="s">grows with the stable's success</div></div>
          <div className="tile"><div className="k">Clients</div><div className="v">{clients.length} / {clientCapacity(w)}</div></div>
          <div className="tile"><div className="k">Agents</div><div className="v">{a.staff}</div><div className="s">$3,200 a month each</div></div>
          <div className="tile"><div className="k">Commission</div><div className="v">{a.cut}%</div><div className="s">of purses; 20% of sponsorship</div></div>
        </div>
      </div>
      <div className="c12">
        <Panel title="Clients" acts={<><button className="btn sm" onClick={() => { toast(hireStaff(w)); changed(); }}>Hire an agent</button><button className="btn sm primary" onClick={() => go("/scouting")}>Sign fighters</button></>} flush>
          {clients.length ? <Table cols={cols} rows={clients} rowKey={(f) => f.id} onRow={(f) => go(`/fighter/${f.id}`)} /> : <Empty title="No clients yet" />}
        </Panel>
      </div>
      <div className="c6">
        <Panel title="Commission">
          <p className="muted">The cut you ask from new clients. Lower wins more signatures; most MMA managers take 10 to 20%.</p>
          <input type="range" min={8} max={25} value={a.cut} onChange={(e) => { a.cut = Number(e.target.value); changed(); }} />
          <div className="spread small"><span>8%</span><b>{a.cut}%</b><span>25%</span></div>
        </Panel>
      </div>
    </div>
  );
}

export function Scouting() {
  const w = useWorld();
  const a = w.career.agency;
  const [tier, setTier] = useState<Tier | "all">("all");
  const [div, setDiv] = useState<DivisionId | "all">("all");
  const [pick, setPick] = useState<Fighter | null>(null);
  const rows = useMemo(
    () =>
      Object.values(w.fighters).filter(
        (f) => f.status === "active" && !f.ctrl && f.promo && (tier === "all" || PROMOTIONS[f.promo].tier === tier) && (div === "all" || f.div === div) && PROMOTIONS[f.promo].tier !== "amateur" || (f.status === "active" && !f.ctrl && !f.promo && tier === "all" && (div === "all" || f.div === div)),
      ),
    [w, tier, div, w.stamp],
  );
  if (!a) return <Empty title="Not a manager career" />;
  const cols: Col<Fighter>[] = [
    { key: "n", label: "Fighter", render: (f) => <FighterLink w={w} id={f.id} rank />, sort: (f) => f.surname },
    { key: "p", label: "Promotion", render: (f) => <PromoBadge p={f.promo} />, sort: (f) => (f.promo ? PROMOTIONS[f.promo].prestige : 0) },
    { key: "d", label: "Div", render: (f) => DIVISIONS[f.div].short },
    { key: "r", label: "Record", render: (f) => recordText(f), align: "r", sort: (f) => f.rec.w - f.rec.l },
    { key: "a", label: "Age", render: (f) => ageYears(f.birth, w.day), align: "r", sort: (f) => -f.birth },
    { key: "pot", label: "Outlook", render: (f) => <span className="small">{potentialText(f, w.day, 0.6)}</span>, sort: (f) => outlookRoom(f, w.day) },
    { key: "o", label: "Ovr", render: (f) => <Ovr v={ovr(f.attrs)} sm />, align: "c", sort: (f) => ovr(f.attrs) },
    { key: "c", label: "Interest", render: (f) => `${Math.round(pitchChance(w, f, a.cut).p * 100)}%`, align: "r", sort: (f) => pitchChance(w, f, a.cut).p },
  ];
  return (
    <div className="stack">
      <div className="row">
        <select className="input" value={tier} onChange={(e) => setTier(e.target.value as Tier | "all")}>
          <option value="all">Every level</option>
          {(["major", "league", "regional", "local"] as Tier[]).map((t) => <option key={t} value={t}>{TIER_NAME[t]}</option>)}
        </select>
        <select className="input" value={div} onChange={(e) => setDiv(e.target.value as DivisionId | "all")}>
          <option value="all">All weight classes</option>
          {DIVISION_IDS.map((d) => <option key={d} value={d}>{DIVISIONS[d].name}</option>)}
        </select>
        <span className="small dim">{rows.length} fighters · {w.career.fighters.length} of {clientCapacity(w)} client places used</span>
      </div>
      <div className="panel">
        <Table cols={cols} rows={rows} rowKey={(f) => f.id} onRow={setPick} initial={{ key: "o" }} limit={250} />
      </div>
      {pick && (() => {
        const pc = pitchChance(w, pick, a.cut);
        const pct = Math.round(pc.p * 100);
        const rank = rankLabel(w, pick);
        return (
          <Modal title={`Pitch to ${fullName(pick)}`} onClose={() => setPick(null)}>
            <div className="pitch-head">
              <div className="pitch-who">
                <span className="pitch-meta">
                  <PromoBadge p={pick.promo} />
                  {rank && <span className="tag red">{rank === "C" ? "Champion" : rank}</span>}
                  <span>{DIVISIONS[pick.div].name} · {recordText(pick)} · {ageYears(pick.birth, w.day)} years old</span>
                </span>
                <span className="small dim">{pick.promo ? PROMOTIONS[pick.promo].name : "Free agent"} · overall {ovr(pick.attrs)} · {potentialText(pick, w.day, 0.6).toLowerCase()}</span>
              </div>
              <div className={`pitch-chance ${pct >= 50 ? "good" : pct >= 25 ? "fair" : "bad"}`}>
                <b>{pct}%</b>
                <span>Chance they sign at {a.cut}%</span>
              </div>
            </div>
            <ul className="pitch-why">
              {pc.why.map((x, i) => <li key={i} className={pc.tones[i]}>{x}</li>)}
            </ul>
            <div className="row">
              <button className="btn primary" onClick={() => { toast(withRng(w, (rng) => pitch(w, rng, pick, a.cut))); setPick(null); changed(); }}>Make the pitch</button>
              <button className="btn" onClick={() => go(`/fighter/${pick.id}`)}>Profile</button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
