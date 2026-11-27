import { useState } from "react";
import { fmtDate } from "../../core/time";
import { money } from "../../core/util";
import { PROMOTIONS } from "../../data/promotions";
import type { ContractOffer, Fighter, World } from "../../model/types";
import { counterOffer, exclusiveDeal, rejectContract, signContract, walksAsChampion } from "../../career/offers";
import { marketPay, perFight } from "../../career/standing";
import { adviseContract, managerNegotiate } from "../../career/advisor";
import { AdviceCard } from "../advice";
import { TeamPanel } from "../team";
import { fullName, withRng } from "../../world/core";
import { changed, toast, useWorld } from "../../state/store";
import { Bar, Empty, Panel, PromoBadge } from "../components";
import { rapport, rapportLabel, rapportTone } from "../../career/promoter";
import type { PromoId } from "../../data/promotions";
import { FighterSwitch } from "./Training";

export function Contracts({ id }: { id?: string }) {
  const w = useWorld();
  const fid = id && w.career.fc[id] ? id : w.career.fighters[0];
  const f = w.fighters[fid];
  if (!f) return <Empty title="No fighters under contract">{w.career.mode === "manager" ? "Sign clients from Scouting and their deals appear here." : "There is no active fighter in this career."}</Empty>;
  const offers = w.career.contractOffers.filter((o) => o.fighter === fid && o.status === "open");
  const fc = w.career.fc[fid];
  const c = f.contract;
  const next = fc?.next;
  const tryout = fc?.tryout?.yes && !fc.tryout.done && fc.tryout.ev ? w.events[fc.tryout.ev] : undefined;
  const last = fc?.lastDeal;
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
                  <dt>Exclusive</dt><dd>{f.promo === "ufc" ? "Binding until it is done" : exclusiveDeal(f.promo) ? "Binding; the UFC can talk to you in the last fight or the last four months" : "The UFC, the PFL and the Contender Series can call"}</dd>
                </>
              )}
            </dl>
          ) : (
            <Empty title="Free agent">
              Offers arrive in the inbox at the start of each month.
              {last ? ` Your last deal (${PROMOTIONS[last.promo].short}, ${money(last.show)}${last.win ? ` + ${money(last.win)}` : " flat"}) is what promotions price you from for two years.` : ""}
            </Empty>
          )}
          {next && (
            <div className="co-next">
              <span className="label">Signed next</span>
              <b><PromoBadge p={next.promo} /> {next.fights} fights at {money(next.show)}{next.win ? ` + ${money(next.win)}` : " flat"}</b>
              <span className="small dim">Starts when this deal is done{c && c.promo !== next.promo ? ` (${c.left} fight${c.left === 1 ? "" : "s"} left)` : ""}{next.signBonus ? `, with a ${money(next.signBonus)} signing bonus` : ""}.</span>
            </div>
          )}
          {tryout && (
            <div className="co-next">
              <span className="label">Contender Series</span>
              <b>{tryout.name}</b>
              <span className="small dim">{fmtDate(tryout.day, { dow: true })} in Las Vegas. The opponent comes when the card is made.</span>
            </div>
          )}
        </Panel>
        {fc && <MatchmakerPanel w={w} f={f} />}
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
  // What kind of offer this is: the UFC's approach, a match, a promotion coming back.
  const kind = o.approach ? "approach" : o.matches ? `matches the ${PROMOTIONS[o.matches].short}` : o.renewal ? "new deal" : o.last ? "back again" : null;
  const walks = walksAsChampion(w, f, o);
  const paid = marketPay(w, f);
  const notes: { text: string; tone?: "good" | "warn" }[] = [];
  if (o.approach && f.promo && f.promo !== o.promo && f.contract && f.contract.left > 0) notes.push({ text: `Starts after your last ${PROMOTIONS[f.promo].short} fight (${f.contract.left} left). Sign now and the move is done; the ${PROMOTIONS[f.promo].short} can't stop it.` });
  if (o.matches) notes.push({ text: `Matches the ${PROMOTIONS[o.matches].short}'s money to keep you. Same money: the stage decides.`, tone: "good" });
  if (o.last) notes.push({ text: `Last time ${p.short} offered ${money(o.last.show)}${o.last.win ? ` + ${money(o.last.win)}` : " flat"} (${o.last.how === "rejected" ? "turned down" : o.last.how === "expired" ? "left to lapse" : "withdrawn"} ${fmtDate(o.last.day, { year: false })}): it comes back at that level, moved by the results since.` });
  if (paid && paid.promo !== o.promo) notes.push({ text: `${paid.current ? "Paid now" : "Last deal"}: ${PROMOTIONS[paid.promo].short}, ${money(paid.show)}${paid.win ? ` + ${money(paid.win)}` : " flat"}.` });
  if (walks) notes.push({ text: `Turn this down and you're a free agent: the ${p.short} title is vacated.`, tone: "warn" });
  return (
    <Panel title={`${p.short}${kind ? ` · ${kind}` : ""}`} hint={`expires ${fmtDate(o.expires)}`} className={o.promo === "ufc" ? "accent" : ""}>
      {o.note && <p className="muted">{o.note}</p>}
      <div className="grid co-tiles" style={{ gap: 12 }}>
        <div className="c3"><div className="tile"><div className="k">Fights</div><div className="v">{o.fights}</div></div></div>
        <div className="c3"><div className="tile"><div className="k">To show</div><div className="v">{money(o.show)}</div></div></div>
        <div className="c3"><div className="tile"><div className="k">To win</div><div className="v">{o.win ? money(o.win) : "Flat"}</div></div></div>
        <div className="c3"><div className="tile co-all"><div className="k">A fight, all in</div><div className="v">{money(perFight(o.show, o.win))}</div></div></div>
      </div>
      <p className="small dim" style={{ marginTop: 8 }}>
        +{money(o.escal)} after each win{o.signBonus ? ` · ${money(o.signBonus)} to sign` : ""} · {Math.round(o.termDays / 365)} years{o.champClause ? " · champion's clause" : ""}
      </p>
      {notes.length > 0 && (
        <ul className="co-notes">
          {notes.map((n, i) => <li key={i} className={n.tone ?? ""}>{n.text}</li>)}
        </ul>
      )}
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
        <button className="btn danger" onClick={() => { toast(rejectContract(w, o.id)); changed(); }}>{walks ? "Walk away" : "Reject"}</button>
        <div style={{ flex: 1 }} />
        <span className="tiny dim">{fullName(f)}</span>
      </div>
    </Panel>
  );
}

