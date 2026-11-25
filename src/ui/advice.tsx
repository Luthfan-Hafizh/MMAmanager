// The team's advice on screen: a verdict card, the fight-offer sheet with the
// numbers a fighter weighs, and the desk where you talk to your manager.

import { fmtDate } from "../core/time";
import { money } from "../core/util";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import type { FightOffer, Fighter, World } from "../model/types";
import { adviseFight, boutOfOffer, type Advice } from "../career/advisor";
import { boutLimit, CUT_TEXT, cutCheck } from "../career/shortnotice";
import { moneyline } from "../world/odds";
import { rankLabel, recordText } from "../world/core";
import { defOf, SEVERITY_TEXT } from "../data/injuries";
import { Link } from "./router";
import { RapportLine } from "./decline";

/** The adviser's verdict, the headline and the reasons for and against. */
export function AdviceCard({ a, compact }: { a: Advice; compact?: boolean }) {
  const initials = a.who.split(/[\s,]+/).filter((x) => x && x[0] === x[0].toUpperCase()).slice(0, 2).map((x) => x[0]).join("");
  return (
    <div className={`advice v-${a.verdict}${compact ? " compact" : ""}`}>
      <div className="advice-h">
        <span className="advice-av" aria-hidden="true">{initials || "?"}</span>
        <span className="advice-who">
          <span className="label">{a.role === "manager" ? "Manager's advice" : a.role === "coach" ? "Coach's view" : "Analyst's view"}</span>
          <span className="small">{a.who}</span>
        </span>
        <span className={`advice-verdict v-${a.verdict}`}>{a.label}</span>
      </div>
      <p className="advice-head">{a.headline}</p>
      {!compact && a.reasons.length > 1 && (
        <ul className="advice-list">
          {a.reasons.map((r, i) => (
            <li key={i} className={r.good === true ? "pro" : r.good === false ? "con" : "info"}>{r.text}</li>
          ))}
        </ul>
      )}
      {!compact && a.counter && (
        <div className="small" style={{ marginTop: 8 }}>
          Suggested counter: <b>{money(a.counter.show)}</b>{a.counter.win ? <> + <b>{money(a.counter.win)}</b></> : " flat"} over <b>{a.counter.fights}</b> fights.
        </div>
      )}
    </div>
  );
}

function campText(days: number): string {
  if (days >= 56) return "A full camp";
  if (days >= 28) return "A short camp";
  if (days >= 8) return "No real camp";
  return days <= 1 ? "No camp: it's tomorrow" : "No camp at all";
}

