import { durationText, fmtDate } from "../../core/time";
import { DIVISIONS, type DivisionId } from "../../data/divisions";
import { PROMOTIONS, PROMO_IDS, rankSizeOf, type PromoId } from "../../data/promotions";
import type { Bout, World } from "../../model/types";
import { rankMove } from "../../world/rankings";
import { fightsInPromo, rankNumber, recordText, fullName } from "../../world/core";
import { beltNote, isTitleKind, stakeLabel } from "../../world/belts";
import { methodText } from "../../engine/sim";
import { useWorld } from "../../state/store";
import { go, Link } from "../router";
import { Empty, Flag, Panel, ScrollRow } from "../components";
import { Band } from "../art";

export function Rankings({ promo, div }: { promo?: string; div?: string }) {
  const w = useWorld();
  const ranked = PROMO_IDS.filter((p) => PROMOTIONS[p].rankSize > 0);
  const pid = (promo && ranked.includes(promo as PromoId) ? promo : "ufc") as PromoId;
  const p = PROMOTIONS[pid];
  const only = div && p.divisions.includes(div as DivisionId) ? (div as DivisionId) : null;
  const divs = only ? [only] : p.divisions;
  return (
    <>
      <Band
        eyebrow={pid === "ufc" ? "Rating model rankings" : `${p.short} rankings`}
        title={`${p.short} Rankings`}
        sub="Who you beat counts most, a finish adds a little, activity helps, and after eighteen months out the score decays. A winner always moves above the fighter beaten."
        tabs={
          <ScrollRow className="tabs" active={pid} label="Promotions" style={{ marginBottom: -34 }}>
            {ranked.map((x) => (
              <button key={x} className={x === pid ? "on" : ""} onClick={() => go(`/rankings/${x}`)}>{PROMOTIONS[x].short}</button>
            ))}
          </ScrollRow>
        }
      />
      <div className="wrap page-body">
        <ScrollRow className="rk-divs" active={only ?? "all"} label="Divisions">
          <button type="button" className={`btn sm${!only ? " on" : ""}`} onClick={() => go(`/rankings/${pid}`)}>All divisions</button>
          {p.divisions.map((d) => (
            <button key={d} type="button" className={`btn sm${only === d ? " on" : ""}`} title={DIVISIONS[d].name} onClick={() => go(`/rankings/${pid}/${d}`)}>{DIVISIONS[d].short}</button>
          ))}
        </ScrollRow>
        {(pid === "ufc" || pid === "pfl") && !only && <P4P w={w} promo={pid} />}
        {only ? (
          // One division: its own page, the list wide with the champion on top and the title picture beside it.
          <div className="rk-solo">
            <DivisionColumn w={w} promo={pid} d={only} wide />
            <TitlePicture w={w} promo={pid} d={only} />
          </div>
        ) : (
          <div className="rk-grid">
            {divs.map((d) => <DivisionColumn key={d} w={w} promo={pid} d={d} />)}
          </div>
        )}
      </div>
    </>
  );
}

/** The next fight for this division's belt, if one is booked. */
function nextBeltFight(w: World, promo: PromoId, d: DivisionId): Bout | null {
  for (const id of w.upcoming) {
    const ev = w.events[id];
    if (!ev || ev.promo !== promo || ev.status === "done") continue;
    for (const bid of ev.bouts) {
      const b = w.bouts[bid];
      if (b && b.div === d && b.status === "booked" && !b.pending && (b.kind === "title" || b.kind === "vacant" || b.kind === "interim")) return b;
    }
  }
  return null;
}