/** How each promotion's matchmaker sees the fighter, what that changes, and what moved it lately. */
function MatchmakerPanel({ w, f }: { w: World; f: Fighter }) {
  const fc = w.career.fc[f.id];
  const promos = [...new Set([f.promo, ...(Object.keys(fc?.rapport ?? {}) as PromoId[])])].filter((p): p is PromoId => !!p && PROMOTIONS[p].tier !== "amateur");
  if (!promos.length) return null;
  const here = f.promo && promos.includes(f.promo) ? rapport(w, f.id, f.promo) : null;
  const what =
    here === null ? null
    : here >= 65 ? "Good terms: the next offer comes sooner after a no, short-notice calls come to you first, and a new deal opens up to 6% higher."
    : here >= 45 ? "Fair terms: nothing for or against you yet. Taking fights, stepping in on short notice and winning build it; weak excuses, missed weight and unanswered offers wear it down."
    : here >= 30 ? "Strained: a longer wait after a no, fewer short-notice calls, and a new deal opens lower."
    : "Poor terms: you're left off some cards, the phone rarely rings, and a new deal opens up to 8% lower.";
  const log = (fc?.rapportLog ?? []).slice(0, 6);
  return (
    <Panel title="Matchmakers" hint="How the promotions see you">
      <div className="rp-rows">
        {promos.map((p) => {
          const r = rapport(w, f.id, p);
          const tone = rapportTone(r);
          return (
            <div key={p} className="rp-row">
              <span className="rp-name"><PromoBadge p={p} /></span>
              <Bar v={r} kind={tone === "good" ? "info" : tone === "bad" ? "red" : tone === "warn" ? "warn" : "gold"} title={`${Math.round(r)} of 100`} />
              <b className={tone === "good" ? "good" : tone === "bad" ? "bad" : tone === "warn" ? "gold-t" : ""}>{rapportLabel(r)}</b>
            </div>
          );
        })}
      </div>
      {what && <p className="small muted" style={{ marginTop: 10 }}>{what}</p>}
      {log.length > 0 && (
        <ul className="rp-log">
          {log.map((e, i) => (
            <li key={i}>
              <b className={e.d < 0 ? "bad" : "good"}>{e.d > 0 ? `+${Math.max(1, Math.round(e.d))}` : Math.min(-1, Math.round(e.d))}</b>
              <span>{e.why}</span>
              <span className="dim">{PROMOTIONS[e.promo].short} · {fmtDate(e.day, { year: false })}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
