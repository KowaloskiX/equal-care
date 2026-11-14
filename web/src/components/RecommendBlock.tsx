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
export const DRIVER_HEADLINE: Record<string, string> = {
  services: "Mostly the service, not the residents",
  population: "Mostly who lives here",
  national: "Same as all of Finland — a national issue",
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

// Step 2 chart, shared by the brief and the county card: the county's gap to Finland in points,
// split into what the population explains and what it does not.
export function GapSplitBar({ split }: { split: Recommend["split"] }) {
  const comp = Math.abs(split.composition_gap ?? 0), other = Math.abs(split.other_gap ?? 0);
  const tot = comp + other;
  return (
    <div className="mt-1.5">
      <div className="flex h-6 overflow-hidden rounded-md bg-white/5 border border-white/10">
        <div className="bg-sky-400/60 h-full flex items-center justify-end pr-1 overflow-hidden whitespace-nowrap"
             style={{ width: `${tot ? (100 * comp) / tot : 0}%` }}>
          {tot && comp / tot > 0.14 ? <span className="text-[9.5px] text-sky-950 font-semibold">{split.comp_pts} pts</span> : null}
        </div>
        <div className="bg-rose-400/70 h-full flex items-center pl-1.5 overflow-hidden whitespace-nowrap flex-1">
          <span className="text-[9.5px] text-rose-950 font-semibold">{split.other_pts} pts</span>
        </div>
      </div>
      <div className="flex gap-3 text-[10.5px] text-white/55 mt-1">
        <span><span className="inline-block w-2 h-2 rounded-sm bg-sky-400/70 mr-1 align-middle" />who lives here · {split.comp_pts} pts</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-rose-400/70 mr-1 align-middle" />the service · {split.other_pts} pts</span>
      </div>
    </div>
  );
}

// Step 3 chart, shared by the brief and the county card: the "gap to close" track is the county's
// missing_per_year; each scenario bar shows what share of it the scenario could close (API-computed).
export function GapCloseBars({ scenarios, missing, who, combined }: {
  scenarios: ScenarioRow[]; missing: number | null | undefined; who: string;
  combined?: { extra: number | null; pct: number | null; segs: number[] } | null;
}) {
  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between text-[10.5px] text-white/45 mb-1">
        <span>gap to close</span>
        <span>{missing != null ? <>{fmt(missing)} {who} missing a year</> : "on target"}</span>
      </div>
      <div className="space-y-1">
        {scenarios.map((s) => {
          const share = s.share_of_missing ?? 0;
          return (
            <div key={s.scenario} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] text-white/65 truncate" title={s.label}>{s.short ?? s.label}</span>
              <div className="flex-1 h-3.5 rounded bg-white/5 overflow-hidden">
                <div className="h-full bg-emerald-400/50 rounded-r" style={{ width: `${Math.min(100, share)}%` }} />
              </div>
              <span className="w-28 shrink-0 text-right text-[10.5px] tabular-nums text-emerald-300">
                {s.extra_people_per_year != null && s.extra_people_per_year > 0
                  ? <>+{fmt(s.extra_people_per_year)} / yr · {share} %</> : "–"}
              </span>
              <span className="w-24 shrink-0 text-right">
                {s.actions.slice(0, 1).map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                     title={s.actions.map((x) => `${x.id} p.${x.page}: ${x.title_en ?? x.title}`).join("\n")}
                     onClick={(e) => e.stopPropagation()}
                     className="text-amber-300/90 hover:text-amber-300 underline decoration-dotted text-[10px] whitespace-nowrap">
                    {a.id} p.{a.page}{s.actions.length > 1 && ` +${s.actions.length - 1}`}
                  </a>
                ))}
              </span>
            </div>
          );
        })}
        {combined && combined.pct != null && (
          <div className="flex items-center gap-2 pt-1 border-t border-white/10">
            <span className="w-24 shrink-0 text-[11px] text-emerald-300/90 truncate">combined</span>
            <div className="flex-1 h-3.5 rounded bg-white/5 overflow-hidden flex">
              {combined.segs.map((w, i) => (
                <div key={i} className={`h-full ${i % 2 ? "bg-emerald-300/60" : "bg-emerald-400/70"}`}
                     style={{ width: `${Math.min(100, w)}%` }} />
              ))}
            </div>
            <span className="w-28 shrink-0 text-right text-[10.5px] tabular-nums text-emerald-300 font-semibold">
              +{fmt(combined.extra)} / yr · {combined.pct} %
            </span>
            <span className="w-24 shrink-0" />
          </div>
        )}
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

export default function RecommendBlock({ r }: { r: Recommend }) {
  const { split } = r;
  const r2 = split.validation?.counties_weighted?.r;
  const who = people(r.programme);
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="pill text-white/80 border-white/25">{DRIVER_HEADLINE[split.driver] ?? split.driver}</span>
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
      <div className="mt-2">
        <SimChip eng={splitEngine(split)} />
        {split.driver === "national" ? (
          <p className="text-[12px] text-white/70 mt-1 leading-relaxed">
            The county is at Finland&apos;s level; the gap to {fmt(r.screening?.target ?? 80, "%")} is national.
          </p>
        ) : (
          <>
            {split.composition_gap != null && split.other_gap != null && <GapSplitBar split={split} />}
            <p className="text-[10.5px] text-white/45 mt-1">
              Population explains {split.comp_pts ?? "–"} of {split.total_pts ?? "–"} points (simulated residents
              {r2 != null && <>, r = {r2} vs real 2024 county rates</>}).
            </p>
          </>
        )}
        {split.assumption && <Assumption text={split.assumption} />}
      </div>
      <div className="mt-2">
        <RoadmapChip />
        <GapCloseBars scenarios={r.scenarios} missing={r.screening?.missing_per_year} who={who} />
      </div>
      {r.pathway_actions.length > 0 && (
        <details className="mt-1.5 border-t border-white/10 pt-1.5">
          <summary className="text-[11px] text-white/45 cursor-pointer select-none hover:text-white/70">More actions on the pathway</summary>
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
        </details>
      )}
      <div className="text-[10px] text-white/35 px-1 mt-1">ASSUMPTION badges mark judgement calls. Simulated estimates, not forecasts.</div>
    </div>
  );
}
