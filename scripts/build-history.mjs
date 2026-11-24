// Real fight histories for the real fighters, read from the "Mixed martial arts
// record" tables on English Wikipedia (CC BY-SA 4.0). Only fights before the
// snapshot date are kept: everything after it is the game's own world.
//   node scripts/build-history.mjs            -> public/data/history.json
//   node scripts/build-history.mjs --only=ufc-valentina-shevchenko,pfl-linton-vassell
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const SNAP = "2026-10-01";
const UA = "game-data-builder/1.0 (hobby use)";
const API = "https://en.wikipedia.org/w/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
// Every answer is cached on disk, so a run that gets rate-limited picks up where it stopped.
const CACHE = "node_modules/.cache/wiki";
mkdirSync(CACHE, { recursive: true });
const keyOf = (s) => `${CACHE}/${createHash("sha1").update(s).digest("hex")}.json`;

const src = JSON.parse(readFileSync("data-src/roster-2026-10.json", "utf8"));
let people = [...src.fighters, ...src.pfl.fighters].map((f) => ({ id: f.id, name: f.name, rec: f.record, nick: f.nickname }));
if (only.length) people = people.filter((p) => only.includes(p.id));

let lastCall = 0;
async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params })}`;
  const file = keyOf(url);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  for (let attempt = 0; attempt < 10; attempt++) {
    // Polite spacing: at most one request every 1.2 seconds.
    const wait = lastCall + 1200 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.status === 429 || r.status >= 500) {
        const after = Number(r.headers.get("retry-after")) || 30 * (attempt + 1);
        process.stdout.write(`\n  HTTP ${r.status}: waiting ${after}s\n`);
        await sleep(after * 1000);
        continue;
      }
      const j = await r.json();
      if (j.error?.code === "maxlag") {
        await sleep(5000);
        continue;
      }
      writeFileSync(file, JSON.stringify(j));
      return j;
    } catch (e) {
      if (attempt === 9) throw e;
      await sleep(5000 * (attempt + 1));
    }
  }
  throw new Error("Wikipedia did not answer");
}

/** Page text for several titles at once, following redirects. */
async function contents(titles) {
  const out = new Map();
  if (!titles.length) return out;
  const j = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: titles.join("|") });
  const norm = new Map((j.query?.normalized ?? []).map((n) => [n.from, n.to]));
  const redir = new Map((j.query?.redirects ?? []).map((n) => [n.from, n.to]));
  const pages = new Map();
  for (const p of j.query?.pages ?? []) if (!p.missing && p.revisions?.[0]) pages.set(p.title, p.revisions[0].slots?.main?.content ?? p.revisions[0].content ?? "");
  for (const t of titles) {
    let x = norm.get(t) ?? t;
    x = redir.get(x) ?? x;
    out.set(t, { title: x, text: pages.get(x) ?? null });
  }
  return out;
}

async function searchPages(q) {
  const j = await api({ action: "query", generator: "search", gsrsearch: q, gsrnamespace: "0", gsrlimit: "3", prop: "revisions", rvprop: "content", rvslots: "main" });
  return (j.query?.pages ?? []).filter((p) => p.revisions?.[0]).map((p) => ({ title: p.title, text: p.revisions[0].slots?.main?.content ?? p.revisions[0].content ?? "" }));
}

async function search(q) {
  const j = await api({ action: "query", list: "search", srsearch: q, srnamespace: "0", srlimit: "5" });
  return (j.query?.search ?? []).map((s) => s.title);
}

// ---------- wikitext ----------

/** Split on a separator only at the top level (outside [[ ]], {{ }} and tags). */
function splitTop(s, sep) {
  const parts = [];
  let depthL = 0;
  let depthT = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "[[") { depthL++; cur += two; i++; continue; }
    if (two === "]]") { depthL = Math.max(0, depthL - 1); cur += two; i++; continue; }
    if (two === "{{") { depthT++; cur += two; i++; continue; }
    if (two === "}}") { depthT = Math.max(0, depthT - 1); cur += two; i++; continue; }
    if (depthL === 0 && depthT === 0 && s.startsWith(sep, i)) {
      parts.push(cur);
      cur = "";
      i += sep.length - 1;
      continue;
    }
    cur += s[i];
  }
  parts.push(cur);
  return parts;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function monthOf(m) {
  if (/^\d+$/.test(m)) return Number(m);
  const k = MONTHS.findIndex((x) => x.startsWith(String(m).toLowerCase().slice(0, 3)));
  return k >= 0 ? k + 1 : 0;
}
const pad = (n) => String(n).padStart(2, "0");

function parseDate(raw) {
  const s = raw.replace(/\{\{\s*(dts|start date|date|dtsort)\s*\|/i, "{{dts|");
  let m = /\{\{dts\|([^}]*)\}\}/i.exec(s);
  if (m) {
    const args = m[1].split("|").map((a) => a.trim()).filter((a) => a && !a.includes("="));
    if (args.length >= 3 && /^\d{4}$/.test(args[0])) return `${args[0]}-${pad(monthOf(args[1]))}-${pad(Number(args[2]))}`;
    if (args.length === 1) return parseDate(args[0]);
  }
  const t = clean(raw);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m && monthOf(m[1])) return `${m[3]}-${pad(monthOf(m[1]))}-${pad(+m[2])}`;
  m = /(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/.exec(t);
  if (m && monthOf(m[2])) return `${m[3]}-${pad(monthOf(m[2]))}-${pad(+m[1])}`;
  return "";
}

/** Wikitext to plain text. Links keep their label. */
export function clean(s) {
  let t = s;
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<ref[^>]*\/>/gi, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  t = t.replace(/<br\s*\/?>/gi, " ");
  t = t.replace(/<[^>]+>/g, "");
  for (let k = 0; k < 6 && /\{\{/.test(t); k++) {
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
      const parts = splitTop(inner, "|").map((x) => x.trim());
      const name = parts[0].toLowerCase();
      const args = parts.slice(1).filter((a) => !/^[a-z]+\s*=/.test(a));
      // Result templates are written both ways: {{yes2}}Win and {{yes2|Win}}.
      if (["yes2", "no2", "draw", "n/a", "nc", "yes", "no", "draw2", "nc2"].includes(name)) return args.join(" ");
      if (["flagicon", "flag", "efn", "ref", "refn", "citation needed", "cn", "sfn"].includes(name)) return "";
      if (name === "dts" || name === "start date") return args.join(" ");
      if (name === "sort" || name === "sortname") return args[args.length - 1] ?? "";
      if (name === "abbr") return args[0] ?? "";
      return args.length ? args[args.length - 1] : "";
    });
  }
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
  t = t.replace(/\[\[[^\]|]*\|/g, "").replace(/\]\]|\[\[/g, "");
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1");
  t = t.replace(/'''?/g, "").replace(/&nbsp;/g, " ").replace(/&ndash;/g, "–").replace(/&amp;/g, "&");
  return t.replace(/\s+/g, " ").trim();
}

function linkOf(s) {
  const m = /\[\[([^\]|#]+)/.exec(s);
  return m ? m[1].trim() : null;
}

const STD = ["res", "record", "opp", "method", "event", "date", "round", "time", "loc", "notes"];
function headerCols(text) {
  const names = text.split(/\n/).flatMap((l) => (l.startsWith("!") ? splitTop(l.slice(1), "!!") : [])).map((c) => clean(splitTop(c, "|").pop() ?? "").toLowerCase());
  if (names.length < 6) return null;
  return names.map((n) =>
    n.startsWith("res") ? "res" : n.startsWith("record") ? "record" : n.startsWith("opponent") ? "opp" : n.startsWith("method") ? "method"
    : n.startsWith("event") ? "event" : n.startsWith("date") ? "date" : n.startsWith("round") || n === "rd." || n === "rd" ? "round"
    : n.startsWith("time") ? "time" : n.startsWith("location") ? "loc" : n.startsWith("notes") ? "notes" : "x");
}

export function cellsOf(row) {
  const cells = [];
  for (const line of row.split("\n")) {
    if (line.startsWith("|") && !line.startsWith("|}") && !line.startsWith("|-")) {
      for (const c of splitTop(line.slice(1), "||")) cells.push(c);
    } else if (cells.length) cells[cells.length - 1] += ` ${line}`;
  }
  return cells.map((c) => {
    const parts = splitTop(c, "|");
    if (parts.length > 1 && /^\s*(align|rowspan|colspan|style|class|data-sort-value|bgcolor|width)\b/i.test(parts[0])) return { attr: parts[0], raw: parts.slice(1).join("|") };
    return { attr: "", raw: c };
  });
}

export function parseTable(text) {
  const start = text.search(/\{\{\s*MMA record start\s*\}\}/i);
  if (start < 0) return null;
  const tail = text.slice(start);
  const endM = /\{\{\s*end\s*\}\}|\n\|\}/i.exec(tail);
  const body = tail.slice(0, endM ? endM.index : tail.length);
  const rows = body.split(/\n\|-[^\n]*/).slice(1);
  let cols = STD;
  const spans = [];
  const fights = [];
  for (const raw of rows) {
    const row = raw.replace(/^\n+/, "");
    if (!row.trim()) continue;
    if (row.trim().startsWith("!")) {
      cols = headerCols(row) ?? cols;
      continue;
    }
    const cells = cellsOf(row);
    if (!cells.length) continue;
    const full = {};
    let ci = 0;
    for (let col = 0; col < cols.length; col++) {
      const sp = spans[col];
      if (sp && sp.left > 0) {
        full[cols[col]] = sp.raw;
        sp.left--;
        continue;
      }
      const c = cells[ci++];
      if (!c) break;
      full[cols[col]] = c.raw;
      const m = /rowspan\s*=\s*"?(\d+)/i.exec(c.attr);
      if (m && +m[1] > 1) spans[col] = { left: +m[1] - 1, raw: c.raw };
    }
    const res = clean(full.res ?? "").toLowerCase();
    const r = res.startsWith("win") ? "W" : res.startsWith("loss") ? "L" : res.startsWith("draw") ? "D" : res.includes("nc") || res.includes("no contest") ? "NC" : null;
    if (!r) continue;
    const date = parseDate(full.date ?? "");
    fights.push({
      r,
      rec: clean(full.record ?? ""),
      opp: clean(full.opp ?? ""),
      oppLink: linkOf(full.opp ?? ""),
      method: clean(full.method ?? ""),
      event: clean(full.event ?? ""),
      date,
      round: Number(clean(full.round ?? "")) || 0,
      time: clean(full.time ?? ""),
      notes: clean(full.notes ?? ""),
    });
  }
  return fights;
}

/** Wins, losses and draws up to the snapshot, against the roster's record. */
export function check(fights, rec) {
  const pre = fights.filter((f) => !f.date || f.date <= SNAP);
  const n = { w: 0, l: 0, d: 0 };
  for (const f of pre) if (f.r === "W") n.w++; else if (f.r === "L") n.l++; else if (f.r === "D") n.d++;
  const off = Math.abs(n.w - rec.w) + Math.abs(n.l - rec.l) + Math.abs(n.d - (rec.d ?? 0));
  return { pre, off, n };
}

// ---------- the run ----------

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

async function main() {

const found = new Map(); // id -> { title, fights, off }
const titleOf = (p) => p.name.replace(/\s+/g, " ").trim();

async function tryBatch(list, toTitle) {
  for (let k = 0; k < list.length; k += 8) {
    const chunk = list.slice(k, k + 8);
    const titles = chunk.map(toTitle);
    const res = await contents(titles);
    for (let i = 0; i < chunk.length; i++) {
      const p = chunk[i];
      const page = res.get(titles[i]);
      if (!page?.text) continue;
      const fights = parseTable(page.text);
      if (!fights?.length) continue;
      const c = check(fights, p.rec);
      const prev = found.get(p.id);
      if (c.off <= 3 && (!prev || c.off < prev.off)) found.set(p.id, { title: page.title, fights: c.pre, off: c.off });
    }
    process.stdout.write(`\r${found.size}/${people.length} found (batch ${Math.floor(k / 8) + 1})   `);
    await sleep(250);
  }
}

console.log(`${people.length} real fighters`);
await tryBatch(people, titleOf);
await tryBatch(people.filter((p) => !found.has(p.id)), (p) => `${titleOf(p)} (fighter)`);
const rest = people.filter((p) => !found.has(p.id));
console.log(`\nsearching for ${rest.length} more`);
let n = 0;
for (const p of rest) {
  n++;
  // One request: the search results come back with their text.
  const pages = (await searchPages(`${p.name} mixed martial artist`)).filter((x) => !x.title.toLowerCase().startsWith("list of"));
  for (const page of pages) {
    const fights = parseTable(page.text);
    if (!fights?.length) continue;
    const c = check(fights, p.rec);
    const prev = found.get(p.id);
    // A search hit has to match the record closely: it could be someone else.
    if (c.off <= 1 && (!prev || c.off < prev.off)) found.set(p.id, { title: page.title, fights: c.pre, off: c.off });
  }
  if (n % 10 === 0) process.stdout.write(`\r${found.size}/${people.length} found (search ${n}/${rest.length})   `);
  await sleep(200);
}

// Link opponents who are in the roster.
const byTitle = new Map();
for (const [id, v] of found) byTitle.set(v.title.toLowerCase(), id);
const byName = new Map(people.map((p) => [p.name.toLowerCase(), p.id]));
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const byPlain = new Map(people.map((p) => [strip(p.name), p.id]));

const out = { v: 1, snap: SNAP, source: "English Wikipedia, mixed martial arts record tables (CC BY-SA 4.0)", built: new Date().toISOString().slice(0, 10), f: {} };
let fights = 0;
for (const p of people) {
  const v = found.get(p.id);
  if (!v) continue;
  out.f[p.id] = {
    t: v.title,
    off: v.off || undefined,
    h: v.fights.map((f) => {
      const oid = (f.oppLink && byTitle.get(f.oppLink.toLowerCase())) || byName.get(f.opp.toLowerCase()) || byPlain.get(strip(f.opp)) || null;
      const row = [f.r, f.opp, f.method, f.event, f.date, f.round, f.time, f.notes, oid];
      while (row.length && (row[row.length - 1] === null || row[row.length - 1] === "")) row.pop();
      return row;
    }),
  };
  fights += v.fights.length;
}
const file = only.length ? "node_modules/.cache/history-sample.json" : "public/data/history.json";
writeFileSync(file, JSON.stringify(out));
const exact = [...found.values()].filter((v) => v.off === 0).length;
console.log(`\n${found.size} of ${people.length} fighters (${exact} match the record exactly), ${fights} fights -> ${file} (${(JSON.stringify(out).length / 1e6).toFixed(2)} MB)`);

}