function DivisionColumn({ w, promo, d, wide }: { w: World; promo: PromoId; d: DivisionId; wide?: boolean }) {
  const ps = w.promos[promo];
  const champId = ps.champs[d];
  const champ = champId ? w.fighters[champId] : null;
  const ids = ps.ranks[d] ?? [];
  const reign = champId ? [...ps.reigns].reverse().find((r) => r.fighter === champId && r.div === d && r.lost === undefined) : undefined;
  const size = rankSizeOf(promo, d);
  const next = nextBeltFight(w, promo, d);
  return (
    <article className={`rk-col${wide ? " wide" : ""}`}>
      <div className="rk-champ">
        <div>
          <div className="div">
            {DIVISIONS[d].name}
            {size < PROMOTIONS[promo].rankSize && <span className="rk-top" title={`A smaller division: ranked to ${size}`}>Top {size}</span>}
          </div>
          {champ ? (
            <>
              <Link to={`/fighter/${champ.id}`} className="cn" style={{ display: "block" }}>{fullName(champ)}</Link>
              <div className="cr">
                {wide ? <><Flag code={champ.country} /> </> : null}Champion · {recordText(champ)}
                {reign ? ` · since ${fmtDate(reign.won)}${reign.defenses ? ` · ${reign.defenses} ${wide ? `defence${reign.defenses === 1 ? "" : "s"}` : "def."}` : ""}` : ""}
              </div>
            </>
          ) : (
            <>
              <div className="cn">Vacant</div>
              <div className="cr">{next ? "Booked for the belt:" : "The top two available will fight for it"}</div>
            </>
          )}
          {next && w.fighters[next.a] && w.fighters[next.b] && (
            <Link to={`/event/${next.ev}`} className="rk-next" title={w.events[next.ev]?.name}>
              <b>{next.kind === "title" ? "Next" : stakeLabel(next)}</b> {w.fighters[next.a].surname} vs {w.fighters[next.b].surname} · {fmtDate(next.day)}
            </Link>
          )}
        </div>
        {champ && <span className="belt" aria-hidden="true">C</span>}
      </div>
      {ps.interim[d] && w.fighters[ps.interim[d]!] && (
        <div className="rk-interim">
          <span className="label">Interim</span>
          <Link to={`/fighter/${ps.interim[d]}`}><b>{fullName(w.fighters[ps.interim[d]!])}</b></Link>
          {champ && champ.injury && champ.injury.until > w.day ? <span className="tiny dim">champion out to {fmtDate(champ.injury.until)}</span> : null}
        </div>
      )}
      {promo === "ufc" && d === "LW" && ps.bmf && (
        <Link to="/titles/ufc/bmf" className="bmf-card">
          <div>
            <div className="label">BMF title</div>
            <div className="bmf-name">{ps.bmf.holder && w.fighters[ps.bmf.holder] ? fullName(w.fighters[ps.bmf.holder]) : "Vacant"}</div>
          </div>
          <span className="bmf-mark" aria-hidden="true">BMF</span>
        </Link>
      )}
      <div className="rk-list">
        {ids.length === 0 && <Empty title="No rankings yet" />}
        {ids.map((id, i) => {
          const f = w.fighters[id];
          const mv = rankMove(w, promo, d, id);
          // Ranked here from another weight, after a win at this one.
          const from = f.div !== d ? f.div : null;
          // Signed and yet to fight here: in an open place on record and rating until the debut.
          const debut = !from && f.joined > w.start && fightsInPromo(w, f, promo) === 0;
          return (
            <Link key={id} to={`/fighter/${id}`} className={f.ctrl ? "me" : ""}>
              <span className="n">{ps.interim[d] === id ? "IC" : rankNumber(ids, ps.interim[d] ?? null, i)}</span>
              <span className="rk-name" style={{ fontWeight: f.ctrl ? 800 : 500 }}>
                <span className="ellip">{fullName(f)}</span>
                {from && <span className="rk-x" title={`Fights at ${DIVISIONS[from].name.toLowerCase()}; ranked here too after a win at ${DIVISIONS[d].name.toLowerCase()}`}>{DIVISIONS[from].short}</span>}
                {debut && <span className="rk-x" title={`Signed, yet to fight in the ${PROMOTIONS[promo].short}: ranked on record and rating in an open place, below everyone who has fought here`}>Debut</span>}
              </span>
              <span className={`mv ${typeof mv === "number" ? (mv > 0 ? "good" : "bad") : "dim"}`}>{mv === "new" ? "NEW" : typeof mv === "number" && mv !== 0 ? (mv > 0 ? `▲${mv}` : `▼${-mv}`) : ""}</span>
            </Link>
          );
        })}
      </div>
      <Link to={`/titles/${promo}/${d}`} className="rk-hist">Title history</Link>
    </article>
  );
}

