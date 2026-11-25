import { fmtDate, weeksText, ageYears, DOW, MONTHS, ymd } from "../../core/time";
import { SpotlightPanel } from "./Media";
import { FIGHT_STYLES } from "../../data/fightstyles";
import { fightStyle } from "../../world/fightstyle";
import { money } from "../../core/util";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS } from "../../data/promotions";
import { countryOf } from "../../data/countries";
import { ovr } from "../../model/attributes";
import type { Fighter, News, World } from "../../model/types";
import { blocking } from "../../career/inbox";
import { answer } from "../../career/actions";
import { askForFight } from "../../career/offers";
import { upcomingOf } from "../../world/calendar";
import { fullName, isChampion, rankLabel, rankNumber, recordText } from "../../world/core";
import { changed, toast, useWorld } from "../../state/store";
import { Link, go } from "../router";
import { Bar, Empty, FighterLink, Flag, Form, Ovr, Panel, RankBadge, Spark } from "../components";
import { Band, Mark } from "../art";
import { goatRank, legacyText } from "../../world/legacy";
import { prepText, campPrep } from "../../career/camp";
import { runwayMonths } from "../../career/money";
import { sponsorIncomeFor } from "../../career/sponsors";
import { primeText } from "../../world/development";
import { useState } from "react";
import { becomeManager, careerRecap } from "../../career/retire";
import { moneyline } from "../../world/odds";
import { FightOfferView, InjuryCard } from "../advice";
import { isBeltFight, stakeLabel } from "../../world/belts";

export function Home() {
  const w = useWorld();
  if (w.career.mode === "manager") return <ManagerHome w={w} />;
  const f = w.fighters[w.career.fighters[0]];
  if (!f && w.career.retiredFighter) return <AfterFighting w={w} />;
  return <FighterHome w={w} f={f} />;
}

