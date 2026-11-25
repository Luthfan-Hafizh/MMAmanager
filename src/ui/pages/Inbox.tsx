import { useEffect, useRef, useState } from "react";
import { fmtDate } from "../../core/time";
import type { Message } from "../../model/types";
import { answer } from "../../career/actions";
import { openSession, sessionById } from "../../career/media";
import { adviseContract, adviseInjury } from "../../career/advisor";
import { AdviceCard, FightOfferView } from "../advice";
import { DeclinePicker } from "../decline";
import { changed, toast, useWorld } from "../../state/store";
import { go, Link } from "../router";
import { Empty, Facts, Seg } from "../components";
import { Icons } from "../icons";

const ICON: Record<Message["kind"], () => JSX.Element> = {
  offer: Icons.glove,
  contract: Icons.contract,
  info: Icons.inbox,
  result: Icons.trophy,
  injury: Icons.medkit,
  training: Icons.training,
  sponsor: Icons.money,
  news: Icons.news,
  camp: Icons.glove,
  money: Icons.money,
  client: Icons.users,
  weighin: Icons.scale,
  ranking: Icons.trophy,
  life: Icons.bolt,
  media: Icons.mic,
};

const KIND: Record<Message["kind"], string> = {
  offer: "Fight offer", contract: "Contract", info: "Message", result: "Result", injury: "Medical", training: "Training", sponsor: "Sponsor",
  news: "News", camp: "Camp", money: "Money", client: "Client", weighin: "Weigh-in", ranking: "Rankings", life: "Life", media: "Media",
};

