import { useState } from "react";
import { fmtDate } from "../../core/time";
import { PROMOTIONS } from "../../data/promotions";
import type { NewsKind } from "../../model/types";
import { useWorld } from "../../state/store";
import { Link } from "../router";
import { Empty, Panel, Seg } from "../components";

const KINDS: { v: NewsKind | "all"; label: string }[] = [
  { v: "all", label: "All" },
  { v: "title", label: "Titles" },
  { v: "result", label: "Results" },
  { v: "upset", label: "Upsets" },
  { v: "signing", label: "Signings" },
  { v: "release", label: "Releases" },
  { v: "booking", label: "Bookings" },
  { v: "retire", label: "Retirements" },
];

export function News() {
  const w = useWorld();
  const [kind, setKind] = useState<NewsKind | "all">("all");
  const [promo, setPromo] = useState<"all" | "top">("top");
  const items = w.news.filter((n) => (kind === "all" || n.kind === kind) && (promo === "all" || !n.promo || n.promo === "ufc" || n.promo === "pfl" || n.big || n.fighters?.some((id) => w.fighters[id]?.ctrl)));
  return (
    <div className="stack">
      <div className="row">
        <Seg value={kind} onChange={setKind} options={KINDS} />
        <Seg value={promo} onChange={setPromo} options={[{ v: "top", label: "Headlines" }, { v: "all", label: "Every promotion" }]} />
      </div>
      <Panel title="News" hint={`${items.length} stories`} flush>
        {items.length === 0 && <Empty title="No news" />}
        {items.slice(0, 250).map((n) => (
          <div key={n.id} className="list-row">
            <span className="tiny dim nowrap" style={{ width: 88 }}>{fmtDate(n.day)}</span>
            {n.promo && <span className="badge" style={{ minWidth: 54, justifyContent: "center" }}>{PROMOTIONS[n.promo].short}</span>}
            <span style={{ fontWeight: n.big ? 600 : 400, flex: 1 }} className={n.big ? "" : "muted"}>
              {n.text}
            </span>
            {n.ev && <Link to={`/event/${n.ev}`} className="btn sm ghost">Card</Link>}
          </div>
        ))}
      </Panel>
    </div>
  );
}