/** A fight offer laid out the way a fighter weighs it, with the team's advice. */
export function FightOfferView({ w, o, f, compact }: { w: World; o: FightOffer; f: Fighter; compact?: boolean }) {
  const opp = w.fighters[o.opp];
  const ev = w.events[o.ev];
  const b = boutOfOffer(w, o);
  if (!opp || !ev) return null;
  const days = Math.max(0, o.day - w.day);
  const limit = b ? boutLimit(b) : o.limit ?? DIVISIONS[o.div].limit;
  const cut = cutCheck(f, limit, Math.max(1, days));
  const p = b && b.odds !== undefined ? (b.a === f.id ? b.odds : 1 - b.odds) : null;
  const weight = o.limit ? `${limit} lb catchweight` : `${DIVISIONS[o.div].name} · ${limit} lb`;
  const advice = adviseFight(w, f, o);
  const answer = o.expires <= w.day ? "Answer today" : `Answer by ${fmtDate(o.expires, { year: false })}`;
  return (
    <div className="offer-view">
      {o.shortNotice && (
        <div className={`sn-strip${days <= 3 ? " hot" : ""}`}>
          <b>{o.stay ? "New opponent" : "Short notice"}</b>
          <span>{days <= 1 ? "Fight tomorrow" : `${days} days out`}</span>
          {o.debut && <span>{PROMOTIONS[o.debut].short} debut</span>}
          {f.div !== o.div && <span>Up a division</span>}
          {o.limit && <span>Catchweight</span>}
          <span className="sn-ans">{answer}</span>
        </div>
      )}
      <div className="offer-grid">
        <div>
          <div className="label">Opponent</div>
          <div className="dx" style={{ fontSize: 24 }}><Link to={`/fighter/${opp.id}`}>{opp.first} {opp.surname}</Link></div>
          <div className="small dim">{recordText(opp)} · {rankLabel(w, opp) || "Unranked"}{p !== null ? <> · you're <b>{moneyline(p)}</b></> : null}</div>
        </div>
        <div>
          <div className="label">When</div>
          <div><b>{ev.name}</b></div>
          <div className="small dim">{fmtDate(o.day, { dow: true })} · {ev.city}</div>
        </div>
        <div>
          <div className="label">Weight</div>
          <div><b>{weight}</b></div>
          <div className={`small ${cut.risk === "hard" || cut.risk === "too much" ? "warn" : "dim"}`}>{cut.lb > 0 ? `${cut.lb} lb to lose: ${CUT_TEXT[cut.risk]}` : "No cut"}</div>
        </div>
        <div>
          <div className="label">Camp</div>
          <div><b>{o.stay ? "Your camp goes on" : campText(days)}</b></div>
          <div className="small dim">{o.rounds} rounds{o.kind === "title" || o.kind === "interim" || o.kind === "vacant" ? " · title fight" : o.kind === "eliminator" ? " · eliminator" : ""}</div>
        </div>
        <div>
          <div className="label">Purse</div>
          <div><b>{o.show ? money(o.show) : "No purse"}</b>{o.win ? <span className="small dim"> + {money(o.win)} to win</span> : null}</div>
          <div className="small dim">{o.raised ? "Their better number" : o.shortNotice && !o.stay ? "Short-notice money" : PROMOTIONS[o.promo].short} · <RapportLine w={w} fighter={f.id} promo={o.promo} /></div>
        </div>
      </div>
      <AdviceCard a={advice} compact={compact} />
    </div>
  );
}

/** An injury as the doctor explains it: how bad, the treatment, the road back, what can be trained. */
export function InjuryCard({ w, f }: { w: World; f: Fighter }) {
  const inj = f.injury;
  if (!inj || inj.until <= w.day) return null;
  const d = defOf(inj);
  const start = inj.start ?? inj.until - 28;
  const total = Math.max(1, inj.until - start);
  const done = Math.min(1, Math.max(0, (w.day - start) / total));
  const left = inj.until - w.day;
  const decision = w.inbox.find((m) => m.fighter === f.id && m.kind === "injury" && m.needs && !m.done);
  return (
    <div className={`injury sev${d.sev}`}>
      <div className="spread">
        <div>
          <div className="label">{SEVERITY_TEXT[d.sev]} injury{inj.surgery ? " · surgery" : ""}{inj.aggravated ? " · made worse" : ""}</div>
          <div className="dx" style={{ fontSize: 22 }}>{inj.name}</div>
        </div>
        <div className="injury-left">
          <b>{left >= 63 ? `${Math.round(left / 30.4)} mo` : `${Math.max(1, Math.round(left / 7))} wk`}</b>
          <span>to fight-ready</span>
        </div>
      </div>
      <div className="injury-bar" aria-label={`${Math.round(done * 100)}% of the way back`}><i style={{ width: `${Math.round(done * 100)}%` }} /></div>
      <div className="spread tiny dim"><span>{fmtDate(start, { year: false })}</span><span>Fight-ready {fmtDate(inj.until)}</span></div>
      <p className="small" style={{ marginTop: 8 }}>{d.treat}</p>
      <p className="small dim" style={{ marginTop: 4 }}>Training: {d.limits} About {Math.round(d.train * 100)}% of a normal week counts.</p>
      {decision && <p className="small" style={{ marginTop: 8 }}><Link to={`/inbox/${decision.id}`} className="textlink">Decision waiting: {decision.subject}</Link></p>}
    </div>
  );
}
