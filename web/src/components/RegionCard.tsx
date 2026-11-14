"use client";
// One county along the care pathway: every indicator against Finland, its rank among the counties, and the source.
import { useEffect, useState } from "react";
import { fmt, getRecommend, type Gap, type Pathway, type PathwayItem, type Recommend } from "@/lib/api";
import RecommendBlock, { people } from "@/components/RecommendBlock";
import WhatIfPanel from "@/components/WhatIf";
import { Seg, Tag } from "@/components/ui";

const STAGE_LABEL: Record<string, string> = {
  detection: "Detection", referral: "Referral", diagnosis: "Diagnosis", treatment: "Treatment", outcome: "Outcome", context: "Context",
};
const STAGE_QUESTION: Record<string, string> = {
  detection: "Do people come to screening?", referral: "Do they reach a specialist in time?",
  diagnosis: "Is the cancer found early?", treatment: "Does treatment start in time?",
  outcome: "How does it end?", context: "Who lives here?",
};
const STAGES = ["detection", "referral", "diagnosis", "treatment", "outcome", "context"];
const TABS = [
  { id: "why", label: "Why & what to do" },
  { id: "pathway", label: "Pathway" },
  { id: "whatif", label: "What if" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const PROGS = [{ id: "breast", label: "Breast" }, { id: "bowel", label: "Colorectal" }] as const;

export function Src({ s }: { s: { url: string; org: string; indicator?: number | null; year?: number | null; period?: string } }) {
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className="t-micro hover:text-white/70 underline decoration-dotted">
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
    <button onClick={() => onPick(it.key)} className={`w-full text-left rounded-lg px-2.5 py-1.5 transition ${active ? "rowsel" : "hover:bg-white/5"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-body text-white/80 leading-tight">{it.label}{it.goal === 3 && <Tag v="goal3"><i>GOAL 3</i></Tag>}
          {(it.rising_months ?? 0) >= 3 && <Tag v="warn"><i>early warning · {it.rising_months} mo</i></Tag>}
        </span>
        <span className="t-section tabular-nums whitespace-nowrap">
          {it.trend && it.trend.length > 1 && <Spark pts={it.trend} bad={(it.rising_months ?? 0) >= 3} />}{" "}
          {fmt(it.value, it.unit)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-0.5">
        <span className={`t-caption ${tone}`}>
          {it.delta != null && <>{it.delta > 0 ? "+" : ""}{fmt(it.delta)} vs Finland {fmt(it.national, it.unit)}</>}
          {it.rank != null && <span className="text-white/40"> · {it.rank}/{it.of}</span>}
          {it.target != null && <span className="text-white/40"> · target {fmt(it.target, it.unit)}</span>}
          {it.abs_is_denominator && it.abs_value != null && (
            <span className="text-white/40"> · n = {fmt(it.abs_value)}
              {it.abs_value < 30 && <> <Tag v="warn"><i>small numbers</i></Tag></>}
            </span>
          )}
          {it.shared_producer && <span className="text-white/40"> · shared producer {it.shared_producer}</span>}
        </span>
        <Src s={it.source} />
      </div>
    </button>
  );
}

export default function RegionCard({ p, gaps, active, onPick, onClose, prog, onProg }: {
  p: Pathway; gaps: Gap[]; active: string; onPick: (k: string) => void; onClose: () => void;
  prog: "breast" | "bowel"; onProg: (p: "breast" | "bowel") => void;
}) {
  const [tab, setTab] = useState<Tab>("why");
  const [recs, setRecs] = useState<Recommend[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([getRecommend("breast", p.code), getRecommend("bowel", p.code)])
      .then((r) => { if (live) setRecs(r); })
      .catch(() => { if (live) setRecs([]); });
    return () => { live = false; };
  }, [p.code]);
  const rec = recs.find((r) => r.programme === prog);
  const who = people(prog);

  return (
    <div className="glass p-4 w-[420px] max-h-[calc(100vh-88px)] overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <h2 className="t-title">{p.name}</h2>
        <button onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none mt-0.5">×</button>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <p className="t-caption">
          {rec?.screening
            ? <>{fmt(rec.screening.rate, "%")} of invited {who} attend
                {rec.screening.missing_per_year > 0 && <> · about <span className="text-white/85 font-medium">{fmt(rec.screening.missing_per_year)} {who}</span> a year missing</>}</>
            : "Public data only, with sources."}
        </p>
        <Seg options={PROGS} value={prog} onChange={onProg} small />
      </div>
      <div className="mt-2.5"><Seg options={TABS} value={tab} onChange={setTab} /></div>

      {tab === "why" && (
        <div className="mt-3">
          {gaps.length > 0 && (
            <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="t-caption mb-1">Missing to reach 80 % attendance, per year</div>
              {gaps.map((g) => (
                <div key={g.key} className="flex items-baseline justify-between t-body py-0.5">
                  <span className="text-white/75">{g.key.replace("screen_", "").replace("bowel", "colorectal")} · {fmt(g.rate, "%")}</span>
                  <span className="tabular-nums">
                    {g.missing_per_year > 0 ? <b>{fmt(g.missing_per_year)} people</b> : <span className="text-emerald-400">on target</span>}
                    <span className="text-white/40"> of {fmt(g.invited)}</span>
                  </span>
                </div>
              ))}
              <div className="t-micro mt-1">invited = attended ÷ rate; missing = 80 % × invited − attended · <Src s={gaps[0].source} /></div>
            </div>
          )}
          {rec ? <RecommendBlock r={rec} /> : <div className="t-caption">No recommendation for this programme.</div>}
        </div>
      )}

      {tab === "pathway" && (
        <div className="mt-3">
          {STAGES.map((st) => {
            const items = p.indicators.filter((i) => i.stage === st);
            if (st === "diagnosis") {
              return (
                <div key={st} className="mb-2">
                  <div className="px-2.5 mt-2 mb-0.5">
                    <span className="t-caption uppercase tracking-wide text-white/45">{STAGE_LABEL[st]}</span>
                    <span className="t-micro italic ml-1.5">{STAGE_QUESTION[st]}</span>
                  </div>
                  <p className="t-caption leading-snug mx-2.5 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
                    No public county data — stage known for 42 % of cancers nationally
                    (<a href="https://syoparekisteri.fi/assets/themes/ssy3/factsheets/syopa_2024_tilastoraportti.html"
                        target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-white/80">
                      Cancer Registry 2024</a>, from report text).
                  </p>
                </div>
              );
            }
            if (!items.length) return null;
            return (
              <div key={st} className="mb-2">
                <div className="px-2.5 mt-2 mb-0.5">
                  <span className="t-caption uppercase tracking-wide text-white/45">{STAGE_LABEL[st]}</span>
                  <span className="t-micro italic ml-1.5">{STAGE_QUESTION[st]}</span>
                </div>
                {items.map((it) => <Row key={it.key} it={it} onPick={onPick} active={it.key === active} />)}
              </div>
            );
          })}
        </div>
      )}

      {tab === "whatif" && (
        <div className="mt-3"><WhatIfPanel code={p.code} recs={recs} prog={prog} /></div>
      )}
    </div>
  );
}
