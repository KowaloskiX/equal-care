"use client";
// "What if this county…" — a live run of the simulated residents with combined interventions.
// Every number comes back from /api/whatif; nothing is computed here.
import { useState } from "react";
import { engineName, fmt, getWhatif, type Recommend, type WhatIf } from "@/lib/api";
import { Assumption, Cite, SimPill } from "@/components/RecommendBlock";

const PROGS = [{ id: "breast", label: "Breast" }, { id: "bowel", label: "Colorectal" }];

export default function WhatIfPanel({ code, recs }: { code: string; recs: Recommend[] }) {
  const [prog, setProg] = useState("breast");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<WhatIf | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const rec = recs.find((r) => r.programme === prog);
  const eng = engineName(rec?.split.note?.replace("Simulation · ", "") || res?.engine) ?? "Jev";
  const scenarioOpts = (rec?.scenarios ?? []).map((s) => ({ id: s.scenario, label: s.label }));

  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const run = () => {
    setBusy(true); setErr(null);
    getWhatif(prog, code, [...sel])
      .then(setRes)
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="mb-3 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.05] p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="text-[11px] uppercase tracking-wide text-emerald-300/80">What if this county…</div>
        <div className="flex gap-1">
          {PROGS.map((p) => (
            <button key={p.id} onClick={() => { setProg(p.id); setRes(null); }}
                    className={`chip text-[10.5px] ${prog === p.id ? "chip-primary" : ""}`}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {scenarioOpts.map((s) => (
          <button key={s.id} onClick={() => toggle(s.id)} title={s.label}
                  className={`chip text-[11px] ${sel.has(s.id) ? "chip-primary" : ""}`}>{s.label}</button>
        ))}
      </div>
      <button onClick={run} disabled={!sel.size || busy}
              className="w-full rounded-lg bg-emerald-400/15 border border-emerald-300/30 text-emerald-300 text-[12.5px] py-1.5
                         hover:bg-emerald-400/25 disabled:opacity-40 disabled:cursor-not-allowed">
        {busy ? `asking simulated residents (${eng})…` : "Run simulation"}
      </button>
      {err && <div className="text-[11.5px] text-rose-300 mt-1.5">{err}</div>}
      {res && !busy && (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] text-white/80">combined effect in {res.name}</span>
            <SimPill text={res.note} />
          </div>
          <div className="text-[15px] font-semibold text-emerald-300 tabular-nums mt-0.5">
            {res.extra_people_per_year != null ? `+${fmt(res.extra_people_per_year)} people/yr` : "–"}
            {res.gap_closed_pct != null && <span className="text-white/70 font-normal"> · closes {res.gap_closed_pct} % of the gap</span>}
            {res.delta_points != null && <span className="text-white/70 font-normal"> · {res.delta_points > 0 ? "+" : ""}{res.delta_points} pts</span>}
          </div>
          <div className="text-[10.5px] text-white/45 mt-0.5">
            {res.baseline_rate != null && <>simulated rate {fmt(res.baseline_rate, "%")} → {fmt(res.new_rate, "%")} · </>}
            live calls: {res.asked_live} · cached: {res.from_cache}
            {res.validation?.counties_weighted?.r != null && <> · validation r {res.validation.counties_weighted.r}</>}
          </div>
          <div className="mt-1 space-y-0.5">
            {res.scenarios.map((s) => (
              <div key={s.scenario} className="px-1 py-0.5">
                <div className="text-[11.5px] text-white/60 leading-tight">{s.label}</div>
                <div className="flex flex-wrap gap-x-2">{s.actions.map((a) => <Cite key={a.id} a={a} />)}</div>
                {s.assumption && <Assumption text={s.assumption} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
