import { useEffect, useRef, useState } from "react";
import { fmtDate } from "../../core/time";
import { compatible, deleteSave, exportWorld, importFile, listSaves, loadWorld, type SaveMeta } from "../../state/persist";
import { setBusy, setWorld, toast } from "../../state/store";
import { Logo } from "../icons";
import { go } from "../router";

export function Title() {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => listSaves().then(setSaves);
  useEffect(() => {
    void refresh();
  }, []);
  const load = async (id: string) => {
    setBusy("Loading the career…");
    try {
      const w = await loadWorld(id);
      if (!w) throw new Error("Save not found.");
      setWorld(w);
      go("/home");
    } catch (e) {
      toast(String((e as Error).message), "bad");
    } finally {
      setBusy(null);
    }
  };
  const onImport = async (f: File) => {
    try {
      const w = await importFile(f);
      setWorld(w);
      go("/home");
      toast("Career imported.", "good");
    } catch (e) {
      toast(String((e as Error).message), "bad");
    }
  };
  return (
    <div className="title-screen">
      <div className="title-wrap">
        <div className="title-hero">
          <div className="row" style={{ marginBottom: 26 }}>
            <Logo size={40} />
            <span className="label" style={{ color: "var(--band-ink-3)" }}>Version 4 · rebuilt from zero</span>
          </div>
          <h1>
            MMA
            <span>Manager</span>
          </h1>
          <p className="lede">
            Take a fighter from the amateur circuit to a UFC belt, or build a management stable. Real promotions, the real UFC and PFL rosters, an engine tuned to the UFC's own numbers, and camps, cuts and contracts that work the way the sport does.
          </p>
          <div className="title-facts">
            <div><b>968</b><span>Real UFC and PFL fighters</span></div>
            <div><b>27</b><span>Promotions in eight regions</span></div>
            <div><b>30 / 19 / 50</b><span>KO, sub and decision %, as in the UFC</span></div>
          </div>
        </div>
        <div className="title-side stack">
          <div className="panel">
            <div className="panel-h"><h3>Play</h3></div>
            <div className="panel-b stack">
              <button className="btn primary lg" onClick={() => go("/new")}>New career</button>
              <button className="btn" onClick={() => file.current?.click()}>Import a save file</button>
              <input ref={file} type="file" accept=".json,.gz,application/json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Saved careers</h3></div>
            {saves === null ? (
              <div className="empty">Looking for saves…</div>
            ) : saves.length === 0 ? (
              <div className="empty"><b style={{ color: "var(--band-ink)" }}>No careers yet</b>Start one: it saves itself in this browser.</div>
            ) : (
              saves.map((s) => (
                <div className="save-row" key={s.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="disp up ellip" style={{ fontSize: 20 }}>{s.who}</div>
                    <div className="small" style={{ color: "var(--band-ink-3)" }}>
                      {s.mode === "manager" ? "Manager" : "Fighter"} · {fmtDate(s.day)} · saved {new Date(s.savedAt).toLocaleDateString()}
                    </div>
                  </div>
                  {compatible(s) ? (
                    <button className="btn primary sm" onClick={() => load(s.id)}>Continue</button>
                  ) : (
                    <span className="badge bad">Old version</span>
                  )}
                  <button className="btn sm" onClick={async () => { const w = await loadWorld(s.id); if (w) exportWorld(w); }}>Export</button>
                  <button className="btn sm danger" onClick={async () => { if (!confirm(`Delete the career of ${s.who}? This cannot be undone.`)) return; await deleteSave(s.id); void refresh(); }}>Delete</button>
                </div>
              ))
            )}
          </div>
          <p className="tiny" style={{ color: "var(--band-ink-3)" }}>
            An unofficial fan game, not affiliated with or endorsed by the UFC, the PFL or any promotion named. Real names are used for identification only.
          </p>
        </div>
      </div>
    </div>
  );
}
