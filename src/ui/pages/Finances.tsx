import { useMemo, useState } from "react";
import { fmtDate, MONTHS } from "../../core/time";
import { money } from "../../core/util";
import type { LedgerEntry } from "../../model/types";
import { runwayMonths } from "../../career/money";
import { sponsorIncomeFor } from "../../career/sponsors";
import { fullName } from "../../world/core";
import { useWorld } from "../../state/store";
import { Empty, Panel, Seg } from "../components";

const CAT_NAMES: Record<LedgerEntry["cat"], string> = {
  purse: "Purses", bonus: "Bonuses", sponsor: "Sponsors", commission: "Commission", camp: "Fight camps", gym: "Gym and coaches", living: "Living costs",
  tax: "Tax", manager: "Manager", fees: "Fees and medicals", fine: "Fines", other: "Other", salary: "Wages and office", travel: "Travel",
};

export function Finances() {
  const w = useWorld();
  const c = w.career;
  const [range, setRange] = useState<"year" | "all">("year");
  const since = range === "year" ? w.day - 365 : -1e9;
  const entries = c.ledger.filter((e) => e.day >= since && e.amount !== 0);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.cat, (m.get(e.cat) ?? 0) + e.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);
  const inc = entries.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
  const out = entries.filter((e) => e.amount < 0).reduce((a, e) => a - e.amount, 0);
  const months = c.monthly.slice(-18);
  const maxBal = Math.max(1, ...months.map((m) => Math.abs(m.bal)), Math.abs(c.money));
  const runway = runwayMonths(w);
  return (
    <div className="grid">
      <div className="c12">
        <div className="stat-tiles">
          <div className="tile"><div className="k">Bank balance</div><div className={`v ${c.money < 0 ? "bad" : ""}`}>{money(c.money)}</div><div className="s">{runway > 60 ? "Years of living costs" : `${Math.max(0, Math.floor(runway))} months of living costs`}</div></div>
          <div className="tile"><div className="k">In, {range === "year" ? "12 months" : "all time"}</div><div className="v good">{money(inc)}</div></div>
          <div className="tile"><div className="k">Out</div><div className="v bad">{money(out)}</div></div>
          <div className="tile"><div className="k">Living costs</div><div className="v">{money(c.living)}</div><div className="s">a month</div></div>
          <div className="tile"><div className="k">Sponsorship</div><div className="v">{money(c.fighters.reduce((a, id) => a + sponsorIncomeFor(w, id), 0))}</div><div className="s">a month</div></div>
        </div>
      </div>
      <div className="c7">
        <Panel title="Balance" hint="end of each month">
          {months.length < 2 ? (
            <Empty title="Not enough history yet">The chart fills in month by month.</Empty>
          ) : (
            <BalanceChart months={months} max={maxBal} />
          )}
        </Panel>
      </div>
      <div className="c5">
        <Panel title="Where it goes" acts={<Seg value={range} onChange={setRange} options={[{ v: "year", label: "12 months" }, { v: "all", label: "All" }]} />} flush>
          {byCat.length === 0 ? (
            <Empty title="Nothing yet" />
          ) : (
            <table className="tbl compact">
              <tbody>
                {byCat.map(([k, v]) => (
                  <tr key={k}><td>{CAT_NAMES[k as LedgerEntry["cat"]]}</td><td className={`r ${v < 0 ? "bad" : "good"}`}>{money(v, { sign: true })}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
      <div className="c12">
        <Panel title="Transactions" flush>
          {entries.length === 0 ? (
            <Empty title="No transactions yet" />
          ) : (
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              <table className="tbl compact">
                <thead><tr><th>Date</th><th>What</th><th>Fighter</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  {entries.slice(0, 300).map((e, i) => (
                    <tr key={i}>
                      <td className="nowrap">{fmtDate(e.day)}</td>
                      <td>{e.what}</td>
                      <td className="small dim">{e.fighter && w.fighters[e.fighter] && c.mode === "manager" ? fullName(w.fighters[e.fighter]) : ""}</td>
                      <td className={`r ${e.amount < 0 ? "bad" : "good"}`}>{money(e.amount, { sign: true, exact: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function BalanceChart({ months, max }: { months: { m: string; inc: number; out: number; bal: number }[]; max: number }) {
  const W = 640;
  const H = 220;
  const pad = 30;
  const step = (W - pad * 2) / Math.max(1, months.length - 1);
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - 20);
  const pts = months.map((m, i) => [pad + i * step, y(m.bal)] as const);
  const d = pts.map(([x, yy], i) => `${i ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bank balance by month">
      <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} stroke="var(--line-2)" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map(([x, yy], i) => (
        <g key={i}>
          <circle cx={x} cy={yy} r="3.5" fill={months[i].bal < 0 ? "var(--loss)" : "var(--blue)"}>
            <title>{`${months[i].m}: ${money(months[i].bal)} (in ${money(months[i].inc)}, out ${money(months[i].out)})`}</title>
          </circle>
          {i % Math.ceil(months.length / 8) === 0 && (
            <text x={x} y={H - 6} fontSize="11" textAnchor="middle" fill="var(--ink-3)">{MONTHS[Number(months[i].m.slice(5)) - 1]} {months[i].m.slice(2, 4)}</text>
          )}
        </g>
      ))}
      <text x={pad} y={14} fontSize="11" fill="var(--ink-3)">{money(max)}</text>
    </svg>
  );
}