function AfterFighting({ w }: { w: World }) {
  const f = w.fighters[w.career.retiredFighter!];
  const [name, setName] = useState(`${f.surname} Management`);
  const rc = careerRecap(w, f);
  return (
    <>
      <Band word={f.surname} eyebrow="Retired" first={f.first} title={f.surname} sub={rc.lines.join(" ")} right={<Mark label="Legacy" sub={`${legacyText(rc.legacy)}${rc.goat ? ` · #${rc.goat} all-time` : ""}`}>{Math.round(rc.legacy)}</Mark>} />
      <div className="wrap page-body">
        <div className="grid">
          <div className="c6">
            <Panel title="What's next">
              <p className="muted">Fighters become managers, coaches, commentators. Open a management company in this world with your name, your savings ({money(w.career.money)}) and a reputation built on your career, then sign the next generation.</p>
              <div className="row" style={{ marginTop: 10 }}>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Agency name" />
                <button className="btn primary" onClick={() => { toast(becomeManager(w, name), "good"); changed(); go("/scouting"); }}>Open the agency</button>
              </div>
              <hr className="sep" />
              <p className="small dim">Or simply watch the sport go on: Continue keeps the world running, and the Legacy page follows the Hall of Fame.</p>
              <Link to="/legacy" className="textlink">Legacy and the Hall of Fame</Link>
            </Panel>
          </div>
          <div className="c6"><TopStories w={w} items={storiesFor(w)} /></div>
        </div>
      </div>
    </>
  );
}

/** The next fight as a broadcast graphic: red corner, blue corner, the countdown. */
export function NextFightCard({ w, f }: { w: World; f: Fighter }) {
  const b = f.booked ? w.bouts[f.booked] : null;
  const offer = w.career.fightOffers.find((o) => o.fighter === f.id && o.status === "open");
  if (b && b.status === "booked" && !b.pending) {
    const opp = w.fighters[b.a === f.id ? b.b : b.a];
    const ev = w.events[b.ev];
    const days = b.day - w.day;
    const title = isBeltFight(b);
    return (
      <section className="broadcast" aria-label="Next fight">
        <div className="scorebug">
          <div className="side a">
            <span className="label" style={{ color: "rgba(255,255,255,0.7)" }}>{rankLabel(w, f) || "Unranked"} · {recordText(f)}</span>
            <span className="nm">{f.surname}</span>
            <span className="rec">{f.first}</span>
          </div>
          <div className="mid">
            <div className="rd">{stakeLabel(b) ?? `${b.rounds} rounds`}</div>
            <div className="clock">{days <= 0 ? "Tonight" : days}</div>
            <div className="pos">{days <= 0 ? `${title || b.kind === "eliminator" ? `${b.rounds} rounds` : b.order === 0 ? "Main event" : b.order === 1 ? "Co-main event" : `${DIVISIONS[b.div].name} bout`}` : days === 1 ? "day to go" : "days to go"}</div>
          </div>
          <div className="side b">
            <span className="label" style={{ color: "rgba(255,255,255,0.7)" }}>{recordText(opp)} · {rankLabel(w, opp) || "Unranked"}</span>
            <span className="nm"><Link to={`/fighter/${opp.id}`}>{opp.surname}</Link></span>
            <span className="rec">{opp.first}</span>
          </div>
        </div>
        <div className="bc-ctrl" style={{ justifyContent: "space-between" }}>
          <span className="small" style={{ color: "var(--band-ink-2)" }}>
            <b style={{ color: "var(--band-ink)" }}>{ev?.name}</b> · {fmtDate(b.day, { dow: true })} · {ev?.venue}, {ev?.city}
            {w.career.fc[f.id]?.camp ? ` · Preparation: ${prepText(campPrep(w, f, b))}` : ""}
          </span>
          {days <= 0 ? <Link to="/fightnight" className="btn primary sm">Fight night</Link> : <Link to={`/fight/${f.id}`} className="btn primary sm">Fight camp</Link>}
        </div>
      </section>
    );
  }
  if (offer) {
    const opp = w.fighters[offer.opp];
    const msg = w.inbox.find((m) => m.ref === offer.id && m.needs);
    const yes = msg?.actions?.find((a) => a.id === "accept")?.label ?? "Accept";
    const no = msg?.actions?.find((a) => a.id === "decline")?.label ?? "Decline";
    return (
      <Panel title={offer.stay ? "New opponent" : offer.shortNotice ? "Short-notice call" : `${PROMOTIONS[offer.promo].short} fight offer`} hint={offer.expires <= w.day ? "answer today" : `answer by ${fmtDate(offer.expires)}`} className={offer.shortNotice ? "accent" : "gold"}>
        <FightOfferView w={w} o={offer} f={f} compact />
        {msg && (
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={() => { toast(answer(w, msg.id, "accept"), "good"); changed(); }}>{yes}</button>
            <button className="btn danger" onClick={() => { toast(answer(w, msg.id, "decline")); changed(); }}>{no}</button>
            <Link to={`/inbox/${msg.id}`} className="textlink">All the reasons</Link>
            <Link to={`/fighter/${opp.id}`} className="textlink">Scout {opp.surname}</Link>
          </div>
        )}
      </Panel>
    );
  }
  const fc = w.career.fc[f.id];
  // An interim champion waits for a fight for the belts.
  const ps = f.promo ? w.promos[f.promo] : null;
  const champ = ps && ps.interim[f.div] === f.id && ps.champs[f.div] ? w.fighters[ps.champs[f.div]!] : null;
  const champOut = champ?.injury && champ.injury.until > w.day ? champ.injury.until : null;
  const waiting = champ
    ? `You hold the interim belt, and every fight is for it. ${champ.surname} ${champOut ? `is out until ${fmtDate(champOut)}: a long wait means an interim title defence first, then the unification.` : "is fit, so the next fight is the unification."}`
    : null;
  return (
    <Panel title="Next fight">
      <Empty title="No fight booked">
        {f.injury && f.injury.until > w.day ? `Injured until ${fmtDate(f.injury.until)}.` : f.susp > w.day ? `Medically suspended until ${fmtDate(f.susp)}.` : waiting ?? (fc?.asked ? "The matchmaker knows you want a fight." : "Offers come when the next cards are made.")}
      </Empty>
      {!fc?.asked && f.promo && !(f.injury && f.injury.until > w.day) && f.susp <= w.day && (
        <div className="center" style={{ paddingBottom: 8 }}>
          <button className="btn" onClick={() => { toast(askForFight(w, f)); changed(); }}>Ask the matchmaker for a fight</button>
        </div>
      )}
    </Panel>
  );
}

export function ConditionPanel({ w, f }: { w: World; f: Fighter }) {
  const limit = DIVISIONS[f.div].limit;
  const over = f.walk - limit;
  const row = (k: string, v: number, kind?: "red" | "gold" | "info" | "warn", note?: string) => (
    <div>
      <div className="spread"><span className="label">{k}</span><b className="num" style={{ fontSize: 20 }}>{v}</b></div>
      <Bar v={v} kind={kind} thin />
      {note && <div className="tiny dim" style={{ marginTop: 3 }}>{note}</div>}
    </div>
  );
  return (
    <Panel title="Condition">
      <div className="stack" style={{ gap: 12 }}>
        {row("Fatigue", f.fatigue, f.fatigue > 65 ? "red" : f.fatigue > 45 ? "warn" : undefined, f.fatigue > 60 ? "Overreaching: growth slows, injuries come" : undefined)}
        {row("Sharpness", f.sharp, "info")}
        {row("Morale", f.morale, "gold")}
        <div className="spread small"><span className="label">Walking weight</span><b>{f.walk} lb <span className="dim">({over > 0 ? `${over} over` : "on"} {limit})</span></b></div>
        {f.injury && f.injury.until > w.day && <InjuryCard w={w} f={f} />}
        {f.susp > w.day && <div className="notice warn small">Medical suspension until {fmtDate(f.susp)}</div>}
      </div>
    </Panel>
  );
}

export function TopStories({ w, items, title = "Top stories" }: { w: World; items: News[]; title?: string }) {
  return (
    <div className="stories">
      <h3>{title}</h3>
      {items.length === 0 && <p className="small" style={{ color: "var(--band-ink-3)" }}>Nothing yet.</p>}
      {items.map((n, i) => (
        <div key={n.id} className="story">
          <div className="no">{i + 1}</div>
          <div>
            <div className="k">{n.promo ? PROMOTIONS[n.promo].short : "MMA"} · {n.kind} · {fmtDate(n.day, { year: false })}</div>
            <div className="t">{n.ev ? <Link to={`/event/${n.ev}`}>{n.text}</Link> : n.text}</div>
          </div>
        </div>
      ))}
      <div style={{ padding: "8px 0 12px" }}><Link to="/news" className="textlink">All news</Link></div>
    </div>
  );
}

function storiesFor(w: World, n = 6): News[] {
  const mine = new Set(w.career.fighters);
  const score = (x: News) => (x.fighters?.some((id) => mine.has(id)) ? 3 : 0) + (x.promo === "ufc" ? 2 : x.promo === "pfl" ? 1 : 0) + (x.big ? 1 : 0) - (w.day - x.day) / 14;
  return w.news.slice(0, 120).filter((x) => score(x) > -1).sort((a, b) => score(b) - score(a)).slice(0, n);
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
  const rl = rankLabel(w, f);
  const r = f.amateur ? f.am : f.rec;
  return (
    <>
      <Band
        eyebrow={
          <>
            {rl === "C" ? <span className="tag gold">Champion</span> : rl ? <span className="tag red">{rl}</span> : null}
            <span>{DIVISIONS[f.div].name}</span>
            <span>{f.promo ? PROMOTIONS[f.promo].name : "Free agent"}</span>
          </>
        }
        first={<>{f.first}{f.nick ? <span style={{ color: "var(--band-ink-3)" }}> · "{f.nick}"</span> : null}</>}
        title={f.surname}
        word={f.surname}
        right={
          <Mark gold={rl === "C"} label={rl === "C" ? `${PROMOTIONS[f.promo!].short} champion` : rl === "IC" ? "Interim champion" : rl ? `${DIVISIONS[f.div].name} rank` : "Overall rating"} sub={rl ? `Overall ${o} · ${legacyText(f.legacy ?? 0)}` : `${legacyText(f.legacy ?? 0)}${goatRank(w, f) ? ` · #${goatRank(w, f)} all-time` : ""}`}>
            {rl === "C" ? "C" : rl || o}
          </Mark>
        }
      >
        <div className="factgrid">
          <div><div className="k">From</div><div className="v row tight" title={`${f.hometown}, ${countryOf(f.country).name}`}><Flag code={f.country} /> <span className="ellip">{f.hometown}, {countryOf(f.country).name}</span></div></div>
          <div><div className="k">Age</div><div className="v">{age} · {primeText(f, w.day).toLowerCase()}</div></div>
          <div><div className="k">Styles</div><div className="v">{FIGHT_STYLES[fightStyle(f).s].name} · {FIGHT_STYLES[fightStyle(f).g].name}</div></div>
          <div><div className="k">Team</div><div className="v ellip">{w.gyms[f.gym]?.name}</div></div>
          <div><div className="k">Form</div><div className="v"><Form w={w} f={f} n={6} /></div></div>
          <div><div className="k">Overall</div><div className="v row tight">{o} <Spark points={(fc?.progress ?? []).map((p) => p.ovr)} w={90} h={20} color="#ea2e2c" /></div></div>
        </div>
        <div className="bignums">
          <div>
            <div className="n">{r.w}-{r.l}{r.d ? `-${r.d}` : ""}</div>
            <div className="k">{f.amateur ? "Amateur record" : "Pro record"}</div>
            {!f.amateur && f.am.w + f.am.l + f.am.d > 0 && <div className="k-sub">Amateur {f.am.w}-{f.am.l}{f.am.d ? `-${f.am.d}` : ""}</div>}
          </div>
          <div><div className="n">{r.koW}</div><div className="k">Wins by knockout</div></div>
          <div><div className="n">{r.subW}</div><div className="k">Wins by submission</div></div>
          <div><div className="n">{money(w.career.money)}</div><div className="k">In the bank</div></div>
        </div>
      </Band>
      <div className="wrap page-body">
        {decisions.length > 0 && (
          <div className="notice warn row" style={{ marginBottom: 20 }}>
            <b>{decisions.length} decision{decisions.length > 1 ? "s" : ""} waiting:</b> {decisions[0].subject}
            <div style={{ flex: 1 }} />
            <Link to={`/inbox/${decisions[0].id}`} className="btn sm gold">Open</Link>
          </div>
        )}
        <div className="grid">
          <div className="c8 stack">
            <NextFightCard w={w} f={f} />
            <div className="grid">
              <div className="c6 stack">
                <ConditionPanel w={w} f={f} />
              </div>
              <div className="c6 stack">
                <Panel title="This week" acts={<Link to="/training" className="textlink">Training</Link>}>
                  {fc && (
                    <div className="small">
                      <p>
                        <b>{fc.plan.template === "custom" ? "Custom week" : fc.plan.template.replace(/^./, (c) => c.toUpperCase())}</b> at {["light", "normal", "hard"][fc.plan.intensity]} intensity{fc.dayJob ? ", around a day job" : ""}.{fc.plan.drill ? ` Drilling ${fc.plan.drill}.` : ""}
                      </p>
                      {fc.week && <p className="muted">Last week: +{Object.values(fc.week.growth).reduce((a, b) => a + (b ?? 0), 0).toFixed(2)} attribute points, fatigue {Math.round(fc.week.fatigue)}.{fc.week.injury ? ` Injury: ${fc.week.injury}.` : ""}</p>}
                    </div>
                  )}
                </Panel>
                <Panel title="Deal" acts={<Link to="/contracts" className="textlink">Contracts</Link>}>
                  {f.contract && f.promo ? (
                    <dl className="kv">
                      <dt>Promotion</dt><dd>{PROMOTIONS[f.promo].short}</dd>
                      {PROMOTIONS[f.promo].tier !== "amateur" && (
                        <>
                          <dt>Fights left</dt><dd>{f.contract.left} of {f.contract.fights}</dd>
                          <dt>Purse</dt><dd>{money(f.contract.show)}{f.contract.win ? ` + ${money(f.contract.win)}` : " flat"}</dd>
                        </>
                      )}
                      <dt>Sponsors</dt><dd>{money(sponsorIncomeFor(w, f.id))}/mo</dd>
                      <dt>Runway</dt><dd className={w.career.money < 0 ? "bad" : ""}>{runwayMonths(w) > 60 ? "Years" : `${Math.max(0, Math.floor(runwayMonths(w)))} months`}</dd>
                    </dl>
                  ) : (
                    <Empty title="No contract">Offers arrive at the start of each month.</Empty>
                  )}
                </Panel>
              </div>
            </div>
            <Panel title="Inbox" acts={<Link to="/inbox" className="textlink">All messages</Link>} flush>
              {w.inbox.slice(0, 5).map((m) => (
                <div key={m.id} className="list-row" onClick={() => go(`/inbox/${m.id}`)} style={{ cursor: "pointer" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ellip" style={{ fontWeight: m.read ? 500 : 800 }}>{m.subject}</div>
                    <div className="tiny dim">{m.from} · {fmtDate(m.day)}</div>
                  </div>
                  {m.needs && !m.done && <span className="badge gold">Decide</span>}
                </div>
              ))}
            </Panel>
          </div>
          <div className="c4 stack">
            {f.status === "active" && <SpotlightPanel w={w} f={f} />}
            <TopStories w={w} items={storiesFor(w)} />
            {ps && f.promo && PROMOTIONS[f.promo].rankSize > 0 && (
              <Panel title={`${PROMOTIONS[f.promo].short} ${DIVISIONS[f.div].name}`} acts={<Link to={`/rankings/${f.promo}`} className="textlink">Rankings</Link>} flush>
                <div className="rk-list">
                  {champ && (
                    <div className={`rk-item${w.fighters[champ]?.ctrl ? " me" : ""}`}><span className="rank c">C</span><FighterLink w={w} id={champ} /><span className="tiny dim">{w.fighters[champ] ? recordText(w.fighters[champ]) : ""}</span></div>
                  )}
                  {ranks.slice(0, 10).map((id, i) => (
                    <div key={id} className={`rk-item${w.fighters[id]?.ctrl ? " me" : ""}`}>{ps.interim[f.div] === id ? <span className="rank ic">IC</span> : <span className="n">{rankNumber(ranks, ps.interim[f.div] ?? null, i)}</span>}<FighterLink w={w} id={id} /><span className="tiny dim">{recordText(w.fighters[id])}</span></div>
                  ))}
                </div>
              </Panel>
            )}
            <Panel title="Coming up" flush>
              {events.map((e) => {
                const t = ymd(e.day);
                return (
                  <div className="list-row" key={e.id} onClick={() => go(`/event/${e.id}`)} style={{ cursor: "pointer" }}>
                    <div className="date"><b>{t.d}</b><span>{MONTHS[t.m]}</span></div>
                    <div style={{ minWidth: 0 }}>
                      <div className="disp up" style={{ fontSize: 17 }}>{e.name}</div>
                      <div className="tiny dim">{DOW[t.dow]} · {e.city}</div>
                    </div>
                  </div>
                );
              })}
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

function ManagerHome({ w }: { w: World }) {
  const a = w.career.agency!;
  const clients = w.career.fighters.map((id) => w.fighters[id]).filter(Boolean);
  const decisions = blocking(w);
  const champs = clients.filter((f) => isChampion(w, f)).length;
  const ranked = clients.filter((f) => rankLabel(w, f)).length;
  return (
    <>
      <Band eyebrow="MMA management" title={a.name} sub={`${w.career.name} runs the stable. ${a.cut}% of purses, 20% of sponsorship.`}>
        <div className="bignums">
          <div><div className="n">{clients.length}</div><div className="k">Clients</div></div>
          <div><div className="n">{champs}</div><div className="k">Champions</div></div>
          <div><div className="n">{ranked}</div><div className="k">Ranked</div></div>
          <div><div className="n">{Math.round(a.rep)}</div><div className="k">Reputation</div></div>
          <div><div className="n">{money(w.career.money)}</div><div className="k">In the bank</div></div>
        </div>
      </Band>
      <div className="wrap page-body">
        {decisions.length > 0 && (
          <div className="notice warn row" style={{ marginBottom: 20 }}>
            <b>{decisions.length} decision{decisions.length > 1 ? "s" : ""} waiting:</b> {decisions[0].subject}
            <div style={{ flex: 1 }} />
            <Link to={`/inbox/${decisions[0].id}`} className="btn sm gold">Open</Link>
          </div>
        )}
        <div className="grid">
          <div className="c8 stack">
            <section className="sec">
              <div className="sec-h"><h2>The stable</h2><div className="acts"><Link to="/scouting" className="btn primary sm">Sign fighters</Link></div></div>
              <div className="panel">
                {clients.length === 0 ? (
                  <Empty title="No clients">Sign fighters from Scouting.</Empty>
                ) : (
                  <table className="tbl">
                    <thead><tr><th>Fighter</th><th>Promotion</th><th className="r">Record</th><th className="c">Ovr</th><th>Form</th><th>Next</th></tr></thead>
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
                            <td className="small">{b && !b.pending ? <>vs <b>{w.fighters[b.a === f.id ? b.b : b.a].surname}</b>, {weeksText(b.day - w.day)}</> : offer ? <span className="badge gold">Offer</span> : f.injury && f.injury.until > w.day ? <span className="badge bad">Injured</span> : <span className="dim">-</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
            <Panel title="Inbox" acts={<Link to="/inbox" className="textlink">All messages</Link>} flush>
              {w.inbox.slice(0, 6).map((m) => (
                <div key={m.id} className="list-row" onClick={() => go(`/inbox/${m.id}`)} style={{ cursor: "pointer" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ellip" style={{ fontWeight: m.read ? 500 : 800 }}>{m.subject}</div>
                    <div className="tiny dim">{m.from} · {fmtDate(m.day)}</div>
                  </div>
                  {m.needs && !m.done && <span className="badge gold">Decide</span>}
                </div>
              ))}
            </Panel>
          </div>
          <div className="c4 stack">
            <TopStories w={w} items={storiesFor(w, 7)} />
          </div>
        </div>
      </div>
    </>
  );
}

export { fullName };
