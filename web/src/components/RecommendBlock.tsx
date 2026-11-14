"use client";
// "Why and what to do": one programme's recommendation for a county — the gap split (simulation),
// scenario effects in people per year, and the cited roadmap actions behind every recommendation.
import { fmt, type ActionRef, type Recommend, type ScenarioRow } from "@/lib/api";

const DRIVER: Record<string, string> = {
  services: "mostly unexplained by population — services, access or private care are the likelier cause",
  population: "mostly explained by who lives here",
  national: "at the national level — the gap to the target is national, not local",
  on_target: "at the 80 % target",
};

export function SimPill({ text = "Simulation" }: { text?: string }) {
  return <span className="pill text-sky-300 border-sky-300/40">{text}</span>;
}

function Cite({ a }: { a: ActionRef }) {
  return (
    <a href={a.url} target="_blank" rel="noreferrer" title={a.title}
       className="text-amber-300/90 hover:text-amber-300 underline decoration-dotted whitespace-nowrap">
      Roadmap {a.id}, p.{a.page}
    </a>
  );
}

function Assumption({ text }: { text: string }) {
  return (
    <details className="mt-0.5">
      <summary className="inline-block pill text-violet-300 border-violet-300/40 cursor-pointer select-none">ASSUMPTION</summary>
      <p className="text-[11px] text-white/50 mt-1">{text}</p>
    </details>
  );
}

function Scenario({ s }: { s: ScenarioRow }) {
  return (
    <div className="rounded-lg px-2.5 py-1.5 hover:bg-white/5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-white/80 leading-tight">{s.label}</span>
        <span className="font-semibold tabular-nums whitespace-nowrap text-emerald-300">
          {s.extra_people_per_year != null && s.extra_people_per_year > 0 ? `+${fmt(s.extra_people_per_year)}/yr` : "–"}
        </span>
      </div>
      <div className="text-[11px] text-white/45 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
        {s.delta_points != null && <span>{s.delta_points > 0 ? "+" : ""}{s.delta_points} pts</span>}
        {s.actions.map((a) => <Cite key={a.id} a={a} />)}
      </div>
      {s.assumption && <Assumption text={s.assumption} />}
    </div>
  );
}

export default function RecommendBlock({ r }: { r: Recommend }) {
  const { split } = r;
  const r2 = split.validation?.counties_weighted?.r;
  const assumptions = [...new Set(r.scenarios.map((s) => s.assumption).filter((x): x is string => Boolean(x)))];
  return (
    <div className="mb-3">
      {r.screening && (
        <div className="text-[12.5px] text-white/75">
          {fmt(r.screening.rate, "%")} attendance · {r.screening.missing_per_year > 0
            ? <b>{fmt(r.screening.missing_per_year)} people/yr</b> : "no one"} short of {fmt(r.screening.target, "%")}
        </div>
      )}
      {split.composition_gap != null && split.other_gap != null && (
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="bg-sky-400/70" style={{ width: `${(100 * Math.abs(split.composition_gap)) / (Math.abs(split.composition_gap) + Math.abs(split.other_gap) || 1)}%` }} />
              <div className="bg-rose-400/70 flex-1" />
            </div>
            <div className="text-[11px] text-white/50 mt-1">
              population explains {fmt(Math.abs(split.composition_gap))} pts · not explained {fmt(Math.abs(split.other_gap))} pts
              — {DRIVER[split.driver]}
            </div>
            {split.assumption && <Assumption text={split.assumption} />}
          </div>
          <SimPill text={split.note} />
        </div>
      )}
      {r.survival?.below_national && (
        <div className="text-[11.5px] text-white/60 mt-1">
          <span className="pill text-amber-300 border-amber-300/40 mr-1">Goal 3</span>
          5-yr survival {fmt(r.survival.value, "%")} vs Finland {fmt(r.survival.national, "%")}
        </div>
      )}
      <div className="mt-1.5 space-y-0.5">
        {r.scenarios.map((s) => <Scenario key={s.scenario} s={s} />)}
      </div>
      {r.pathway_actions.length > 0 && (
        <div className="mt-1.5 border-t border-white/10 pt-1.5">
          {r.pathway_actions.map((a) => (
            <div key={a.id} className="px-2.5 py-1">
              <div className="flex items-baseline gap-2">
                <Cite a={a} />
                <span className="text-[11.5px] text-white/60 leading-tight">{a.title.slice(0, 90)}</span>
              </div>
              {a.why && <div className="text-[10.5px] text-white/40 mt-0.5">{a.why}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-white/35 px-2.5 mt-1">
        {assumptions.length > 0 && <span className="text-violet-300/80">ASSUMPTION badges mark judgement calls. </span>}
        {r2 != null && <>simulated split validated vs 2024 county rates (r = {r2})</>}
      </div>
    </div>
  );
}
