"use client";
// "Why and what to do": one programme's recommendation for a county in three labelled layers —
// DATA (public statistics), SIMULATION (residents model), ROADMAP (numbered national actions).
import { engineName, fmt, type ActionRef, type Recommend, type ScenarioRow, type Source } from "@/lib/api";

export const DRIVER_BADGE: Record<string, string> = {
  services: "Problem: the service",
  population: "Problem: who lives here",
  national: "Same as all of Finland",
  on_target: "On target",
};

// Who the screening programme invites — breast/cervix are women-only programmes.
export const people = (prog: string) => (prog === "bowel" ? "people" : "women");

export function DataChip({ s }: { s?: Source | null }) {
  const org = s?.org?.includes("/") ? s.org.split("/")[1].trim() : s?.org;
  return (
    <span className="pill text-white/60 border-white/20">
      DATA{org || s?.year ? <span className="text-white/35"> · {[org, s?.period ?? s?.year].filter(Boolean).join(" ")}</span> : null}
    </span>
  );
}

export function SimChip({ eng }: { eng?: string | null }) {
  return <span className="pill text-sky-300 border-sky-300/40">SIMULATION{eng ? <span className="text-sky-300/60"> · {eng}</span> : null}</span>;
}

export function RoadmapChip() {
  return <span className="pill text-amber-300 border-amber-300/40">ROADMAP</span>;
}

// Kept for existing callers (map sim-mode label etc.).
export function SimPill({ text = "Simulation" }: { text?: string }) {
  return <span className="pill text-sky-300 border-sky-300/40">{text}</span>;
}

export const splitEngine = (split: Recommend["split"] | undefined | null) =>
  engineName(split?.validation?.engine) ?? engineName(split?.note?.replace("Simulation · ", ""));

export function Cite({ a }: { a: ActionRef }) {
  return (
    <a href={a.url} target="_blank" rel="noreferrer" title={a.title}
       className="text-amber-300/90 hover:text-amber-300 underline decoration-dotted whitespace-nowrap">
      Roadmap {a.id}, p.{a.page}
    </a>
  );
}

export function Assumption({ text }: { text: string }) {
  return (
    <details className="mt-0.5">
      <summary className="inline-block pill text-violet-300 border-violet-300/40 cursor-pointer select-none">ASSUMPTION</summary>
      <p className="text-[11px] text-white/50 mt-1">{text}</p>
    </details>
  );
}

export function SplitBar({ split }: { split: Recommend["split"] }) {
  const comp = Math.abs(split.composition_gap ?? 0), other = Math.abs(split.other_gap ?? 0), tot = comp + other;
  return (
    <div className="mt-1">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="bg-sky-400/70" style={{ width: `${tot ? (100 * comp) / tot : 0}%` }} />
        <div className="bg-rose-400/70 flex-1" />
      </div>
      <div className="flex gap-3 text-[10px] text-white/40 mt-0.5">
        <span><span className="inline-block w-2 h-2 rounded-sm bg-sky-400/70 mr-1 align-middle" />who lives here</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-rose-400/70 mr-1 align-middle" />the service</span>
      </div>
    </div>
  );
}

export function splitSentence(split: Recommend["split"], target: string): string {
  const comp = split.comp_pts ?? "–", other = split.other_pts ?? "–", total = split.total_pts ?? "–";
  switch (split.driver) {
    case "services":
      return `Who lives here explains only ${comp} of the ${total} points behind Finland. The other ${other} points point to how screening is organised: access, appointment times, private screening not counted.`;
    case "population":
      return `Most of the ${total}-point gap is explained by who lives here (age, language, work). Reach the groups that miss out.`;
    case "national":
      return `The county is at the Finnish level; the whole country is below ${target}, so the lever is national.`;
    default:
      return `The county reaches the ${target} target.`;
  }
}

export function driverSentence(r: Recommend): string {
  return splitSentence(r.split, fmt(r.screening?.target ?? 80, "%"));
}

