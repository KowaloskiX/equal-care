"use client";
// "Screening story" — the left column's narrative tab: where is the gap → why → what would help.
// Simulation numbers appear only after the user runs them (SimReplay replays the recorded answers).
import { useEffect, useMemo, useState } from "react";
import { engineName, fmt, getRecommend, type Brief, type Recommend } from "@/lib/api";
import { axisPos, BaselineStep, ScenarioStep } from "@/components/SimReplay";
import { DataChip, people, RoadmapChip, SimChip } from "@/components/RecommendBlock";
import { Seg, Skel, StepNo, Tag } from "@/components/ui";

const PROGS = [
  { id: "breast", label: "Breast · mammography" },
  { id: "bowel", label: "Colorectal · home test" },
] as const;
type Prog = (typeof PROGS)[number]["id"];

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

export default function Story({ briefProg, prog, onProg, focus, onFocus, onOpen, error, onLive }: {
  briefProg?: Brief["programmes"][number]; prog: Prog; onProg: (p: Prog) => void;
  focus: string | null; onFocus: (code: string) => void; onOpen: (code: string) => void;
  error?: boolean; onLive?: (v: { code: string; value: number } | null) => void;
}) {
  const who = people(prog);
  const counties = useMemo(() => briefProg?.counties ?? [], [briefProg]);
  const [rec, setRec] = useState<Recommend | null>(null);

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

  const recF = rec && rec.code === focus && rec.programme === prog ? rec : null;
  const eng = engineName(recF?.split.validation?.engine) ?? engineName(briefProg?.note?.replace("Simulation · ", ""));
  const target = briefProg?.target ?? recF?.screening?.target ?? 80;
  const national = briefProg?.national;

  if (error) {
    return (
      <div className="t-body text-rose-300 mt-4">
        Can&apos;t reach the data API — start it with <code className="text-rose-200">make app</code>.
      </div>
    );
  }
  if (!briefProg) {
    return <div className="mt-3 space-y-2"><Skel className="h-5 w-2/3" /><Skel className="h-28" /><Skel className="h-20" /><Skel className="h-32" /></div>;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="t-panel whitespace-nowrap">Screening story</div>
        <Seg options={PROGS} value={prog} onChange={onProg} small />
      </div>

      {/* 1 · Where is the gap? */}
      <Step n={1} title="Where is the gap?" chip={<DataChip s={counties[0]?.screening?.source} />}>
        <div className="t-caption mt-0.5 mb-1">Counties furthest from the {fmt(target, "%")} target</div>
        <div className="relative">
          <div className="space-y-1">
            {counties.map((c) => {
              const rate = c.screening?.rate;
              const x = rate != null ? axisPos(rate) : 0;
              return (
                <button key={c.code} onClick={() => onFocus(c.code)}
                        className={`grid w-full grid-cols-[128px_1fr_44px_84px] gap-x-2 items-center rounded px-1.5 py-1 text-left
                          ${focus === c.code ? "rowsel" : "hover:bg-white/5"}`}>
                  <span className={`text-[11.5px] truncate ${focus === c.code ? "text-white font-medium" : "text-white/70"}`} title={c.name}>{c.name}</span>
                  <span className="relative h-2.5 rounded-full bg-white/5">
                    <span className={`absolute inset-y-0 left-0 rounded-full ${focus === c.code ? "bg-white/70" : "bg-rose-400/55"}`}
                          style={{ width: `${x}%` }} />
                  </span>
                  <span className="text-right text-[10px] tabular-nums text-white/60">{rate != null ? fmt(rate, "%") : "–"}</span>
                  <span className="text-right text-[10px] tabular-nums text-white/60">
                    {c.screening ? <>{fmt(c.screening.missing_per_year)} <span className="text-white/35">/ yr</span></> : "–"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="absolute inset-y-0 pointer-events-none" style={{ left: "calc(128px + 8px)", right: "calc(84px + 8px + 44px + 8px)" }}>
            {target != null && <div className="absolute inset-y-0 border-l border-dashed border-amber-300/70" style={{ left: `${axisPos(target)}%` }} />}
            {national != null && <div className="absolute inset-y-0 border-l border-white/40" style={{ left: `${axisPos(national)}%` }} />}
          </div>
        </div>
        <div className="t-micro mt-1 flex items-center gap-3">
          {target != null && <span><span className="text-amber-300/80">┆</span> target {fmt(target, "%")}</span>}
          {national != null && <span><span className="text-white/50">│</span> Finland {fmt(national, "%")}</span>}
          <span className="ml-auto">attendance · {who} missing / yr</span>
        </div>
        {recF?.survival && (
          <p className="text-[11.5px] text-white/60 mt-1.5">
            <Tag v="goal3"><i>GOAL 3</i></Tag>{" "}
            5-year survival {fmt(recF.survival.value, "%")} (Finland {fmt(recF.survival.national, "%")})
          </p>
        )}
      </Step>

      {/* 2 · Why? */}
      <Step n={2} title={`Why — ${recF?.name ?? "…"}`} chip={<SimChip eng={eng} />}>
        {focus ? <BaselineStep key={`${prog}:${focus}`} prog={prog} code={focus} rec={recF} who={who} onLive={onLive} />
               : <Skel className="h-16 mt-2" />}
      </Step>

      {/* 3 · What would help? */}
      <Step n={3} title="What would help?" chip={<><SimChip eng={eng} /><RoadmapChip /></>}>
        {focus && recF ? <ScenarioStep key={`${prog}:${focus}`} prog={prog} code={focus} rec={recF} who={who} onLive={onLive} />
                       : <Skel className="h-24 mt-2" />}
        <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
          <button onClick={() => focus && onOpen(focus)}
                  className="t-caption text-white/70 hover:text-white underline decoration-dotted underline-offset-2">
            Open county card →
          </button>
          <span className="t-micro text-right">Simulated estimates, not forecasts.<br />Private screening counts as absence.</span>
        </div>
      </Step>
    </>
  );
}
