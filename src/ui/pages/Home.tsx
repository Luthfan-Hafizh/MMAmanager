import { fmtDate, weeksText, ageYears } from "../../core/time";
import { money } from "../../core/util";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS } from "../../data/promotions";
import { ovr, ovrBand, styleOf } from "../../model/attributes";
import type { Fighter, World } from "../../model/types";
import { blocking } from "../../career/inbox";
import { answer } from "../../career/actions";
import { askForFight } from "../../career/offers";
import { upcomingOf } from "../../world/calendar";
import { fullName, rankLabel, recordText } from "../../world/core";
import { changed, toast, useWorld } from "../../state/store";
import { Link, go } from "../router";
import { Bar, Empty, FighterLink, Flag, Form, Ovr, Panel, RankBadge, Spark, Stars } from "../components";
import { Icons } from "../icons";
import { prepText, campPrep } from "../../career/camp";
import { runwayMonths } from "../../career/money";
import { sponsorIncomeFor } from "../../career/sponsors";
import { primeText } from "../../world/development";

export function Home() {
  const w = useWorld();
  return w.career.mode === "manager" ? <ManagerHome w={w} /> : <FighterHome w={w} f={w.fighters[w.career.fighters[0]]} />;
}

export function NextFightCard({ w, f }: { w: World; f: Fighter }) {
  const b = f.booked ? w.bouts[f.booked] : null;
  const offer = w.career.fightOffers.find((o) => o.fighter === f.id && o.status === "open");
  if (b && b.status === "booked" && !b.pending) {
    const opp = w.fighters[b.a === f.id ? b.b : b.a];
    const ev = w.events[b.ev];
    const days = b.day - w.day;
    return (
      <Panel title="Next fight" hint={ev?.name} acts={<Link to={`/fight/${f.id}`} className="btn sm primary">Camp</Link>} className="accent">
        <div className="vs-card">
          <div>
            <div className="who">{f.surname}</div>
            <div className="small dim">{recordText(f)} · {rankLabel(w, f) || "Unranked"}</div>
          </div>
          <div className="vs">VS</div>
          <div className="r2">
            <div className="who"><Link to={`/fighter/${opp.id}`}>{opp.surname}</Link></div>
            <div className="small dim">{recordText(opp)} · {rankLabel(w, opp) || "Unranked"}</div>
          </div>
        </div>
        <hr className="sep" />
        <div className="spread small">
          <span>
            <b>{fmtDate(b.day, { dow: true })}</b> · {ev?.city} · {b.rounds} rounds{b.kind === "title" ? " · title fight" : b.kind === "vacant" ? " · vacant title" : b.kind === "interim" ? " · interim title" : ""}
          </span>
          <span className={days <= 7 ? "gold-t" : "dim"}>{weeksText(days)}</span>
        </div>
        {w.career.fc[f.id]?.camp && (
          <div className="small dim" style={{ marginTop: 6 }}>Preparation so far: {prepText(campPrep(w, f, b))}</div>
        )}
      </Panel>
    );
  }
  if (offer) {
    const opp = w.fighters[offer.opp];
    const ev = w.events[offer.ev];
    const msg = w.inbox.find((m) => m.ref === offer.id && m.needs);
    return (
      <Panel title="Fight offer" hint={`expires ${fmtDate(offer.expires)}`} className="gold">
        <p>
          <b>{PROMOTIONS[offer.promo].short}</b> offers <FighterLink w={w} id={opp.id} rank /> ({recordText(opp)}) at <Link to={`/event/${ev.id}`}><b>{ev.name}</b></Link>, {fmtDate(offer.day)} ({weeksText(offer.day - w.day)} away). {offer.rounds} rounds{offer.shortNotice ? ", short notice" : ""}.
        </p>
        <p className="small muted">Purse: {money(offer.show)} to show{offer.win ? ` + ${money(offer.win)} to win` : ""}.</p>
        {msg && (
          <div className="row">
            <button className="btn primary" onClick={() => { toast(answer(w, msg.id, "accept"), "good"); changed(); }}>Accept</button>
            <button className="btn danger" onClick={() => { toast(answer(w, msg.id, "decline")); changed(); }}>Decline</button>
            <Link to={`/fighter/${opp.id}`} className="btn ghost">Scout {opp.surname}</Link>
          </div>
        )}
      </Panel>
    );
  }
  const fc = w.career.fc[f.id];
  return (
    <Panel title="Next fight">
      <Empty title="No fight booked">
        {fc?.asked ? "The matchmaker knows you want a fight." : f.injury && f.injury.until > w.day ? `Injured until ${fmtDate(f.injury.until)}.` : f.susp > w.day ? `Medically suspended until ${fmtDate(f.susp)}.` : "Offers come when the next cards are made."}
      </Empty>
      {!fc?.asked && f.promo && (
        <div className="center">
          <button className="btn" onClick={() => { toast(askForFight(w, f)); changed(); }}>Ask the matchmaker for a fight</button>
        </div>
      )}
    </Panel>
  );
}

