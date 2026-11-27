import { useMemo, useState } from "react";
import { fmtDate, MONTHS } from "../../core/time";
import { money } from "../../core/util";
import type { LedgerEntry, World } from "../../model/types";
import { runwayMonths } from "../../career/money";
import { sponsorIncomeFor } from "../../career/sponsors";
import { fullName } from "../../world/core";
import { useWorld, changed, toast } from "../../state/store";
import { Empty, Panel, Seg, confirmBox } from "../components";
import { invest, withdrawInvestment, ownGymOf, OWN_GYMS, openGym, upgradeGym, cantOpen, gymPlace, playerGym, gymIncome, gymValue, sellGym } from "../../career/business";

const CAT_NAMES: Record<LedgerEntry["cat"], string> = {
  purse: "Purses", bonus: "Bonuses", sponsor: "Sponsors", commission: "Commission", camp: "Fight camps", gym: "Gym and coaches", living: "Living costs",
  tax: "Tax", manager: "Manager", fees: "Fees and medicals", fine: "Fines", other: "Other", salary: "Wages and office", travel: "Travel",
  invest: "Investments",
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
  const gymSide = (c.mode === "fighter" && w.fighters[c.fighters[0]]?.status === "active") || !!playerGym(w);
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
      <div className={gymSide ? "c6" : "c12"}><InvestPanel w={w} /></div>
      {gymSide && <div className="c6"><OwnGymPanel w={w} /></div>}
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

/** Money in the markets: about 6% a year over the long run, and down some months. */
function InvestPanel({ w }: { w: World }) {
  const inv = w.career.invest;
  const [amount, setAmount] = useState(25000);
  const bal = inv?.balance ?? 0;
  const gain = inv ? inv.balance - inv.paidIn : 0;
  const last = inv?.last ?? 0;
  const tone = (v: number) => (v < 0 ? "bad" : v > 0 ? "good" : "");
  return (
    <Panel title="Investments" hint="About 6% a year over the long run, and some months it falls">
      <div className="stat-tiles">
        <div className="tile"><div className="k">Invested</div><div className="v">{money(bal)}</div></div>
        <div className="tile"><div className="k">Gain so far</div><div className={`v ${tone(gain)}`}>{money(gain, { sign: true })}</div></div>
        <div className="tile"><div className="k">Last month</div><div className={`v ${tone(last)}`}>{money(last, { sign: true })}</div></div>
      </div>
      <div className="invest-row">
        <input className="input" type="number" min={0} step={5000} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} aria-label="Amount to put in or take out" />
        <button className="btn" onClick={() => { toast(invest(w, amount), "good"); changed(); }} disabled={amount <= 0 || w.career.money < amount}>Put in</button>
        <button className="btn ghost" onClick={() => { toast(withdrawInvestment(w, amount)); changed(); }} disabled={amount <= 0 || bal <= 0}>Take out</button>
        {bal > 0 && <button className="btn ghost" onClick={() => { toast(withdrawInvestment(w, bal)); changed(); }}>Take it all out</button>}
      </div>
      <p className="tiny dim" style={{ marginTop: 8 }}>An overdraft is covered from here on the first of the month.</p>
    </Panel>
  );
}

