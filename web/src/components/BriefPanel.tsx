"use client";
// "Screening brief": a 3-step visual story — where is the gap, why, what would help.
// Every number comes from the API (brief n=5, recommend, whatif); nothing is computed here.
import { useEffect, useMemo, useState } from "react";
import { engineName, fmt, getRecommend, getWhatif, type Brief, type Recommend, type WhatIf } from "@/lib/api";
import { DataChip, DRIVER_HEADLINE, GapCloseBars, GapSplitBar, people, RoadmapChip, SimChip } from "@/components/RecommendBlock";
import { Seg, Skel, StepNo } from "@/components/ui";

const PROGS = [
  { id: "breast", label: "Breast · mammography" },
  { id: "bowel", label: "Colorectal · home test" },
] as const;
type Prog = (typeof PROGS)[number]["id"];

const AXIS = { lo: 60, hi: 90 };   // attendance % axis for the step-1 chart
const pos = (v: number) => Math.min(100, Math.max(0, ((v - AXIS.lo) / (AXIS.hi - AXIS.lo)) * 100));

function Step({ n, title, chip, children }: { n: number; title: string; chip: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3.5 first:mt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="t-section flex items-center gap-1.5"><StepNo n={n} />{title}</div>
        <div className="flex gap-1">{chip}</div>
      </div>
      {children}
    </div>
  );
}

export default function BriefPanel({ briefProg, prog, onProg, focus, onFocus, onOpen, error }: {
  briefProg?: Brief["programmes"][number]; prog: Prog; onProg: (p: Prog) => void;
  focus: string | null; onFocus: (code: string) => void; onOpen: (code: string) => void;
  error?: boolean;
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
    <div className="absolute right-4 top-[72px] w-[420px] max-h-[calc(100vh-88px)] flex flex-col">
      <div className="glass p-4 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="t-panel whitespace-nowrap">Screening brief</div>
          <Seg options={PROGS} value={prog} onChange={onProg} small />
        </div>

        {error ? (
          <div className="t-body text-rose-300 mt-4">
            Can&apos;t reach the data API — start it with <code className="text-rose-200">make app</code>.
          </div>
        ) : !briefProg ? (
          <div className="mt-3 space-y-2">
            <Skel className="h-5 w-2/3" /><Skel className="h-28" /><Skel className="h-20" /><Skel className="h-32" />
          </div>
        ) : (
          <>
        {/* 1 · Where is the gap? */}
        <Step n={1} title="Where is the gap?" chip={<DataChip s={counties[0]?.screening?.source} />}>
          <div className="t-caption mt-0.5 mb-1">Counties furthest from the {fmt(target, "%")} target</div>
          <div className="relative">
            <div className="space-y-1">
              {counties.map((c) => {
                const rate = c.screening?.rate;
                const x = rate != null ? pos(rate) : 0;
                return (
                  <button key={c.code} onClick={() => onFocus(c.code)}
                          className={`grid w-full grid-cols-[128px_1fr_84px] gap-x-2 items-center rounded px-1.5 py-1 text-left
                            ${focus === c.code ? "rowsel" : "hover:bg-white/5"}`}>
                    <span className={`text-[11.5px] truncate ${focus === c.code ? "text-white font-medium" : "text-white/70"}`} title={c.name}>{c.name}</span>
                    <span className="relative h-2.5 rounded-full bg-white/5">
                      <span className={`absolute inset-y-0 left-0 rounded-full ${focus === c.code ? "bg-white/70" : "bg-rose-400/55"}`}
                            style={{ width: `${x}%` }} />
                      {rate != null && (
                        <span className={`absolute top-1/2 -translate-y-1/2 text-[9.5px] tabular-nums ${x > 72 ? "right-1 text-black/70 font-semibold" : "text-white/55"}`}
                              style={x > 72 ? undefined : { left: `calc(${x}% + 4px)` }}>{fmt(rate, "%")}</span>
                      )}
                    </span>
                    <span className="text-right text-[10px] tabular-nums text-white/60">
                      {c.screening ? <>{fmt(c.screening.missing_per_year)} <span className="text-white/35">/ yr</span></> : "–"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="absolute inset-y-0 pointer-events-none" style={{ left: "calc(128px + 8px)", right: "calc(84px + 8px)" }}>
              {target != null && <div className="absolute inset-y-0 border-l border-dashed border-amber-300/70" style={{ left: `${pos(target)}%` }} />}
              {national != null && <div className="absolute inset-y-0 border-l border-white/40" style={{ left: `${pos(national)}%` }} />}
            </div>
          </div>
          <div className="t-micro mt-1 flex items-center gap-3">
            {target != null && <span><span className="text-amber-300/80">┆</span> target {fmt(target, "%")}</span>}
            {national != null && <span><span className="text-white/50">│</span> Finland {fmt(national, "%")}</span>}
            <span className="ml-auto">attendance · {who} missing / yr</span>
          </div>
        </Step>

        {/* 2 · Why? */}
        <Step n={2} title={`Why — ${recF?.name ?? "…"}`} chip={<SimChip eng={eng} />}>
          {recF ? (
            <>
              <div className="t-panel mt-1.5">{DRIVER_HEADLINE[recF.split.driver] ?? ""}</div>
              {recF.split.driver === "national" ? (
                <p className="t-body text-white/55 mt-1">
                  The county is at Finland&apos;s level; the gap to {fmt(recF.screening?.target ?? 80, "%")} is national —
                  {recF.screening && <> {fmt(recF.screening.missing_per_year)} {who} a year short.</>}
                </p>
              ) : (
                <>
                  <GapSplitBar split={recF.split} />
                  <p className="t-micro mt-1">
                    Population explains {recF.split.comp_pts ?? "–"} of {recF.split.total_pts ?? "–"} points
                    (simulated residents{recF.split.validation?.counties_weighted?.r != null &&
                      <>, r = {recF.split.validation.counties_weighted.r} vs real 2024 county rates</>}).
                  </p>
                </>
              )}
            </>
          ) : <Skel className="h-16 mt-2" />}
        </Step>

        {/* 3 · What would help? */}
        <Step n={3} title="What would help?" chip={<><SimChip eng={eng} /><RoadmapChip /></>}>
          {recF ? (
            <>
              <GapCloseBars scenarios={recF.scenarios} missing={recF.screening?.missing_per_year} who={who} combined={combined} />
              {!wiF && top2.length >= 2 && (
                <button onClick={combine} disabled={busy}
                        className="mt-2 w-full rounded-lg bg-white/[0.06] border border-white/15 text-white/80 text-[12px] py-1.5
                                   hover:bg-white/10 disabled:opacity-40">
                  {busy ? "asking simulated residents…" : `Combine the top two (${top2.map((s) => s.short ?? s.scenario).join(" + ").toLowerCase()})`}
                </button>
              )}
              {wiF && (
                <div className="flex items-center gap-2 mt-1.5">
                  <SimChip eng={engineName(wiF.engine)} />
                  <span className="t-micro">live calls {wiF.asked_live} · cached {wiF.from_cache} · an upper bound, not a forecast</span>
                </div>
              )}
              {err && <div className="t-body text-rose-300 mt-1">{err}</div>}
            </>
          ) : <Skel className="h-24 mt-2" />}
          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
            <button onClick={() => focus && onOpen(focus)}
                    className="t-caption text-white/70 hover:text-white underline decoration-dotted underline-offset-2">
              Open county card →
            </button>
            <span className="t-micro text-right">Simulated estimates, not forecasts.<br />Private screening counts as absence.</span>
          </div>
        </Step>
          </>
        )}
      </div>
    </div>
  );
}