export function ConditionPanel({ w, f }: { w: World; f: Fighter }) {
  const limit = DIVISIONS[f.div].limit;
  const over = f.walk - limit;
  return (
    <Panel title="Condition">
      <div className="stack" style={{ gap: 10 }}>
        <div>
          <div className="spread small"><span className="dim">Fatigue</span><b className={f.fatigue > 65 ? "bad" : f.fatigue > 45 ? "warn" : "good"}>{f.fatigue}</b></div>
          <Bar v={f.fatigue} kind={f.fatigue > 65 ? "red" : f.fatigue > 45 ? "warn" : undefined} thin />
        </div>
        <div>
          <div className="spread small"><span className="dim">Sharpness</span><b>{f.sharp}</b></div>
          <Bar v={f.sharp} kind="info" thin />
        </div>
        <div>
          <div className="spread small"><span className="dim">Morale</span><b>{f.morale}</b></div>
          <Bar v={f.morale} kind="gold" thin />
        </div>
        <div className="spread small">
          <span className="dim">Walking weight</span>
          <b>{f.walk} lb <span className="dim">({over > 0 ? `${over} over` : "on"} the {limit} limit)</span></b>
        </div>
        {f.injury && f.injury.until > w.day && (
          <div className="notice bad small"><Icons.medkit /> {f.injury.name}: out until about {fmtDate(f.injury.until)}</div>
        )}
        {f.susp > w.day && <div className="notice warn small">Medical suspension until {fmtDate(f.susp)}</div>}
      </div>
    </Panel>
  );
}