/** A gym of your own: no gym cut, no membership, and a room that grows with the career. */
function OwnGymPanel({ w }: { w: World }) {
  const f = w.career.mode === "fighter" ? w.fighters[w.career.fighters[0]] : undefined;
  const [name, setName] = useState(() => (f ? `${f.surname} Fight Team` : ""));
  const g = playerGym(w);
  if (g) {
    const t = OWN_GYMS[g.ownTier ?? 0];
    const up = OWN_GYMS[(g.ownTier ?? 0) + 1];
    const upCost = up ? up.cost - t.cost : 0;
    const income = gymIncome(w, g);
    const net = income - t.run;
    const agency = g.owner === "agency";
    const here = agency ? w.career.fighters.filter((id) => w.fighters[id]?.gym === g.id).length : 0;
    const value = gymValue(w, g);
    const sell = () =>
      void confirmBox({
        title: `Sell ${g.name}?`,
        body: `${money(value)} for it now. It carries on as a gym like any other under its new owners; ${agency ? "clients" : "you"} can still train there, paying the usual cut from the purses.`,
        ok: `Sell for ${money(value)}`,
        danger: true,
      }).then((yes) => {
        if (yes) {
          toast(sellGym(w), "good");
          changed();
        }
      });
    return (
      <Panel title={agency ? "The agency's gym" : "Your gym"} hint={net >= 0 ? `${money(net)} a month ahead` : `${money(-net)} a month to run`}>
        <div className="dx own-gym-name">{g.name}</div>
        <div className="small dim">{t.name} in {g.city} · head coach {g.headCoach}</div>
        <div className="stat-tiles" style={{ marginTop: 12 }}>
          <div className="tile"><div className="k">Coaches</div><div className="v">{t.q}</div></div>
          <div className="tile"><div className="k">Facilities</div><div className="v">{g.facilities}</div></div>
          <div className="tile"><div className="k">Members pay</div><div className="v">{money(income)}</div><div className="s">a month, against {money(t.run)} to run</div></div>
        </div>
        <p className="small dim" style={{ marginTop: 10 }}>
          {agency
            ? `No gym cut for clients who train here (${here} do). Members come for the name on the door and the fighters in the room.`
            : f && f.gym !== g.id
              ? `${f.surname} trains somewhere else for now; Moves takes them back.`
              : "No cut from the purses. Members come for the name on the door: the more famous, the more they pay."}
        </p>
        <div className="invest-row">
          {up ? (
            <button className="btn" disabled={w.career.money < upCost} onClick={() => void confirmBox({ title: `Make it ${up.name.toLowerCase()}?`, body: `Coaches at ${up.q}, facilities ${up.fac}, and ${money(up.run)} a month to run. It costs ${money(upCost)}.`, ok: `Upgrade for ${money(upCost)}` }).then((yes) => { if (yes) { toast(upgradeGym(w), "good"); changed(); } })}>
              Upgrade to {up.name.toLowerCase()} ({money(upCost)})
            </button>
          ) : (
            <span className="tiny dim">As good as a gym gets.</span>
          )}
          <button className="btn ghost" onClick={sell}>Sell ({money(value)})</button>
        </div>
      </Panel>
    );
  }
  if (!f) return null;
  const general = cantOpen(w, f, 0, name);
  return (
    <Panel title="A gym of your own" hint="No gym cut and no membership">
      <label className="field">Name<input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
      <table className="tbl compact" style={{ marginTop: 10 }}>
        <tbody>
          {OWN_GYMS.map((t) => {
            const no = cantOpen(w, f, t.tier, name);
            return (
              <tr key={t.tier}>
                <td><b>{t.name}</b><div className="tiny dim">Coaches {t.q}, facilities {t.fac} · {money(t.run - t.income)} a month to run</div></td>
                <td className="r">
                  <button className="btn sm" disabled={!!no} title={no ?? undefined} onClick={() => void confirmBox({ title: `Open ${name.trim()}?`, body: `${t.name} in ${gymPlace(w, f).city}: coaches at ${t.q}, facilities ${t.fac}. It costs ${money(t.cost)} to open and ${money(t.run - t.income)} a month to run, and ${f.surname} trains there from now on with no gym cut from the purses.`, ok: `Open for ${money(t.cost)}` }).then((yes) => { if (yes) { toast(openGym(w, f, t.tier, name), "good"); changed(); } })}>
                    {money(t.cost)}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {general && !general.startsWith("That takes") && <p className="tiny dim" style={{ marginTop: 8 }}>{general}</p>}
    </Panel>
  );
}
