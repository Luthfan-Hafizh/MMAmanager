import { useEffect, useState } from "react";
import { fmtDate } from "../../core/time";
import type { Message } from "../../model/types";
import { answer } from "../../career/actions";
import { adviseContract, adviseInjury } from "../../career/advisor";
import { AdviceCard, FightOfferView } from "../advice";
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
};

const KIND: Record<Message["kind"], string> = {
  offer: "Fight offer", contract: "Contract", info: "Message", result: "Result", injury: "Medical", training: "Training", sponsor: "Sponsor",
  news: "News", camp: "Camp", money: "Money", client: "Client", weighin: "Weigh-in", ranking: "Rankings",
};

export function Inbox({ id }: { id?: string }) {
  const w = useWorld();
  const [filter, setFilter] = useState<"all" | "decide" | "unread">("all");
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
    const text = answer(w, cur.id, a);
    if (text) toast(text, a === "decline" || a === "reject" || a === "pull-out" ? "info" : "good");
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
        <div className="msg-body">
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
              {cur.actions && !cur.done && (
                <div className="row" style={{ marginTop: 18 }}>
                  {cur.actions.map((a) => (
                    <button key={a.id} className={`btn${a.primary ? " primary" : a.danger ? " danger" : ""}`} onClick={() => act(a.id)}>
                      {a.label}
                    </button>
                  ))}
                  {cur.kind === "offer" && cur.ref && (() => {
                    const o = w.career.fightOffers.find((x) => x.id === cur.ref);
                    return o ? <Link to={`/fighter/${o.opp}`} className="btn ghost">Scout the opponent</Link> : null;
                  })()}
                </div>
              )}
              {cur.done && <div className="badge" style={{ marginTop: 16 }}>{cur.done}</div>}
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
