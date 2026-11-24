import { useState } from "react";
import { fmtDate } from "../../core/time";
import { money } from "../../core/util";
import { PROMOTIONS } from "../../data/promotions";
import type { ContractOffer, Fighter, World } from "../../model/types";
import { counterOffer, rejectContract, signContract } from "../../career/offers";
import { adviseContract, managerNegotiate } from "../../career/advisor";
import { AdviceCard } from "../advice";
import { TeamPanel } from "../team";
import { fullName, withRng } from "../../world/core";
import { changed, toast, useWorld } from "../../state/store";
import { Empty, Panel, PromoBadge } from "../components";
import { FighterSwitch } from "./Training";

export function Contracts({ id }: { id?: string }) {
  const w = useWorld();
  const fid = id && w.career.fc[id] ? id : w.career.fighters[0];
  const f = w.fighters[fid];
  if (!f) return <Empty title="No fighters under contract">{w.career.mode === "manager" ? "Sign clients from Scouting and their deals appear here." : "There is no active fighter in this career."}</Empty>;
  const offers = w.career.contractOffers.filter((o) => o.fighter === fid && o.status === "open");
  const fc = w.career.fc[fid];
  const c = f.contract;
  return (
    <div className="grid">
      <div className="c12"><FighterSwitch w={w} id={fid} base="/contracts" /></div>
      <div className="c5 stack">
        <Panel title="Current deal">
          {c && f.promo ? (
            <dl className="kv">
              <dt>Promotion</dt><dd><PromoBadge p={f.promo} /> {PROMOTIONS[f.promo].name}</dd>
              {PROMOTIONS[f.promo].tier === "amateur" ? (
                <><dt>Terms</dt><dd>Amateur: no purses</dd></>
              ) : (
                <>
                  <dt>Fights</dt><dd>{c.left} left of {c.fights}</dd>
                  <dt>Show money</dt><dd>{money(c.show)}</dd>
                  <dt>Win money</dt><dd>{c.win ? money(c.win) : "Flat purse"}</dd>
                  <dt>Raise with each win</dt><dd>{money(c.escal)}</dd>
                  <dt>Runs until</dt><dd>{fmtDate(c.end)}</dd>
                  <dt>Champion's clause</dt><dd>{c.champClause ? "Yes" : "No"}</dd>
                  <dt>Exclusive</dt><dd>{PROMOTIONS[f.promo].tier === "major" || PROMOTIONS[f.promo].tier === "league" ? "Binding until it is done" : "The UFC, the PFL and the Contender Series can call"}</dd>
                </>
              )}
            </dl>
          ) : (
            <Empty title="Free agent">Offers arrive in the inbox at the start of each month.</Empty>
          )}
        </Panel>
        {fc && <TeamPanel w={w} f={f} />}
      </div>
      <div className="c7 stack">
        {offers.length === 0 && <Panel title="Offers"><Empty title="No contract offers">They come when a deal ends, when a bigger promotion is interested, or when you're a free agent.</Empty></Panel>}
        {offers.map((o) => <OfferCard key={o.id} w={w} o={o} f={f} />)}
      </div>
    </div>
  );
}

function OfferCard({ w, o, f }: { w: World; o: ContractOffer; f: Fighter }) {
  const [show, setShow] = useState(o.show);
  const [win, setWin] = useState(o.win);
  const [fights, setFights] = useState(o.fights);
  const [log, setLog] = useState<string[]>([]);
  const p = PROMOTIONS[o.promo];
  const counter = () => {
    const r = withRng(w, (rng) => counterOffer(w, rng, o.id, { show, win: o.win ? win : 0, fights }));
    setLog((l) => [...l, r.text]);
    setShow(o.show);
    setWin(o.win);
    setFights(o.fights);
    changed();
  };
  const sign = () => {
    toast(withRng(w, (rng) => signContract(w, rng, o.id)), "good");
    changed();
  };
  const advice = adviseContract(w, f, o);
  const negotiate = () => {
    const lines = withRng(w, (rng) => managerNegotiate(w, rng, o.id));
    setLog((l) => [...l, ...lines]);
    setShow(o.show);
    setWin(o.win);
    setFights(o.fights);
    changed();
  };
  return (
    <Panel title={`${p.short}${o.renewal ? " · new deal" : ""}`} hint={`expires ${fmtDate(o.expires)}`} className={o.promo === "ufc" ? "accent" : ""}>
      {o.note && <p className="muted">{o.note}</p>}
      <div className="grid" style={{ gap: 12 }}>
        <div className="c4"><div className="tile"><div className="k">Fights</div><div className="v">{o.fights}</div></div></div>
        <div className="c4"><div className="tile"><div className="k">To show</div><div className="v">{money(o.show)}</div></div></div>
        <div className="c4"><div className="tile"><div className="k">To win</div><div className="v">{o.win ? money(o.win) : "Flat"}</div></div></div>
      </div>
      <p className="small dim" style={{ marginTop: 8 }}>
        +{money(o.escal)} after each win{o.signBonus ? ` · ${money(o.signBonus)} to sign` : ""} · {Math.round(o.termDays / 365)} years{o.champClause ? " · champion's clause" : ""}
      </p>
      <div style={{ marginTop: 12 }}><AdviceCard a={advice} /></div>
      <hr className="sep" />
      <div className="spread" style={{ marginBottom: 6 }}>
        <span className="small dim">Counter offer ({o.rounds} so far)</span>
        <span className="row tight">
          {advice.counter && <button className="btn sm ghost" onClick={() => { setShow(advice.counter!.show); setWin(advice.counter!.win); setFights(advice.counter!.fights); }}>Use the suggestion</button>}
          {advice.role !== "coach" && advice.verdict !== "sign" && <button className="btn sm" onClick={negotiate}>Let {advice.who.split(/[ ,]/)[0]} negotiate</button>}
        </span>
      </div>
      <div className="grid" style={{ gap: 10 }}>
        <label className="field c4">Show money<input className="input" type="number" step={500} value={show} onChange={(e) => setShow(Number(e.target.value))} /></label>
        {o.win > 0 && <label className="field c4">Win money<input className="input" type="number" step={500} value={win} onChange={(e) => setWin(Number(e.target.value))} /></label>}
        <label className="field c4">Fights<input className="input" type="number" min={1} max={8} value={fights} onChange={(e) => setFights(Number(e.target.value))} /></label>
      </div>
      {log.length > 0 && (
        <div className="stack small" style={{ marginTop: 10, gap: 4 }}>
          {log.map((l, i) => <div key={i} className="muted">› {l}</div>)}
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={sign}>Sign</button>
        <button className="btn" onClick={counter} disabled={show === o.show && win === o.win && fights === o.fights}>Send counter</button>
        <button className="btn danger" onClick={() => { toast(rejectContract(w, o.id)); changed(); }}>Reject</button>
        <div style={{ flex: 1 }} />
        <span className="tiny dim">{fullName(f)}</span>
      </div>
    </Panel>
  );
}
