"use client";
// One county along the care pathway: every indicator against Finland, its rank among the counties, and the source.
import { useEffect, useState } from "react";
import { fmt, getRecommend, type Gap, type Pathway, type PathwayItem, type Recommend } from "@/lib/api";
import RecommendBlock from "@/components/RecommendBlock";
import WhatIfPanel from "@/components/WhatIf";

const PROG_LABEL: Record<string, string> = { breast: "Breast screening", bowel: "Colorectal screening" };

const STAGE_LABEL: Record<string, string> = {
  context: "Who lives here", detection: "Detection · screening", referral: "Referral · access to specialised care",
  treatment: "Treatment", outcome: "Outcome",
};

export function Src({ s }: { s: { url: string; org: string; indicator?: number | null; year?: number | null; period?: string } }) {
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className="text-[11px] text-white/40 hover:text-amber-300 underline decoration-dotted">
      {s.org}{s.indicator != null ? ` #${s.indicator}` : ""}{s.period || s.year ? `, ${s.period ?? s.year}` : ""}
    </a>
  );
}

function Spark({ pts, bad }: { pts: [number, number][]; bad: boolean }) {
  const w = 56, h = 14, xs = pts.map((p) => p[1]);
  const lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo || 1;
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${h - ((p[1] - lo) / span) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} className="inline-block align-middle opacity-80">
      <polyline points={d} fill="none" stroke={bad ? "#f87171" : "#94a3b8"} strokeWidth="1.2" />
      <circle cx={w} cy={h - ((xs[xs.length - 1] - lo) / span) * (h - 2) - 1} r="1.6" fill={bad ? "#f87171" : "#94a3b8"} />
    </svg>
  );
}

function Row({ it, onPick, active }: { it: PathwayItem; onPick: (k: string) => void; active: boolean }) {
  const tone = it.worse_than_national == null ? "text-white/60" : it.worse_than_national ? "text-rose-400" : "text-emerald-400";
  return (
    <button onClick={() => onPick(it.key)} className={`w-full text-left rounded-lg px-2.5 py-2 transition ${active ? "bg-white/10" : "hover:bg-white/5"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-white/80 leading-tight">{it.label}{it.goal === 3 && <span className="ml-1.5 pill text-amber-300 border-amber-300/40">Goal 3</span>}
          {(it.rising_months ?? 0) >= 3 && <span className="ml-1.5 pill text-rose-300 border-rose-300/40">early warning · {it.rising_months} mo</span>}
        </span>
        <span className="font-semibold tabular-nums whitespace-nowrap">
          {it.trend && it.trend.length > 1 && <Spark pts={it.trend} bad={(it.rising_months ?? 0) >= 3} />}{" "}
          {fmt(it.value, it.unit)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-0.5">
        <span className={`text-[11.5px] ${tone}`}>
          {it.delta != null && <>{it.delta > 0 ? "+" : ""}{fmt(it.delta)} vs Finland {fmt(it.national, it.unit)}</>}
          {it.rank != null && <span className="text-white/45"> · {it.rank}/{it.of}</span>}
          {it.target != null && <span className="text-white/45"> · target {fmt(it.target, it.unit)}</span>}
          {it.abs_is_denominator && it.abs_value != null && (
            <span className="text-white/45"> · n = {fmt(it.abs_value)}
              {it.abs_value < 30 && <span className="ml-1 pill text-amber-300 border-amber-300/40">small numbers</span>}
            </span>
          )}
          {it.shared_producer && <span className="text-white/45"> · value of shared producer {it.shared_producer}</span>}
        </span>
        <Src s={it.source} />
      </div>
    </button>
  );
}

export default function RegionCard({ p, gaps, active, onPick, onClose }: {
  p: Pathway; gaps: Gap[]; active: string; onPick: (k: string) => void; onClose: () => void;
}) {
  const stages = ["detection", "referral", "treatment", "outcome", "context"];
  const [recs, setRecs] = useState<Recommend[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([getRecommend("breast", p.code), getRecommend("bowel", p.code)])
      .then((r) => { if (live) setRecs(r); })
      .catch(() => { if (live) setRecs([]); });
    return () => { live = false; };
  }, [p.code]);
  return (
    <div className="glass p-4 w-[380px] max-h-[calc(100vh-32px)] overflow-y-auto">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="text-[17px] font-semibold leading-tight">{p.name}</h2>
        <button onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none">×</button>
      </div>
      {recs.length > 0 && (
        <div className="mb-3 rounded-xl border border-sky-300/25 bg-sky-300/[0.05] p-3">
          <div className="text-[11px] uppercase tracking-wide text-sky-300/80 mb-1.5">Why and what to do</div>
          {recs.map((r) => (
            <div key={r.programme}>
              <div className="text-[11px] uppercase tracking-wide text-white/40 mt-1.5">{PROG_LABEL[r.programme] ?? r.programme}</div>
              <RecommendBlock r={r} />
            </div>
          ))}
        </div>
      )}
      <WhatIfPanel code={p.code} recs={recs} />
      {gaps.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3">
          <div className="text-[11px] uppercase tracking-wide text-amber-300/80 mb-1.5">Missing to reach 80 % attendance, per year</div>
          {gaps.map((g) => (
            <div key={g.key} className="flex items-baseline justify-between text-[12.5px] py-0.5">
              <span className="text-white/75">{g.key.replace("screen_", "").replace("bowel", "colorectal")} · {fmt(g.rate, "%")}</span>
              <span className="tabular-nums">
                {g.missing_per_year > 0 ? <b>{fmt(g.missing_per_year)} people</b> : <span className="text-emerald-400">on target</span>}
                <span className="text-white/40"> of {fmt(g.invited)}</span>
              </span>
            </div>
          ))}
          <div className="text-[10.5px] text-white/40 mt-1.5">invited = attended ÷ rate; missing = 80 % × invited − attended · <Src s={gaps[0].source} /></div>
        </div>
      )}
      {stages.map((st) => {
        const items = p.indicators.filter((i) => i.stage === st);
        if (!items.length) return null;
        return (
          <div key={st} className="mb-2">
            <div className="text-[11px] uppercase tracking-wide text-white/40 px-2.5 mt-2 mb-0.5">{STAGE_LABEL[st]}</div>
            {items.map((it) => <Row key={it.key} it={it} onPick={onPick} active={it.key === active} />)}
          </div>
        );
      })}
    </div>
  );
}