export function Inbox({ id }: { id?: string }) {
  const w = useWorld();
  const [filter, setFilter] = useState<"all" | "decide" | "unread">("all");
  // The reasons for turning a fight down, open for this message.
  const [picking, setPicking] = useState<string | null>(null);
  // On a phone the list and the message stack: opening one scrolls to it.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (id && bodyRef.current && window.matchMedia("(max-width: 860px)").matches) bodyRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [id]);
  const list = w.inbox.filter((m) => (filter === "decide" ? m.needs && !m.done : filter === "unread" ? !m.read : true));
  const cur = w.inbox.find((m) => m.id === id) ?? list[0];
  useEffect(() => {
    if (cur && !cur.read) {
      cur.read = true;
      changed();
    }
  }, [cur?.id]);
  const act = (a: string) => {
    if (!cur) return;
    if (cur.kind === "contract" && a === "negotiate") {
      go(`/contracts/${cur.fighter ?? ""}`);
      return;
    }
    if (a === "press:go") {
      // The questions are answered in the press room, one at a time.
      const s = openSession(w, cur);
      changed();
      if (s) go(`/media/session/${s.id}`);
      return;
    }
    const text = answer(w, cur.id, a);
    if (text) toast(text, a.startsWith("decline") || a === "reject" || a === "pull-out" ? "info" : "good");
    changed();
  };
  const markAll = () => {
    for (const m of w.inbox) m.read = true;
    changed();
  };
  return (
    <div className="panel">
      <div className="panel-h">
        <Seg value={filter} onChange={setFilter} options={[{ v: "all", label: "All" }, { v: "decide", label: "Decisions" }, { v: "unread", label: "Unread" }]} />
        <div className="acts">
          <button className="btn sm ghost" onClick={markAll}>Mark all read</button>
        </div>
      </div>
      <div className="inbox">
        <div className="inbox-list">
          {list.length === 0 && <Empty title="Nothing here" />}
          {list.map((m) => {
            const Ic = ICON[m.kind] ?? Icons.inbox;
            return (
              <div key={m.id} className={`msg${cur?.id === m.id ? " on" : ""}${m.read ? "" : " unread"}${m.needs && !m.done ? " need" : ""}`} onClick={() => go(`/inbox/${m.id}`)}>
                <div className="k"><Ic /> {m.needs && !m.done ? "Decision" : KIND[m.kind]}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="s">{m.subject}</div>
                  <div className="f ellip">{m.from}</div>
                </div>
                <div className="d">{fmtDate(m.day, { year: false })}</div>
              </div>
            );
          })}
        </div>
        <div className="msg-body" ref={bodyRef}>
          {cur ? (
            <>
              <h3>{cur.subject}</h3>
              <div className="from">
                {cur.from} · {fmtDate(cur.day, { dow: true })}
                {cur.fighter && w.fighters[cur.fighter] && (
                  <>
                    {" · "}
                    <Link to={`/fighter/${cur.fighter}`}>{w.fighters[cur.fighter].first} {w.fighters[cur.fighter].surname}</Link>
                  </>
                )}
              </div>
              {cur.facts && cur.facts.length > 0 && <Facts facts={cur.facts} />}
              <div className="text">{cur.body}</div>
              {cur.data?.session && (() => {
                const s = sessionById(w, String(cur.data!.session));
                return s ? (
                  <div className="notice" style={{ marginTop: 14 }}>
                    {s.done ? (s.skipped ? "Skipped." : s.summary) : `${s.questions.filter((q) => q.picked !== undefined).length} of ${s.questions.length} questions answered.`}{" "}
                    <Link to={`/media/session/${s.id}`} className="textlink">{s.done ? "See it" : "Back to the press room"}</Link>
                  </div>
                ) : null;
              })()}
              {cur.kind === "offer" && cur.ref && !cur.done && (() => {
                const o = w.career.fightOffers.find((x) => x.id === cur.ref);
                const f = o ? w.fighters[o.fighter] : null;
                return o && f && o.status === "open" ? <div style={{ marginTop: 18 }}><FightOfferView w={w} o={o} f={f} /></div> : null;
              })()}
              {cur.kind === "injury" && cur.fighter && cur.needs && !cur.done && cur.actions && (() => {
                const f = w.fighters[cur.fighter!];
                const a = f ? adviseInjury(w, f, cur.actions!.map((x) => x.id), cur.ref) : null;
                return a ? <div style={{ marginTop: 18 }}><AdviceCard a={a} /></div> : null;
              })()}
              {cur.kind === "contract" && cur.ref && !cur.done && (() => {
                const o = w.career.contractOffers.find((x) => x.id === cur.ref);
                const f = o ? w.fighters[o.fighter] : null;
                return o && f && o.status === "open" ? <div style={{ marginTop: 18 }}><AdviceCard a={adviseContract(w, f, o)} /></div> : null;
              })()}
              {cur.actions && !cur.done && picking === cur.id && cur.kind === "offer" && (() => {
                const o = w.career.fightOffers.find((x) => x.id === cur.ref && x.status === "open");
                return o ? (
                  <div style={{ marginTop: 18 }}>
                    <DeclinePicker w={w} o={o} onCancel={() => setPicking(null)} onPick={(r) => { setPicking(null); act(`decline:${r}`); }} />
                  </div>
                ) : null;
              })()}
              {cur.actions && !cur.done && picking !== cur.id && (
                <div className="row" style={{ marginTop: 18 }}>
                  {cur.actions.map((a) => (
                    <button key={a.id} className={`btn${a.primary ? " primary" : a.danger ? " danger" : ""}`} onClick={() => (cur.kind === "offer" && a.id === "decline" ? setPicking(cur.id) : act(a.id))}>
                      {a.label}{cur.kind === "offer" && a.id === "decline" ? "…" : ""}
                    </button>
                  ))}
                  {cur.kind === "offer" && cur.ref && (() => {
                    const o = w.career.fightOffers.find((x) => x.id === cur.ref);
                    return o ? <Link to={`/fighter/${o.opp}`} className="btn ghost">Scout the opponent</Link> : null;
                  })()}
                </div>
              )}
              {cur.done && (cur.done.length > 28 ? <p className="msg-done">{cur.done}</p> : <div className="badge" style={{ marginTop: 16 }}>{cur.done}</div>)}
              {cur.kind === "result" && cur.ref && w.bouts[cur.ref] && (
                <div style={{ marginTop: 16 }}>
                  <Link to={`/event/${w.bouts[cur.ref].ev}`} className="btn">See the card</Link>
                </div>
              )}
            </>
          ) : (
            <Empty title="No messages" />
          )}
        </div>
      </div>
    </div>
  );
}