/** The belt fights a division has had lately: found through the people who held its belts, not a sweep of every bout. */
function recentTitleFights(w: World, promo: PromoId, d: DivisionId, n: number): Bout[] {
  const ps = w.promos[promo];
  const who = new Set<string>();
  for (let k = ps.reigns.length - 1, seen = 0; k >= 0 && seen < 8; k--) {
    const r = ps.reigns[k];
    if (r.div !== d) continue;
    who.add(r.fighter);
    seen++;
  }
  for (const id of [ps.champs[d], ps.interim[d]]) if (id) who.add(id);
  const out = new Map<string, Bout>();
  for (const id of who) {
    const f = w.fighters[id];
    if (!f) continue;
    for (const bid of f.bouts) {
      const b = w.bouts[bid];
      if (b && b.promo === promo && b.div === d && b.status === "done" && b.res && isTitleKind(b.kind)) out.set(b.id, b);
    }
  }
  return [...out.values()].sort((a, b) => b.day - a.day).slice(0, n);
}

/** Beside one division's list: the next title fight, who is next in line, the last belt fights, the division's best pound for pound. */
function TitlePicture({ w, promo, d }: { w: World; promo: PromoId; d: DivisionId }) {
  const ps = w.promos[promo];
  const champ = ps.champs[d] ? w.fighters[ps.champs[d]!] : null;
  const next = nextBeltFight(w, promo, d);
  const named = ps.contender[d] && w.fighters[ps.contender[d]!] ? w.fighters[ps.contender[d]!] : null;
  const recent = recentTitleFights(w, promo, d, 5);
  const list = promo === "ufc" ? w.p4p : ps.p4p ?? [];
  const p4p = list.map((id, i) => ({ f: w.fighters[id], i })).filter((x) => x.f && x.f.div === d);
  const rankText = (id: string) => {
    if (ps.champs[d] === id) return "C";
    if (ps.interim[d] === id) return "IC";
    const ids = ps.ranks[d] ?? [];
    const i = ids.indexOf(id);
    return i >= 0 ? `#${rankNumber(ids, ps.interim[d] ?? null, i)}` : "";
  };
  const name = (id: string) => (w.fighters[id] ? fullName(w.fighters[id]) : "");
  const how = (b: Bout) => (b.res ? `${methodText(b.res.method, b.res.detail)}${b.res.method === "DEC" || b.res.method === "DRAW" ? "" : `, R${b.res.round}`}` : "");
  return (
    <div className="stack">
      <Panel title="The title picture">
        <dl className="kv">
          <dt>Next title fight</dt>
          <dd>
            {next && w.fighters[next.a] && w.fighters[next.b] ? (
              <Link to={`/event/${next.ev}`}>
                {w.fighters[next.a].surname} vs {w.fighters[next.b].surname}, {fmtDate(next.day)}
              </Link>
            ) : (
              <span className="dim">Not booked yet</span>
            )}
          </dd>
          {next && (
            <>
              <dt>For</dt>
              <dd>{stakeLabel(next, true)}{w.events[next.ev] ? ` · ${w.events[next.ev].name}` : ""}</dd>
            </>
          )}
          <dt>Next in line</dt>
          <dd>{named ? <Link to={`/fighter/${named.id}`}>{fullName(named)}{rankText(named.id) ? ` (${rankText(named.id)})` : ""}</Link> : next ? <span className="dim">Booked</span> : <span className="dim">Named after the next card</span>}</dd>
          {champ && (
            <>
              <dt>Champion's last fight</dt>
              <dd>{champ.lastFight !== null ? `${fmtDate(champ.lastFight)}${w.day - champ.lastFight > 0 ? ` (${durationText(w.day - champ.lastFight)} ago)` : ""}` : "None yet"}</dd>
            </>
          )}
        </dl>
      </Panel>
      <Panel title="Recent title fights" acts={<Link to={`/titles/${promo}/${d}`} className="textlink">Title history</Link>} flush>
        {recent.length === 0 && <Empty title="No title fights in this world yet" />}
        {recent.map((b) => {
          const r = b.res!;
          const win = r.winner ? (r.winner === "a" ? b.a : b.b) : null;
          const lose = r.winner ? (r.winner === "a" ? b.b : b.a) : null;
          return (
            <Link key={b.id} to={`/event/${b.ev}`} className="list-row rk-tf">
              <span className="tiny dim">{fmtDate(b.day, { year: true })}</span>
              <span style={{ minWidth: 0 }}>
                <span className="ellip" style={{ display: "block" }}>
                  {win && lose ? <><b>{name(win)}</b> def. {name(lose)}</> : <>{name(b.a)} and {name(b.b)}: {r.method === "NC" ? "no contest" : "draw"}</>}
                </span>
                <span className="tiny dim" style={{ display: "block" }}>
                  {how(b)} · {(win && beltNote(b, win)) || stakeLabel(b) || "Title fight"}{w.events[b.ev] ? ` · ${w.events[b.ev].name}` : ""}
                </span>
              </span>
            </Link>
          );
        })}
      </Panel>
      {p4p.length > 0 && (
        <Panel title="Pound for pound" hint={`From the ${DIVISIONS[d].name.toLowerCase()} division`} flush>
          {p4p.map(({ f, i }) => (
            <Link key={f.id} to={`/fighter/${f.id}`} className="list-row rk-tf">
              <span className="num">#{i + 1}</span>
              <span className="ellip">{fullName(f)}{rankText(f.id) ? <span className="tiny dim"> · {rankText(f.id) === "C" ? "champion" : rankText(f.id)}</span> : null}</span>
            </Link>
          ))}
        </Panel>
      )}
    </div>
  );
}

