"use client";
// "Screening brief": a 3-step visual story — where is the gap, why, what would help.
// Every number comes from the API (brief n=5, recommend, whatif); nothing is computed here.
import { useEffect, useMemo, useState } from "react";
import { engineName, fmt, getRecommend, getWhatif, type Brief, type Recommend, type WhatIf } from "@/lib/api";
import { DataChip, DRIVER_HEADLINE, GapCloseBars, GapSplitBar, people, RoadmapChip, SimChip } from "@/components/RecommendBlock";

const PROGS = [
  { id: "breast", label: "Breast cancer · mammography" },
  { id: "bowel", label: "Colorectal cancer · home test" },
] as const;
type Prog = (typeof PROGS)[number]["id"];

const AXIS = { lo: 60, hi: 90 };   // attendance % axis for the step-1 chart
const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - AXIS.lo) / (AXIS.hi - AXIS.lo)) * 100))}%`;

function Step({ n, title, chip, children }: { n: number; title: string; chip: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-white/90"><span className="text-white/35 font-normal">{n} · </span>{title}</div>
        <div className="flex gap-1">{chip}</div>
      </div>
      {children}
    </div>
  );
}

export default function BriefPanel({ briefProg, prog, onProg, focus, onFocus, onOpen }: {
  briefProg?: Brief["programmes"][number]; prog: Prog; onProg: (p: Prog) => void;
  focus: string | null; onFocus: (code: string) => void; onOpen: (code: string) => void;
}) {
  const who = people(prog);
  const counties = useMemo(() => briefProg?.counties ?? [], [briefProg]);
  const [rec, setRec] = useState<Recommend | null>(null);
  const [wi, setWi] = useState<WhatIf | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // default selection = first row; reset when the programme's list changes
  useEffect(() => {
    if (!focus && counties[0]) onFocus(counties[0].code);
  }, [counties, focus, onFocus]);

  useEffect(() => {
    if (!focus) return;
    let live = true;
    getRecommend(prog, focus)
      .then((r) => { if (live) setRec(r); })
      .catch(() => { if (live) setRec(null); });
    return () => { live = false; };
  }, [prog, focus]);

  // render only results that belong to the current focus; stale ones are ignored, not cleared
  const recF = rec && rec.code === focus && rec.programme === prog ? rec : null;
  const wiF = wi && wi.code === focus && wi.programme === prog ? wi : null;

  const eng = engineName(recF?.split.validation?.engine) ?? engineName(briefProg?.note?.replace("Simulation · ", ""));
  const target = briefProg?.target ?? recF?.screening?.target ?? 80;
  const national = briefProg?.national;
  const top2 = useMemo(() => (recF?.scenarios ?? []).filter((s) => (s.extra_people_per_year ?? 0) > 0).slice(0, 2), [recF]);

  const combine = () => {
    if (!focus || top2.length < 2) return;
    setBusy(true); setErr(null);
    getWhatif(prog, focus, top2.map((s) => s.scenario))
      .then(setWi)
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false));
  };
  const combined = wiF && wiF.gap_closed_pct != null ? {
    extra: wiF.extra_people_per_year, pct: wiF.gap_closed_pct,
    segs: (() => {
      const parts = top2.map((s) => s.share_of_missing ?? 0);
      const sum = parts.reduce((a, b) => a + b, 0) || 1;
      return parts.map((p) => (p / sum) * (wiF.gap_closed_pct ?? 0));
    })(),
  } : null;

  return (
    <div className="absolute right-4 top-4 w-[420px] max-h-[calc(100vh-32px)] flex flex-col">
      <div className="glass p-4 overflow-y-auto">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[13px] font-semibold">Screening brief</div>
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {PROGS.map((p) => (
            <button key={p.id} onClick={() => onProg(p.id)}
                    className={`chip text-[11px] ${prog === p.id ? "chip-primary" : ""}`}>{p.label}</button>
          ))}
        </div>

        {/* 1 · Where is the gap? */}
        <Step n={1} title="Where is the gap?" chip={<DataChip s={counties[0]?.screening?.source} />}>
          <div className="text-[10.5px] text-white/40 mt-0.5 mb-1">Counties furthest from the {fmt(target, "%")} target</div>
          <div className="grid grid-cols-[88px_1fr_92px] gap-x-2 items-center">
            <span />
            <div className={`relative ${national != null && target != null && national < target ? "h-6" : "h-3.5"}`}>
              {target != null && (
                <span className="absolute top-0 -translate-x-full pr-1 text-[9px] whitespace-nowrap text-amber-300/80"
                      style={{ left: pos(target) }}>target {fmt(target, "%")}</span>
              )}
              {national != null && (
                <span className={`absolute translate-x-1 text-[9px] whitespace-nowrap text-white/50 ${target != null && national < target ? "top-3" : "top-0"}`}
                      style={{ left: pos(national) }}>Finland {fmt(national, "%")}</span>
              )}
            </div>
            <span />
          </div>
          <div className="relative">
            <div className="space-y-1">
              {counties.map((c) => (
                <button key={c.code} onClick={() => onFocus(c.code)}
                        className={`grid w-full grid-cols-[88px_1fr_92px] gap-x-2 items-center rounded px-1 py-0.5 text-left
                          ${focus === c.code ? "bg-amber-300/10 ring-1 ring-amber-300/40" : "hover:bg-white/5"}`}>
                  <span className={`text-[11px] truncate ${focus === c.code ? "text-amber-300" : "text-white/70"}`} title={c.name}>{c.name}</span>
                  <span className="relative h-3 rounded bg-white/5">
                    <span className={`absolute inset-y-0 left-0 rounded-r ${focus === c.code ? "bg-amber-300/60" : "bg-rose-400/50"}`}
                          style={{ width: pos(c.screening?.rate ?? 0) }} />
                  </span>
                  <span className="text-right text-[10px] tabular-nums text-white/60">
                    {c.screening ? <>{fmt(c.screening.missing_per_year)} <span className="text-white/40">/ yr</span></> : "–"}
                  </span>
                </button>
              ))}
            </div>
            <div className="absolute inset-y-0 pointer-events-none" style={{ left: "calc(88px + 12px)", right: "calc(92px + 12px)" }}>
              {target != null && <div className="absolute inset-y-0 border-l border-dashed border-amber-300/70" style={{ left: pos(target) }} />}
              {national != null && <div className="absolute inset-y-0 border-l border-white/40" style={{ left: pos(national) }} />}
            </div>
          </div>
          <div className="text-[9.5px] text-white/30 mt-0.5">attendance on a {AXIS.lo}–{AXIS.hi} % axis · {who} missing per year on the right</div>
        </Step>

        {/* 2 · Why? */}
        <Step n={2} title={`Why — ${recF?.name ?? "…"}`} chip={<SimChip eng={eng} />}>
          {recF ? (
            <>
              <div className="text-[14px] font-semibold text-white/90 mt-1">{DRIVER_HEADLINE[recF.split.driver] ?? ""}</div>
              {recF.split.driver === "national" ? (
                <p className="text-[11.5px] text-white/55 mt-1 leading-relaxed">
                  The county is at Finland&apos;s level; the gap to {fmt(recF.screening?.target ?? 80, "%")} is national —
                  {recF.screening && <> {fmt(recF.screening.missing_per_year)} {who} a year short.</>}
                </p>
              ) : (
                <>
                  <GapSplitBar split={recF.split} />
                  <p className="text-[10px] text-white/40 mt-1">
                    Population explains {recF.split.comp_pts ?? "–"} of {recF.split.total_pts ?? "–"} points
                    (simulated residents{recF.split.validation?.counties_weighted?.r != null &&
                      <>, r = {recF.split.validation.counties_weighted.r} vs real 2024 county rates</>}).
                  </p>
                </>
              )}
            </>
          ) : <div className="text-[11px] text-white/40 mt-1">loading…</div>}
        </Step>

        {/* 3 · What would help? */}
        <Step n={3} title="What would help?" chip={<><SimChip eng={eng} /><RoadmapChip /></>}>
          {recF ? (
            <>
              <GapCloseBars scenarios={recF.scenarios} missing={recF.screening?.missing_per_year} who={who} combined={combined} />
              {!wiF && top2.length >= 2 && (
                <button onClick={combine} disabled={busy}
                        className="mt-1.5 w-full rounded-lg bg-emerald-400/15 border border-emerald-300/30 text-emerald-300 text-[12px] py-1.5
                                   hover:bg-emerald-400/25 disabled:opacity-40">
                  {busy ? "asking simulated residents…" : `Combine the top two (${top2.map((s) => s.short ?? s.scenario).join(" + ").toLowerCase()})`}
                </button>
              )}
              {wiF && (
                <div className="flex items-center gap-2 mt-1">
                  <SimChip eng={engineName(wiF.engine)} />
                  <span className="text-[10px] text-white/40">live calls {wiF.asked_live} · cached {wiF.from_cache} · an upper bound, not a forecast</span>
                </div>
              )}
              {err && <div className="text-[11px] text-rose-300 mt-1">{err}</div>}
            </>
          ) : <div className="text-[11px] text-white/40 mt-1">loading…</div>}
          <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between gap-2">
            <button onClick={() => focus && onOpen(focus)}
                    className="text-[11px] text-amber-300/90 hover:text-amber-200 underline decoration-dotted">
              Open full county card →
            </button>
            <span className="text-[9.5px] text-white/35 text-right leading-snug">Simulated estimates, not forecasts.<br />Private screening counts as absence.</span>
          </div>
        </Step>
      </div>
    </div>
  );
}