function FighterHome({ w, f }: { w: World; f: Fighter }) {
  if (!f) return <Empty title="No fighter">Start a new career from Settings.</Empty>;
  const fc = w.career.fc[f.id];
  const o = ovr(f.attrs);
  const ps = f.promo ? w.promos[f.promo] : null;
  const champ = ps?.champs[f.div];
  const ranks = ps?.ranks[f.div] ?? [];
  const decisions = blocking(w);
  const events = f.promo ? upcomingOf(w, f.promo, 4) : [];
  const age = ageYears(f.birth, w.day);
  return (
    <div className="grid">
      <div className="c12">
        <div className="hero">
          <div className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 18 }}>
            <div>
              <div className="name">
                <small>
                  {rankLabel(w, f) === "C" ? `${PROMOTIONS[f.promo!].short} ${DIVISIONS[f.div].name} champion` : rankLabel(w, f) ? `${rankLabel(w, f)} ${DIVISIONS[f.div].name}` : DIVISIONS[f.div].name}
                  {f.nick ? ` · "${f.nick}"` : ""}
                </small>
                {fullName(f)}
              </div>
              <div className="facts">
                <span className="row tight"><Flag code={f.country} /> <b>{f.hometown}</b></span>
                <span>Age <b>{age}</b></span>
                <span>{f.promo ? <b>{PROMOTIONS[f.promo].name}</b> : <b>Free agent</b>}</span>
                <span>Style <b>{styleOf(f.attrs)}</b></span>
                <span>Gym <b>{w.gyms[f.gym]?.name}</b></span>
                <span><b>{primeText(f, w.day)}</b></span>
              </div>
            </div>
            <div className="row" style={{ gap: 22 }}>
              <div className="record">
                {f.amateur ? `${f.am.w}-${f.am.l}${f.am.d ? `-${f.am.d}` : ""}` : recordText(f)}
                <small>{f.amateur ? "Amateur record" : `Pro record · ${f.rec.koW} KO · ${f.rec.subW} SUB · ${f.rec.decW} DEC`}</small>
              </div>
              <div className="center">
                <Ovr v={o} />
                <div style={{ marginTop: 4 }}><Stars v={o} /></div>
                <div className="tiny dim">{ovrBand(o)}</div>
              </div>
            </div>
          </div>
          <div className="spread" style={{ marginTop: 14, flexWrap: "wrap" }}>
            <Form w={w} f={f} n={8} />
            <div className="row small dim">
              Overall over time <Spark points={(fc?.progress ?? []).map((p) => p.ovr)} />
            </div>
          </div>
        </div>
      </div>
      {decisions.length > 0 && (
        <div className="c12">
          <div className="notice warn row">
            <Icons.alert /> <b>{decisions.length} decision{decisions.length > 1 ? "s" : ""} waiting:</b> {decisions[0].subject}
            <div style={{ flex: 1 }} />
            <Link to={`/inbox/${decisions[0].id}`} className="btn sm gold">Open</Link>
          </div>
        </div>
      )}
      <div className="c5 stack">
        <NextFightCard w={w} f={f} />
        <ConditionPanel w={w} f={f} />
      </div>
      <div className="c4 stack">
        <Panel title="This week" acts={<Link to="/training" className="btn sm">Training</Link>}>
          {fc ? (
            <div className="small">
              <p>
                <b>{fc.plan.template === "custom" ? "Custom week" : fc.plan.template.replace(/^./, (c) => c.toUpperCase())}</b>, {["light", "normal", "hard"][fc.plan.intensity]} intensity{fc.dayJob ? ", with a day job" : ""}.
                {fc.plan.drill ? ` Drilling: ${fc.plan.drill}.` : ""}
              </p>
              {fc.week && (
                <p className="muted">
                  Last week: {Object.values(fc.week.growth).reduce((a, b) => a + (b ?? 0), 0).toFixed(2)} attribute points gained, fatigue {Math.round(fc.week.fatigue)}.{fc.week.injury ? ` Injury: ${fc.week.injury}.` : ""}
                </p>
              )}
            </div>
          ) : null}
        </Panel>
        <Panel title="Contract" acts={<Link to="/contracts" className="btn sm">Details</Link>}>
          {f.contract && f.promo ? (
            <dl className="kv">
              <dt>Promotion</dt><dd>{PROMOTIONS[f.promo].name}</dd>
              {PROMOTIONS[f.promo].tier !== "amateur" && (
                <>
                  <dt>Fights left</dt><dd>{f.contract.left} of {f.contract.fights}</dd>
                  <dt>Purse</dt><dd>{money(f.contract.show)}{f.contract.win ? ` + ${money(f.contract.win)}` : " flat"}</dd>
                  <dt>Runs until</dt><dd>{fmtDate(f.contract.end)}</dd>
                </>
              )}
              <dt>Sponsors</dt><dd>{money(sponsorIncomeFor(w, f.id))} a month</dd>
              <dt>Bank</dt><dd className={w.career.money < 0 ? "bad" : ""}>{money(w.career.money)} ({runwayMonths(w) > 60 ? "years" : `${Math.max(0, Math.floor(runwayMonths(w)))} months`} of living costs)</dd>
            </dl>
          ) : (
            <Empty title="No contract">Your manager is looking for offers.</Empty>
          )}
        </Panel>
        <Panel title="Inbox" acts={<Link to="/inbox" className="btn sm">All</Link>} flush>
          {w.inbox.slice(0, 5).map((m) => (
            <div key={m.id} className={`list-row click`} onClick={() => go(`/inbox/${m.id}`)} style={{ cursor: "pointer" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className={`ellip ${m.read ? "" : "disp"}`} style={{ fontWeight: m.read ? 500 : 700 }}>{m.subject}</div>
                <div className="tiny dim">{m.from} · {fmtDate(m.day)}</div>
              </div>
              {m.needs && !m.done && <span className="badge gold">Decide</span>}
            </div>
          ))}
        </Panel>
      </div>
      <div className="c3 stack">
        {ps && f.promo && PROMOTIONS[f.promo].rankSize > 0 && (
          <Panel title={`${PROMOTIONS[f.promo].short} ${DIVISIONS[f.div].short}`} acts={<Link to={`/rankings/${f.promo}/${f.div}`} className="btn sm">Full</Link>} flush>
            {champ && (
              <div className="list-row"><span className="rank c">C</span><FighterLink w={w} id={champ} /></div>
            )}
            {ranks.slice(0, 8).map((id, i) => (
              <div className="list-row" key={id} style={w.fighters[id]?.ctrl ? { background: "var(--accent-soft)" } : undefined}>
                <span className="rank">{i + 1}</span><FighterLink w={w} id={id} />
              </div>
            ))}
          </Panel>
        )}
        <Panel title="Upcoming" flush>
          {events.map((e) => (
            <div className="list-row" key={e.id}>
              <div style={{ minWidth: 0 }}>
                <Link to={`/event/${e.id}`} className="disp up" ><b>{e.name}</b></Link>
                <div className="tiny dim">{fmtDate(e.day, { dow: true })} · {e.city}</div>
              </div>
            </div>
          ))}
        </Panel>
      </div>
      <div className="c12">
        <Panel title="News" acts={<Link to="/news" className="btn sm">All news</Link>} flush>
          {w.news.slice(0, 7).map((n) => (
            <div key={n.id} className="list-row">
              <span className="tiny dim nowrap" style={{ width: 70 }}>{fmtDate(n.day, { year: false })}</span>
              <span className={n.big ? "" : "muted"} style={{ fontWeight: n.big ? 600 : 400 }}>{n.text}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function ManagerHome({ w }: { w: World }) {
  const a = w.career.agency!;
  const clients = w.career.fighters.map((id) => w.fighters[id]).filter(Boolean);
  const decisions = blocking(w);
  return (
    <div className="grid">
      <div className="c12">
        <div className="hero">
          <div className="spread" style={{ flexWrap: "wrap" }}>
            <div>
              <div className="name">
                <small>MMA management</small>
                {a.name}
              </div>
              <div className="facts">
                <span>Reputation <b>{Math.round(a.rep)}</b></span>
                <span>Clients <b>{clients.length}</b></span>
                <span>Cut <b>{a.cut}%</b> of purses, 20% of sponsorship</span>
                <span>Agents <b>{a.staff}</b></span>
              </div>
            </div>
            <div className="record">
              {money(w.career.money)}
              <small>In the bank</small>
            </div>
          </div>
        </div>
      </div>
      {decisions.length > 0 && (
        <div className="c12">
          <div className="notice warn row">
            <Icons.alert /> <b>{decisions.length} decision{decisions.length > 1 ? "s" : ""} waiting:</b> {decisions[0].subject}
            <div style={{ flex: 1 }} />
            <Link to={`/inbox/${decisions[0].id}`} className="btn sm gold">Open</Link>
          </div>
        </div>
      )}
      <div className="c8">
        <Panel title="Clients" acts={<Link to="/scouting" className="btn sm primary">Sign fighters</Link>} flush>
          {clients.length === 0 ? (
            <Empty title="No clients">Sign fighters from the Scouting page.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Fighter</th><th>Promotion</th><th className="r">Record</th><th className="c">Overall</th><th>Form</th><th>Next</th></tr>
              </thead>
              <tbody>
                {clients.map((f) => {
                  const b = f.booked ? w.bouts[f.booked] : null;
                  const offer = w.career.fightOffers.find((o) => o.fighter === f.id && o.status === "open");
                  return (
                    <tr key={f.id} className="click" onClick={() => go(`/fighter/${f.id}`)}>
                      <td><span className="row tight"><RankBadge w={w} f={f} /><FighterLink w={w} id={f.id} /></span><div className="tiny dim">{DIVISIONS[f.div].name}</div></td>
                      <td>{f.promo ? PROMOTIONS[f.promo].short : "Free agent"}</td>
                      <td className="r">{f.amateur ? `${f.am.w}-${f.am.l} am` : recordText(f)}</td>
                      <td className="c"><Ovr v={ovr(f.attrs)} sm /></td>
                      <td><Form w={w} f={f} /></td>
                      <td className="small">
                        {b && !b.pending ? <>vs <b>{w.fighters[b.a === f.id ? b.b : b.a].surname}</b>, {weeksText(b.day - w.day)}</> : offer ? <span className="badge gold">Offer</span> : f.injury && f.injury.until > w.day ? <span className="badge bad">Injured</span> : <span className="dim">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
      <div className="c4 stack">
        <Panel title="Inbox" acts={<Link to="/inbox" className="btn sm">All</Link>} flush>
          {w.inbox.slice(0, 6).map((m) => (
            <div key={m.id} className="list-row" onClick={() => go(`/inbox/${m.id}`)} style={{ cursor: "pointer" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ellip" style={{ fontWeight: m.read ? 500 : 700 }}>{m.subject}</div>
                <div className="tiny dim">{m.from} · {fmtDate(m.day)}</div>
              </div>
              {m.needs && !m.done && <span className="badge gold">Decide</span>}
            </div>
          ))}
        </Panel>
      </div>
      <div className="c12">
        <Panel title="News" acts={<Link to="/news" className="btn sm">All news</Link>} flush>
          {w.news.slice(0, 7).map((n) => (
            <div key={n.id} className="list-row">
              <span className="tiny dim nowrap" style={{ width: 70 }}>{fmtDate(n.day, { year: false })}</span>
              <span className={n.big ? "" : "muted"} style={{ fontWeight: n.big ? 600 : 400 }}>{n.text}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