function Scenario({ s, who }: { s: ScenarioRow; who: string }) {
  return (
    <div className="rounded-lg px-1 py-1">
      <div className="text-[12px] text-white/80 leading-tight">
        {s.label} → {s.extra_people_per_year != null && s.extra_people_per_year > 0
          ? <b className="text-emerald-300">+{fmt(s.extra_people_per_year)} {who}/yr</b>
          : <span className="text-white/40">no effect</span>}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center mt-0.5">
        {s.actions.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1">
            <a href={a.url} target="_blank" rel="noreferrer" title={a.title}
               className="text-amber-300/90 hover:text-amber-300 underline decoration-dotted text-[11px]">
              {a.id}, p.{a.page}: {a.title_en ?? a.title}
            </a>
          </span>
        ))}
      </div>
      {s.assumption && <Assumption text={s.assumption} />}
    </div>
  );
}

export default function RecommendBlock({ r }: { r: Recommend }) {
  const { split } = r;
  const r2 = split.validation?.counties_weighted?.r;
  const who = people(r.programme);
  const assumptions = [...new Set([...r.scenarios.map((s) => s.assumption), ...r.pathway_actions.map((a) => a.assumption)]
    .filter((x): x is string => Boolean(x)))];
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="pill text-white/80 border-white/25">{DRIVER_BADGE[split.driver] ?? split.driver}</span>
      </div>
      {r.screening && (
        <div className="mt-1.5">
          <DataChip s={r.screening.source} />
          <p className="text-[12px] text-white/75 mt-1 leading-relaxed">
            {fmt(r.screening.rate, "%")} of invited {who} attend.
            {r.screening.missing_per_year > 0
              ? <> About <b className="text-rose-300">{fmt(r.screening.missing_per_year)} {who}</b> a year are missing (target {fmt(r.screening.target, "%")}).</>
              : <> The county reaches the {fmt(r.screening.target, "%")} target.</>}
          </p>
        </div>
      )}
      {r.survival?.below_national && (
        <p className="text-[11.5px] text-white/60 mt-1">
          <span className="pill text-amber-300 border-amber-300/40 mr-1">Goal 3</span>
          5-year survival {fmt(r.survival.value, "%")} (Finland {fmt(r.survival.national, "%")})
        </p>
      )}
      {(split.composition_gap != null || split.driver === "national") && (
        <div className="mt-2">
          <SimChip eng={splitEngine(split)} />
          <p className="text-[12px] text-white/70 mt-1 leading-relaxed">{driverSentence(r)}</p>
          {split.composition_gap != null && split.other_gap != null && <SplitBar split={split} />}
          {split.assumption && <Assumption text={split.assumption} />}
        </div>
      )}
      <div className="mt-2">
        <RoadmapChip />
        <div className="mt-1 space-y-0.5">
          {r.scenarios.map((s) => <Scenario key={s.scenario} s={s} who={who} />)}
        </div>
      </div>
      {r.pathway_actions.length > 0 && (
        <div className="mt-1.5 border-t border-white/10 pt-1.5">
          <div className="text-[10.5px] uppercase tracking-wide text-white/35 mb-0.5">Also on the pathway</div>
          {r.pathway_actions.map((a) => (
            <div key={a.id} className="px-1 py-1">
              {a.why && <div className="text-[11.5px] text-white/60 leading-snug">{a.why}</div>}
              <div className="mt-0.5">
                <a href={a.url} target="_blank" rel="noreferrer" title={a.title}
                   className="text-amber-300/90 hover:text-amber-300 underline decoration-dotted text-[11px]">
                  Roadmap {a.id}, p.{a.page}: {a.title_en ?? a.title}
                </a>
              </div>
              {a.assumption && <Assumption text={a.assumption} />}
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-white/35 px-1 mt-1">
        {assumptions.length > 0 && <span className="text-violet-300/80">ASSUMPTION badges mark judgement calls. </span>}
        {r2 != null && <>simulation checked against real 2024 county rates (r = {r2})</>}
      </div>
    </div>
  );
}