function P4P({ w, promo }: { w: World; promo: PromoId }) {
  const list = promo === "ufc" ? w.p4p : w.promos[promo]?.p4p ?? [];
  const top = list.slice(0, 15).map((id) => w.fighters[id]).filter(Boolean);
  const first = top[0];
  if (!first) return null;
  return (
    <section className="sec">
      <div className="sec-h"><h2>Pound for pound</h2><span className="hint">The best {top.length} fighters in the {PROMOTIONS[promo].short} regardless of weight</span></div>
      <div className="rk-col p4p-col">
        {first && (
          <div className="rk-champ" style={{ minHeight: 220 }}>
            <div>
              <div className="div">Pound-for-pound #1</div>
              <Link to={`/fighter/${first.id}`} className="cn p4p-name" style={{ display: "block" }}>{fullName(first)}</Link>
              <div className="cr">{DIVISIONS[first.div].name} · {recordText(first)}</div>
            </div>
            <span className="belt" aria-hidden="true" style={{ fontSize: 150 }}>1</span>
          </div>
        )}
        <div className="rk-list p4p-list">
          {top.map((f, i) => (
            <Link key={f.id} to={`/fighter/${f.id}`} className={f.ctrl ? "me" : ""}>
              <span className="n">{i + 1}</span>
              <span className="ellip" style={{ fontWeight: 600 }}>{fullName(f)}</span>
              <span className="tiny dim">{DIVISIONS[f.div].short}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
