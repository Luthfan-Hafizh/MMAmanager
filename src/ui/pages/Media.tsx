// The spotlight: followers and hype, the media schedule for the next fight,
// the division's fights to talk about, the rivalries and their heat, calling
// anyone out, the BMF race, and everything said in public. And the press room,
// where the questions are answered one at a time.

import { useEffect, useState } from "react";
import { fmtDate } from "../../core/time";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS } from "../../data/promotions";
import { methodText } from "../../engine/sim";
import type { AnswerTone, Bout, Fighter, MediaSession, World } from "../../model/types";
import { compact, fightHype, followers, heatOf, hypeLabel, rivalsOf } from "../../career/rivals";
import { bmfEligible, CALL_TONES, calloutCheck, calloutChoices, callOut, makePeace, TALK_TONES, talkableFights, talkFight, type CallTone, type TalkTone } from "../../career/social";
import { answerQuestion, bigFight, finishSession, KIND_NAME, sessionById, sessionComplete, TONE_NAME } from "../../career/media";
import { bmfRace, stakeLabel } from "../../world/belts";
import { fullName, rankLabel, recordText, withRng } from "../../world/core";
import { changed, toast, useWorld } from "../../state/store";
import { Link } from "../router";
import { Empty, FighterLink, Panel, Seg } from "../components";
import { Band, Mark } from "../art";
import { FighterSwitch } from "./Training";

export function Media({ id }: { id?: string }) {
  const w = useWorld();
  const fid = id && w.career.fc[id] ? id : w.career.fighters[0];
  const f = fid ? w.fighters[fid] : undefined;
  if (!f) return <div className="wrap page-body"><Empty title="No fighter">Sign a client or start a fighter career and the spotlight follows.</Empty></div>;
  const rivals = rivalsOf(w, f);
  const nb = f.booked ? w.bouts[f.booked] : null;
  const next = nb && nb.status === "booked" && !nb.pending ? nb : null;
  const opp = next ? w.fighters[next.a === f.id ? next.b : next.a] : null;
  const hype = next ? fightHype(w, next) : null;
  const top = rivals[0];
  return (
    <>
      <Band
        eyebrow={
          <>
            <span className="tag red">Spotlight</span>
            <span className="tag">{DIVISIONS[f.div].name}</span>
            {f.promo && <span className="tag">{PROMOTIONS[f.promo].short}</span>}
          </>
        }
        first={f.first}
        title={f.surname}
        word={f.surname}
        right={<Mark label="Followers" sub={`Popularity ${Math.round(f.pop)} of 100`}>{compact(followers(f.pop))}</Mark>}
      >
        <div className="factgrid">
          <div><div className="k">Next fight</div><div className="v">{opp ? `${opp.first} ${opp.surname}` : "Not booked"}</div></div>
          <div><div className="k">Fight hype</div><div className="v">{hype !== null ? `${hype} · ${hypeLabel(hype)}` : "–"}</div></div>
          <div><div className="k">Hottest rivalry</div><div className="v">{top ? `${top.f.surname} · heat ${Math.round(top.r.heat)}` : "None yet"}</div></div>
        </div>
      </Band>
      <div className="wrap page-body">
        {w.career.fighters.length > 1 && <div style={{ marginBottom: 16 }}><FighterSwitch w={w} id={f.id} base="/media" /></div>}
        <div className="grid">
          <div className="c8 stack">
            {next && opp && <Schedule w={w} f={f} b={next} opp={opp} />}
            <FightTalk w={w} f={f} />
            <Moments w={w} f={f} />
          </div>
          <div className="c4 stack">
            <CallOutPanel w={w} f={f} />
            <Rivalries w={w} f={f} />
            <BmfPanel w={w} f={f} />
          </div>
        </div>
      </div>
    </>
  );
}

function inDays(n: number): string {
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}

