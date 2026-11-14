// Client for the FastAPI backend (app/server.py, `make app`, port 8010). Every number arrives with its source.
import type { Geometry } from "geojson";

// same-origin by default: next.config.ts proxies /api/* to the FastAPI server, so the app also works behind a proxy
export const API = process.env.NEXT_PUBLIC_API ?? "";

export type Source = { indicator: number | null; title: string; url: string; year: number | null; org: string;
  updated: string | null; cube_url?: string; period?: string };
export type Indicator = {
  key: string; sotkanet_id: number | null; label: string; short?: string | null; stage: string; goal: number | null; unit: string;
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
  programme?: string; engine?: string; year?: number; raw_national?: number; real_national?: number;
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
export type ActionRef = { id: string; title: string; title_en?: string | null; page: number; url: string;
  responsible: string | null; metric: string | null;
  score?: number | null; confidence?: number | null; matched_by?: string | null; partial_match?: boolean | null };
export type ScenarioRow = {
  scenario: string; label: string; short?: string; delta_points: number | null; extra_people_per_year: number | null;
  share_of_missing?: number | null; actions: ActionRef[]; assumption: string | null; note: string;
};
export type PathwayAction = ActionRef & { why?: string; assumption?: string | null;
  stage?: string | null; small_numbers?: string | null };
export type Recommend = {
  programme: string; code: string; name: string;
  screening: { rate: number; target: number; missing_per_year: number; invited: number; source: Source } | null;
  split: { composition_gap: number | null; other_gap: number | null;
    total_gap: number | null; comp_pts: number | null; other_pts: number | null; total_pts: number | null;
    composition_gap_90?: [number, number] | null; expected?: number | null; real?: number | null;
    national_real?: number | null; r2?: number | null; r2_pct?: number | null; n_municipalities?: number | null;
    method?: string | null; source?: unknown;
    driver: "services" | "population" | "national" | "on_target";
    headline?: "mostly_population" | "mostly_unexplained" | "both" | null;
    assumption: string | null; note: string; validation?: Validation | null };
  sim_split?: { composition_gap: number | null; other_gap: number | null; expected?: number | null;
    real?: number | null; total_gap: number | null; note: string; validation: Validation | null };
  scenarios: ScenarioRow[];
  pathway_actions: PathwayAction[];
  survival: { key: string; value: number; national: number; delta: number; below_national: boolean; year: number; source: Source } | null;
};
export type BriefCounty = {
  code: string; name: string; screening: Recommend["screening"]; split: Recommend["split"];
  top_scenario: ScenarioRow | null; survival: Recommend["survival"];
};
export type Brief = { programmes: { programme: string; validation: Validation | null; national: number | null;
  target: number | null; counties: BriefCounty[]; note: string }[] };
export type WhatIf = {
  programme: string; engine: string; code: string; name: string; scenarios_selected: string[];
  baseline_rate: number | null; new_rate: number | null; delta_points: number | null;
  extra_people_per_year: number | null; invited: number | null; missing_per_year: number | null;
  gap_closed_pct: number | null; asked_live: number; from_cache: number;
  validation: Validation | null; note: string;
  scenarios: { scenario: string; label: string; actions: ActionRef[]; assumption: string | null }[];
  other_engine?: { engine: string; new_rate: number | null; extra_people_per_year: number | null;
                   gap_closed_pct: number | null } | null;
  source: Source | null;
};
export type ResidentRow = {
  key: Record<string, string>; people: number;
  jev_attend: number; jev_attend_before?: number;
  p_cal?: number; p_cal_before?: number;
  munis?: [string, number][]; dots?: [string, number][];
  reason: string | null; reason_label: string | null; reason_short: string | null;
  reasons: Record<string, number>; borrowed: boolean; answer_key: string[];
  file: string; line: number | null;
  cum_people: number; cum_rate: number; cum_reasons?: Record<string, number>;
};
export type Replay = {
  programme: string; code: string; name: string; engine: string;
  mode: "baseline" | "scenario"; scenarios_selected: string[];
  files: { path: string; answers: number }[];
  asked_live: number; people_total: number; per_dot?: number; rows: ResidentRow[];
  final: { rate: number | null; real: number | null; national_real: number | null;
           target: number | null; baseline_rate?: number | null; groups?: SkipGroup[] };
  anchor: { logit_shift: number; real_national: number | null };
  validation: Validation | null; note: string; source: Source | null;
  reason_labels: Record<string, string>; reason_shorts: Record<string, string>;
  whatif?: WhatIf;
};
// top skipper groups in a baseline replay: language group x activity, ranked by expected non-attenders
export type SkipGroup = {
  lang_group: string; activity: string; expected_skip: number; rate: number;
  main_barrier: string | null; main_barrier_label: string | null; main_barrier_short: string | null;
  barrier_share: number | null;
};
export type ResidentAnswer = {
  state: unknown; questions: unknown; answer: Record<string, unknown>; file: string; line: number;
};
// monthly queue series for the step-4 time-lapse (periods are YYYYMM ints; missing stays missing)
export type Timeline = {
  key: string; label: string; unit: string; level: string; periods: number[];
  higher_is_better: boolean | null;
  national: Record<string, number>;
  values: Record<string, Record<string, { value: number; abs_value: number | null; shared: string | null }>>;
  source: Source;
};
// the analyst drawer: Claude's grounded answer + which backend tools produced it
export type AskResponse = {
  text: string; unverified: number[];
  tools: { name: string; args: Record<string, unknown> }[];
  focus: { prog: string; code: string } | null;
  run: { prog: string; code: string; scenarios: string[] } | null;
  model: string; usage: { input_tokens: number; output_tokens: number };
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
export const getBrief = (prog?: string, n = 3) =>
  get<Brief>(`/api/brief?${prog ? `prog=${prog}&` : ""}n=${n}`);
export const getWhatif = (prog: string, code: string, s: string[]) =>
  get<WhatIf>(`/api/whatif?prog=${prog}&code=${code}&s=${s.join(",")}`);
export const getResidents = (prog: string, code: string, s?: string[]) =>
  get<Replay>(`/api/residents/${prog}/${code}${s?.length ? `?s=${s.join(",")}` : ""}`);

// Baseline replay is pure cache content — the same payload backs step 2 and step 3 (dot positions
// must be identical when the scenario recolours them), so it is fetched once per prog:code.
const BASELINE_REPLAY = new Map<string, Promise<Replay>>();
export const getBaselineReplay = (prog: string, code: string) => {
  const k = `${prog}:${code}`;
  let p = BASELINE_REPLAY.get(k);
  if (!p) { p = getResidents(prog, code); BASELINE_REPLAY.set(k, p); }
  return p;
};
export const getResidentAnswer = (prog: string, key: string[], s?: string[]) =>
  get<ResidentAnswer>(`/api/residents/${prog}/answer?key=${encodeURIComponent(JSON.stringify(key))}${s?.length ? `&s=${s.join(",")}` : ""}`);
export const getCorrelation = (a: string, b: string, level = "county") =>
  get<Correlation>(`/api/correlation?a=${a}&b=${b}&level=${level}`);
export const getTimeline = (key: string) => get<Timeline>(`/api/timeline?key=${encodeURIComponent(key)}`);
export const askAnalyst = async (question: string, prog?: string | null, code?: string | null): Promise<AskResponse> => {
  const r = await fetch(`${API}/api/ask`, { method: "POST", headers: { "content-type": "application/json" },
                                           body: JSON.stringify({ question, prog, code }) });
  if (!r.ok) {
    let d = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.detail) d = String(j.detail); } catch { /* keep the status */ }
    throw new Error(d);
  }
  return r.json();
};

export const engineName = (e?: string | null) =>
  e === "jev" ? "Jev" : e === "gemini-decision-1" ? "Gemini Decisions" : null;

export const fmt = (v: number | null | undefined, unit = "") => {
  if (v == null) return "–";
  const s = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US").replace(/,/g, " ") : (Math.round(v * 10) / 10).toString();
  return unit === "%" ? `${s} %` : s;
};
