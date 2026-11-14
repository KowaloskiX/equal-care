// Client for the FastAPI backend (app/server.py, `make app`, port 8010). Every number arrives with its source.
import type { Geometry } from "geojson";

export const API = process.env.NEXT_PUBLIC_API ?? "http://localhost:8010";

export type Source = { indicator: number | null; title: string; url: string; year: number | null; org: string;
  updated: string | null; cube_url?: string; period?: string };
export type Indicator = {
  key: string; sotkanet_id: number | null; label: string; stage: string; goal: number | null; unit: string;
  higher_is_better: boolean | null; target: number | null; target_note: string | null; url: string; latest_year: number | null;
  title_en: string; description: string | null; updated: string;
};
export type Meta = { stages: string[]; goals: Record<string, string>; indicators: Indicator[] };
export type Values = {
  key: string; label: string; unit: string; level: string; year: number; higher_is_better: boolean | null;
  target: number | null; target_note: string | null; national: number | null;
  values: Record<string, { name: string; value: number; abs_value: number | null; shared_producer?: string | null }>; source: Source;
};
export type Correlation = {
  a: string; b: string; level: string; year: number; n: number; r: number; sources: Source[];
};
export type PathwayItem = {
  key: string; label: string; stage: string; goal: number | null; unit: string; value: number; national: number | null;
  delta: number | null; worse_than_national: boolean | null; rank: number | null; of: number; target: number | null;
  year: number; source: Source;
  abs_value?: number | null; abs_is_denominator?: boolean; shared_producer?: string | null;
  trend?: [number, number][]; rising_months?: number;
};
export type Pathway = { code: string; name: string; indicators: PathwayItem[] };
export type Gap = {
  key: string; code: string; name: string; year: number; rate: number; target: number; attended: number; invited: number;
  missing_per_year: number; method: string; source: Source;
};
export type Feature = { type: "Feature"; properties: { code: string; name: string }; geometry: Geometry };
export type FC = { type: "FeatureCollection"; features: Feature[] };

export type Validation = {
  programme?: string; year?: number; raw_national?: number; real_national?: number;
  anchor_logit_shift?: number; municipalities?: { n: number; r: number; mae?: number };
  municipalities_300plus?: { n: number; r: number }; counties_weighted?: { n: number; r: number };
};
export type SimRow = {
  expected: number; composition_gap: number | null; other_gap: number | null;
  real?: number; attended?: number; invited?: number | null; reasons?: Record<string, number>;
};
export type SimLevel = {
  programme: string; engine?: string; label: string; level: string; year: number; national_real: number;
  national_expected: number; rows: Record<string, SimRow>; validation: Validation; note: string; source: Source;
};
export type ActionRef = { id: string; title: string; title_en?: string | null; page: number; url: string; responsible: string | null; metric: string | null };
export type ScenarioRow = {
  scenario: string; label: string; delta_points: number | null; extra_people_per_year: number | null;
  actions: ActionRef[]; assumption: string | null; note: string;
};
export type PathwayAction = ActionRef & { why?: string; assumption?: string | null };
export type Recommend = {
  programme: string; code: string; name: string;
  screening: { rate: number; target: number; missing_per_year: number; invited: number; source: Source } | null;
  split: { composition_gap: number | null; other_gap: number | null; driver: "services" | "population" | "national" | "on_target"; assumption: string | null; note: string; validation: Validation | null };
  scenarios: ScenarioRow[];
  pathway_actions: PathwayAction[];
  survival: { key: string; value: number; national: number; delta: number; below_national: boolean; year: number; source: Source } | null;
};
export type BriefCounty = {
  code: string; name: string; screening: Recommend["screening"]; split: Recommend["split"];
  top_scenario: ScenarioRow | null; survival: Recommend["survival"];
};
export type Brief = { programmes: { programme: string; validation: Validation | null; counties: BriefCounty[]; note: string }[] };
export type WhatIf = {
  programme: string; engine: string; code: string; name: string; scenarios_selected: string[];
  baseline_rate: number | null; new_rate: number | null; delta_points: number | null;
  extra_people_per_year: number | null; invited: number | null; missing_per_year: number | null;
  gap_closed_pct: number | null; asked_live: number; from_cache: number;
  validation: Validation | null; note: string;
  scenarios: { scenario: string; label: string; actions: ActionRef[]; assumption: string | null }[];
  source: Source | null;
};

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
  return r.json();
};

export const getMeta = () => get<Meta>("/api/meta");
export const getGeo = (level: "county" | "municipality") => get<FC>(`/api/geo/${level}`);
export const getValues = (key: string, level = "county", county?: string) =>
  get<Values>(`/api/values?key=${key}&level=${level}${county ? `&county=${county}` : ""}`);
export const getPathway = (code: string) => get<Pathway>(`/api/region/${code}`);
export const getGap = (key: string, code: string) => get<Gap>(`/api/gap?key=${key}&code=${code}`).catch(() => null);
export const getSim = (prog: string) => get<SimLevel>(`/api/sim/${prog}`);
export const getRecommend = (prog: string, code: string) => get<Recommend>(`/api/recommend/${prog}/${code}`);
export const getBrief = () => get<Brief>("/api/brief");
export const getWhatif = (prog: string, code: string, s: string[]) =>
  get<WhatIf>(`/api/whatif?prog=${prog}&code=${code}&s=${s.join(",")}`);
export const getCorrelation = (a: string, b: string, level = "county") =>
  get<Correlation>(`/api/correlation?a=${a}&b=${b}&level=${level}`);

export const engineName = (e?: string | null) =>
  e === "jev" ? "Jev" : e === "gemini-decision-1" ? "Gemini Decisions" : null;

export const fmt = (v: number | null | undefined, unit = "") => {
  if (v == null) return "–";
  const s = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US").replace(/,/g, " ") : (Math.round(v * 10) / 10).toString();
  return unit === "%" ? `${s} %` : s;
};