function Schedule({ w, f, b, opp }: { w: World; f: Fighter; b: Bout; opp: Fighter }) {
  const ev = w.events[b.ev];
  const hype = fightHype(w, b);
  const heat = heatOf(w, f.id, opp.id);
  const msg = (kind: string) => w.inbox.find((m) => m.ref === b.id && m.fighter === f.id && m.data?.kind === kind);
  const status = (kind: string, day: number) => {
    const m = msg(kind);
    if (m?.done) return <span className="badge">Done</span>;
    if (m?.needs) return <Link to={`/inbox/${m.id}`} className="badge gold">Waiting</Link>;
    return <span className="badge soft">{inDays(day - w.day)}</span>;
  };
  const rows: { day: number; what: string; note: string; el: JSX.Element }[] = [];
  if (bigFight(w, b)) rows.push({ day: Math.max(w.day, b.day - 42), what: "Press conference", note: "Five or six weeks out, for the big fights", el: status("presser", b.day - 42) });
  rows.push({ day: b.day - 3, what: "Media day", note: "The questions in fight week", el: status("mediaday", b.day - 3) });
  rows.push({ day: b.day - 1, what: "Weigh-ins and the face-off", note: b.weighIn ? `${b.weighIn[b.a === f.id ? "a" : "b"].toFixed(1)} lb` : "The scale, then the cameras", el: b.weighIn ? <span className="badge">Done</span> : <span className="badge soft">{inDays(b.day - 1 - w.day)}</span> });
  rows.push({ day: b.day, what: "Fight night", note: ev ? `${ev.name}, ${ev.city}` : "", el: <span className="badge soft">{b.day - w.day <= 0 ? "Tonight" : inDays(b.day - w.day)}</span> });
  return (
    <Panel title="The road to the fight" hint={`${f.surname} vs ${opp.surname}${stakeLabel(b) ? ` · ${stakeLabel(b)}` : ""}`}>
      <div className="hype">
        <div className="hype-n">
          <b>{hype}</b>
          <span>Fight hype</span>
        </div>
        <div className="hype-body">
          <div className="hype-bar"><i style={{ width: `${hype}%` }} /></div>
          <div className="spread small"><span><b>{hypeLabel(hype)}</b></span><span className="dim">{heat ? `Heat with ${opp.surname}: ${heat}` : `No bad blood with ${opp.surname} yet`}</span></div>
          <p className="tiny dim" style={{ marginTop: 4 }}>The names, the stakes, the bad blood and the talk. A UFC main event with big hype pays its stars a share of the pay-per-view.</p>
        </div>
      </div>
      <ol className="road">
        {rows.map((r) => (
          <li key={r.what} className={r.day < w.day ? "past" : ""}>
            <span className="road-d">{fmtDate(r.day, { year: false })}</span>
            <span className="road-w"><b>{r.what}</b><span className="tiny dim">{r.note}</span></span>
            {r.el}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function FightTalk({ w, f }: { w: World; f: Fighter }) {
  const list = talkableFights(w, f, 5);
  return (
    <Panel title="Fight talk" hint="The division's fights: the fans want your take" flush>
      {list.length === 0 && <div className="panel-b"><Empty title="Nothing to talk about yet">Notable fights in your division from the last month show up here: say something and the heat follows.</Empty></div>}
      {list.map((b) => {
        const won = b.res!.winner === "a";
        const winner = w.fighters[won ? b.a : b.b];
        const loser = w.fighters[won ? b.b : b.a];
        const ev = w.events[b.ev];
        const stake = stakeLabel(b);
        return (
          <div key={b.id} className="talk">
            <div className="talk-fight">
              <div className="tiny dim">{ev?.name} · {fmtDate(b.day, { year: false })}{stake ? ` · ${stake}` : ""}</div>
              <div className="talk-res">
                <FighterLink w={w} id={winner.id} short flag={false} />
                <span className="dim">beat</span>
                <FighterLink w={w} id={loser.id} short flag={false} />
              </div>
              <div className="tiny dim">{methodText(b.res!.method, b.res!.detail)}{b.res!.method !== "DEC" ? `, round ${b.res!.round}` : ""}</div>
            </div>
            <div className="talk-acts">
              {(Object.keys(TALK_TONES) as TalkTone[]).map((t) => (
                <button
                  key={t}
                  className={`btn sm${t === "mock" ? " danger" : t === "callout" ? " primary" : ""}`}
                  title={TALK_TONES[t].desc}
                  onClick={() => {
                    const text = withRng(w, (rng) => talkFight(w, rng, f, b, t));
                    toast(text, "info");
                    changed();
                  }}
                >
                  {TALK_TONES[t].label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

const MOMENT_LABEL: Record<string, string> = { callout: "Call-out", talk: "Fight talk", press: "Press", faceoff: "Face-off", life: "Life", reply: "Reply" };

function Moments({ w, f }: { w: World; f: Fighter }) {
  const list = w.career.fc[f.id]?.moments ?? [];
  return (
    <Panel title="In the press" hint="What was said and done in public" flush>
      {!list.length && <div className="panel-b"><Empty title="Nothing yet">Call-outs, press conferences, face-offs and the rest show up here.</Empty></div>}
      {list.length > 0 && (
        <ol className="moments">
          {list.slice(0, 18).map((m, i) => (
            <li key={i} className={`k-${m.kind}`}>
              <span className="moment-k">{MOMENT_LABEL[m.kind] ?? m.kind}</span>
              <span className="moment-t">{m.text}</span>
              <span className="moment-d">{fmtDate(m.day, { year: false })}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Rivalries({ w, f }: { w: World; f: Fighter }) {
  const list = rivalsOf(w, f).slice(0, 6);
  return (
    <Panel title="Rivalries" hint="Heat sells fights" flush>
      {!list.length && <div className="panel-b"><Empty title="No bad blood yet">Call someone out, or answer back when someone calls you out.</Empty></div>}
      {list.map(({ f: o, r }) => (
        <div key={o.id} className="rival">
          <div className="rival-h">
            <FighterLink w={w} id={o.id} rank short />
            <b className="rival-n">{Math.round(r.heat)}</b>
          </div>
          <div className={`heat${r.heat >= 60 ? " hot" : ""}`}><i style={{ width: `${Math.round(r.heat)}%` }} /></div>
          <div className="spread">
            <span className="tiny dim ellip">{r.notes[0] ? `${r.notes[0].text} · ${fmtDate(r.notes[0].day, { year: false })}` : ""}</span>
            <button className="textlink small" onClick={() => { toast(makePeace(w, f, o)); changed(); }}>Make peace</button>
          </div>
        </div>
      ))}
    </Panel>
  );
}

/** Call a fighter out: pick the name and the tone; the fans and the other fighter react. */
export function CallOutPanel({ w, f, target }: { w: World; f: Fighter; target?: Fighter }) {
  const choices = target ? [target] : calloutChoices(w, f);
  const [tid, setTid] = useState(target?.id ?? choices[0]?.id ?? "");
  const [tone, setTone] = useState<CallTone>("callout");
  const [res, setRes] = useState<string | null>(null);
  const t = w.fighters[target?.id ?? tid];
  if (f.status !== "active") return null;
  if (!t) return <Panel title="Call someone out"><Empty title="Nobody to call out">Get into a promotion and the names come.</Empty></Panel>;
  const ck = calloutCheck(w, f, t);
  return (
    <Panel title={target ? `Call out ${t.surname}` : "Call someone out"} className="callout-panel">
      {!target && (
        <label className="field">
          <span className="label">Who</span>
          <select className="input" value={t.id} onChange={(e) => { setTid(e.target.value); setRes(null); }}>
            {choices.map((x) => (
              <option key={x.id} value={x.id}>{rankLabel(w, x) ? `${rankLabel(w, x)} · ` : ""}{fullName(x)} ({recordText(x)}){heatOf(w, f.id, x.id) ? ` · heat ${heatOf(w, f.id, x.id)}` : ""}</option>
            ))}
          </select>
        </label>
      )}
      <div className="seg-full" style={{ marginTop: 10 }}>
        <Seg value={tone} onChange={(v) => { setTone(v); setRes(null); }} options={(Object.keys(CALL_TONES) as CallTone[]).map((k) => ({ v: k, label: CALL_TONES[k].label }))} />
      </div>
      <p className="tiny dim" style={{ margin: "8px 0 10px" }}>{CALL_TONES[tone].desc}</p>
      {ck.ok ? (
        <ul className="ck">
          <li className={ck.credible ? "ok" : "no"}>{ck.credible ? "The fans will take it seriously" : "Too big a jump: the fans will laugh"}</li>
          <li className={ck.bookable ? "ok" : "info"}>{ck.bookable ? "The matchmaker can make this fight" : "Another promotion or division: talk only"}</li>
          {ck.bmf && <li className="ok">A call for the BMF title</li>}
        </ul>
      ) : (
        <p className="small warn">{ck.why}</p>
      )}
      <button
        className="btn primary"
        style={{ marginTop: 10 }}
        disabled={!ck.ok}
        onClick={() => {
          const r = withRng(w, (rng) => callOut(w, rng, f, t, tone));
          setRes(r.text);
          changed();
        }}
      >
        Post it
      </button>
      {res && <div className="callout-res">{res}</div>}
    </Panel>
  );
}

function BmfPanel({ w, f }: { w: World; f: Fighter }) {
  const bmf = w.promos.ufc?.bmf;
  if (!bmf) return null;
  const holder = bmf.holder ? w.fighters[bmf.holder] : null;
  const cur = bmf.reigns[bmf.reigns.length - 1];
  const race = bmfRace(w, 6);
  const mine = f.promo === "ufc" && f.div === "LW";
  const eligible = bmfEligible(w, f);
  const called = (w.career.fc[f.id]?.bmfCall ?? -1) >= w.day;
  const nextAfter = bmf.last !== undefined ? bmf.last + 240 : w.day;
  const call = () => {
    if (holder && holder.id !== f.id) {
      const r = withRng(w, (rng) => callOut(w, rng, f, holder, "callout", { asBmf: true }));
      toast(r.text);
    } else {
      const fc = w.career.fc[f.id];
      if (fc) fc.bmfCall = w.day + 360;
      toast("You've asked for the vacant BMF title. The promotion likes the sound of it.");
    }
    changed();
  };
  return (
    <Panel title="The BMF title" hint="UFC lightweight" className="bmf-panel">
      <div className="bmf-holder">
        <span className="label">Holder</span>
        {holder ? <FighterLink w={w} id={holder.id} /> : <b>Vacant</b>}
        {holder && cur && <span className="tiny dim">Since {fmtDate(cur.won)}{cur.defenses ? ` · ${cur.defenses} defence${cur.defenses > 1 ? "s" : ""}` : ""}</span>}
      </div>
      <div className="label" style={{ margin: "12px 0 6px" }}>The race</div>
      <ol className="bmf-race">
        {race.map(({ f: x, score }, i) => (
          <li key={x.id} className={x.id === f.id ? "me" : ""}>
            <span className="n">{i + 1}</span>
            <FighterLink w={w} id={x.id} short flag={false} />
            <span className="bar thin"><i style={{ width: `${Math.max(4, Math.min(100, score))}%` }} /></span>
          </li>
        ))}
      </ol>
      <p className="tiny dim" style={{ marginTop: 8 }}>Popular, exciting names: finishes, aggression, a following. The next BMF fight is likely after {fmtDate(nextAfter, { year: true })}.</p>
      {!mine ? (
        <p className="small dim" style={{ marginTop: 8 }}>The BMF title is fought for by UFC lightweights.</p>
      ) : !eligible ? (
        <p className="small" style={{ marginTop: 8 }}>You need a bigger following first (popularity 35 or more; you're at {Math.round(f.pop)}).</p>
      ) : called ? (
        <p className="small good" style={{ marginTop: 8 }}>You've called for it: you're first in line when it's next on the line.</p>
      ) : (
        <button className="btn gold" style={{ marginTop: 10 }} onClick={call}>Call for the BMF title</button>
      )}
    </Panel>
  );
}

/** A small panel for Home: followers, the next fight's hype, the hottest rivalry. */
export function SpotlightPanel({ w, f }: { w: World; f: Fighter }) {
  const nb = f.booked ? w.bouts[f.booked] : null;
  const next = nb && nb.status === "booked" && !nb.pending ? nb : null;
  const hype = next ? fightHype(w, next) : null;
  const top = rivalsOf(w, f)[0];
  const talk = talkableFights(w, f, 3).length;
  return (
    <Panel title="Spotlight" acts={<Link to="/media" className="textlink">Media</Link>}>
      <div className="spot">
        <div><b>{compact(followers(f.pop))}</b><span>Followers</span></div>
        <div><b>{hype ?? "–"}</b><span>{hype !== null ? `Hype · ${hypeLabel(hype)}` : "Fight hype"}</span></div>
      </div>
      {top && (
        <div className="spot-rival">
          <div className="spread small"><span>Hottest rivalry: <b>{top.f.surname}</b></span><b>{Math.round(top.r.heat)}</b></div>
          <div className={`heat${top.r.heat >= 60 ? " hot" : ""}`}><i style={{ width: `${Math.round(top.r.heat)}%` }} /></div>
        </div>
      )}
      {talk > 0 && <p className="small" style={{ marginTop: 10 }}><Link to="/media" className="textlink">{talk} fight{talk > 1 ? "s" : ""} to talk about</Link></p>}
    </Panel>
  );
}

// ---------- the press room ----------

const TONE_FX: Record<AnswerTone, string> = {
  respect: "Calm and classy: a little popularity, less heat, a focused week.",
  confident: "Sells the fight: popularity, a little heat.",
  trash: "The most hype and heat. It fires them up, and it can boil over.",
  funny: "The fans love a laugh: popularity, no heat.",
  deflect: "Gives nothing away: a quiet, focused week.",
};

export function PressRoom({ sid }: { sid: string }) {
  const w = useWorld();
  const s = sessionById(w, sid);
  const [, setTick] = useState(0);
  const cur = s ? s.questions.findIndex((q) => q.picked === undefined) : -1;
  useEffect(() => {
    if (!s || s.done || cur < 0) return;
    const key = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > s.questions[cur].answers.length) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
      answerQuestion(w, s, cur, n - 1);
      changed();
      setTick((t) => t + 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [s, cur, w]);
  if (!s) return <div className="wrap page-body"><Empty title="Press conference not found">It may have been a while ago. <Link to="/media">Back to the media page</Link></Empty></div>;
  const f = w.fighters[s.fighter];
  const opp = w.fighters[s.opp];
  const b = w.bouts[s.bout];
  const ev = b ? w.events[b.ev] : undefined;
  const hype = b ? fightHype(w, b) : 0;
  const complete = sessionComplete(s);
  const heatNow = heatOf(w, f.id, opp.id);
  const trash = s.questions.filter((q) => q.picked !== undefined && q.answers[q.picked].tone === "trash").length;
  // What the answers will actually add: gains come slower near the top.
  const popShown = s.done ? s.pop : s.pop > 0 ? s.pop * (1 - f.pop / 140) : s.pop;
  const heatAfter = Math.max(0, Math.min(100, Math.round(heatNow + s.heat)));
  return (
    <>
      <Band
        eyebrow={
          <>
            <span className="tag red">{KIND_NAME[s.kind]}</span>
            {ev && <span className="tag">{ev.name}</span>}
            <span className="tag">{fmtDate(s.day, { year: false })}</span>
          </>
        }
        first={s.kind === "postfight" ? "After the fight" : ev ? `${ev.city} · fight night ${fmtDate(b.day, { year: false })}` : ""}
        title={<>{f.surname} <span className="vs">vs</span> {opp.surname}</>}
        word="Press"
        right={<Mark label="Fight hype" sub={hypeLabel(hype)}>{hype}</Mark>}
      >
        {s.oppLines.length > 0 && (
          <div className="press-opp">
            {s.oppLines.map((l, i) => (
              <blockquote key={i}><span>{opp.surname}</span>"{l}"</blockquote>
            ))}
          </div>
        )}
      </Band>
      <div className="wrap page-body">
        <div className="grid">
          <div className="c8 stack">
            {s.skipped && <div className="notice">Skipped. {s.summary}</div>}
            {s.questions.map((q, i) => (cur < 0 || i <= cur) && <QuestionCard key={i} w={w} s={s} i={i} live={i === cur && !s.done} onAnswer={() => setTick((t) => t + 1)} />)}
            {complete && !s.done && (
              <div className="row">
                <button className="btn primary lg" onClick={() => { finishSession(w, s); changed(); setTick((t) => t + 1); }}>Leave the stage</button>
              </div>
            )}
            {s.done && !s.skipped && (
              <section className="press-sum">
                <div className="label">How it went</div>
                <p>{s.summary}</p>
                <div className="row" style={{ marginTop: 12 }}>
                  <Link to="/inbox" className="btn primary">Back to the inbox</Link>
                  <Link to="/media" className="btn ghost">Media page</Link>
                </div>
              </section>
            )}
          </div>
          <div className="c4 stack">
            <Panel title="How it's going">
              <dl className="kv">
                <dt>Popularity</dt><dd className={popShown >= 0 ? "good" : "bad"}>{s.done ? "Done" : `${popShown >= 0 ? "+" : ""}${popShown.toFixed(1)}`}</dd>
                <dt>Heat with {opp.surname}</dt><dd>{!s.done && heatAfter !== heatNow ? `${heatNow} → ${heatAfter}` : heatNow}</dd>
                <dt>On fight night</dt><dd>{s.kind === "postfight" ? "–" : s.prep > 0.008 ? "Focused" : s.prep < -0.004 ? "Wound up" : "Settled"}</dd>
              </dl>
              {!s.done && trash > 0 && s.kind !== "postfight" && <p className="small warn" style={{ marginTop: 10 }}>{trash > 1 ? "It's getting heated: the face-off could boil over." : "The trash talk has the room's attention."}</p>}
              <p className="tiny dim" style={{ marginTop: 10 }}>Keys 1 to {s.questions[Math.max(0, cur)]?.answers.length ?? 4} answer the question in front of you.</p>
            </Panel>
            <Panel title="The tones">
              <ul className="tones">
                {(Object.keys(TONE_FX) as AnswerTone[]).map((t) => (
                  <li key={t}><span className={`q-tone t-${t}`}>{TONE_NAME[t]}</span><span className="small">{TONE_FX[t]}</span></li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

function QuestionCard({ w, s, i, live, onAnswer }: { w: World; s: MediaSession; i: number; live: boolean; onAnswer: () => void }) {
  const q = s.questions[i];
  const picked = q.picked !== undefined ? q.answers[q.picked] : null;
  return (
    <section className={`q-card${live ? " live" : ""}${picked ? " done" : ""}`}>
      <div className="q-who">
        <span className="q-n">Q{i + 1}</span>
        <b>{q.who}</b>
        <span className="dim">{q.outlet}</span>
      </div>
      <p className="q-text">{q.q}</p>
      {!picked && live && (
        <div className="q-answers">
          {q.answers.map((a, k) => (
            <button
              key={k}
              className={`q-ans t-${a.tone}`}
              onClick={() => {
                answerQuestion(w, s, i, k);
                changed();
                onAnswer();
              }}
            >
              <span className="q-key">{k + 1}</span>
              <span className="q-body">
                <span className={`q-tone t-${a.tone}`}>{TONE_NAME[a.tone]}</span>
                <span className="q-say">"{a.text}"</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {picked && (
        <div className="q-picked">
          <span className={`q-tone t-${picked.tone}`}>{TONE_NAME[picked.tone]}</span>
          <p className="q-say">"{picked.text}"</p>
          {q.reply && <p className="q-reply">{q.reply}</p>}
        </div>
      )}
    </section>
  );
}
