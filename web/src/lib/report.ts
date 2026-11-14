// Client for the generated briefing (app/report_api.py, src/report.py). Every number in a report arrives rendered
// by the backend from its FACTS; the UI never formats or computes one itself.
import { API } from "@/lib/api";

export type Kind = "DATA" | "MODEL" | "SIMULATION" | "ROADMAP";

export type FactSource = {
  title?: string; org?: string; url?: string; year?: number | string; period?: string; indicator?: number;
  updated?: string; page?: number; method?: string; note?: string;
};

export type Fact = {
  value: number | string; unit: string; kind: Kind; label: string; source: FactSource | null;
  title?: string; url?: string; actions?: string[]; assumption?: string;
};

export type Slide = {
  kind: "title" | "where" | "why" | "who" | "what" | "pathway" | "limits" | "next";
  headline: string; bullets: string[]; speaker_notes: string; fact_refs: string[]; evidence?: Kind[];
};

export type ReportAction = { key: string; id: string; page: number | null; title?: string | null; url?: string | null };
export type ReportRec = { text: string; action_ref: string; action?: ReportAction | null };

export type ReportDoc = {
  title: string; subtitle: string; executive_summary: string; slides: Slide[]; recommendations: ReportRec[];
};

export type ReportFlag = { path: string; issue: string; text?: string };

export type ReportItem = { prog: string; code: string; scenarios?: string[] };

export type ReportResponse = {
  id: string; report: ReportDoc; raw: ReportDoc; facts: Record<string, Fact | string[]>; flags: ReportFlag[];
  items: ReportItem[]; visuals?: Record<string, ItemVisuals>; image?: Cover;
  model: string; model_note?: string | null; latency_s?: number; cached?: boolean;
  usage?: { prompt_token_count?: number | null; candidates_token_count?: number | null;
            thoughts_token_count?: number | null; total_token_count?: number | null } | null;
  notes?: string[];
};

// ---- fixed slide visuals (built by the backend from FACTS sources; never seen by the model)
export type VGeo = { type: string; coordinates: number[][][] | number[][][][] };
export type VFeature = { code: string; name: string; geometry: VGeo };
export type VAction = { id: string; title_en?: string | null; page?: number | null;
                        score?: number | null; confidence?: number | null;
                        partial_match?: boolean | null; matched_by?: string | null };
export type VRank = { code: string; name: string; rate: number; missing_per_year?: number | null };
export type VGroup = { lang_group: string; activity: string; expected_skip: number; rate: number;
                       main_barrier_short?: string | null; barrier_share?: number | null };
export type VCombo = { scenarios: string[]; label: string; actions: VAction[];
                       main?: { engine?: string; extra_people_per_year?: number | null;
                                gap_closed_pct?: number | null; new_rate?: number | null } | null;
                       other?: { engine?: string; extra_people_per_year?: number | null;
                                 gap_closed_pct?: number | null } | null;
                       note?: string };
export type VNode = { id: string; status: "worse" | "better" | "close" | "gap" | string;
                      value?: number | null; national?: number | null; unit?: string | null;
                      abs_value?: number | null; small_n?: boolean };
export type VQueue = { key?: string; label?: string; unit?: string; periods?: number[];
                       county?: Record<string, number | null>; finland?: Record<string, number>;
                       source?: FactSource | null };
export type ItemVisuals = {
  prog?: string; code?: string; error?: string;
  where?: { county?: { code: string; name: string; rate?: number | null; missing_per_year?: number | null };
            ranking?: VRank[]; target?: number | null; national?: number | null; unit?: string;
            map?: { highlight?: string; features?: VFeature[] }; source?: FactSource | null; error?: string };
  why?: { real?: number | null; expected?: number | null; composition_gap?: number | null;
          composition_gap_90?: [number, number] | null; unexplained_gap?: number | null;
          total_gap?: number | null; national_real?: number | null; r2_pct?: number | null;
          n_municipalities?: number | null; method?: string; source?: unknown; error?: string };
  who?: { groups?: VGroup[]; barriers?: Record<string, number>; barrier_labels?: Record<string, string>;
          simulated_rate?: number | null; real_rate?: number | null; expected_skip_per_100?: number | null;
          people_total?: number; per_dot?: number; engine?: string; note?: string;
          source?: FactSource | null; error?: string };
  what?: { missing_per_year?: number | null; combos?: VCombo[]; source?: unknown; error?: string };
  pathway?: { nodes?: VNode[]; queue?: VQueue | null; source?: FactSource | null; error?: string };
  limits?: string[];
  next?: { scenario?: string | null; label?: string | null; actions?: VAction[]; steps?: string[] };
};

export type Cover = { image: string | null; model: string | null; error?: string; latency_s?: number };

/** "breast:90,bowel:07:own_language+sms_reminder" -> items */
export function parseItems(spec: string | null): ReportItem[] {
  return (spec ?? "").split(",").map((p) => p.trim().split(":")).filter((b) => b.length >= 2 && b[0] && b[1])
    .map(([prog, code, sc]) => ({ prog, code, scenarios: sc ? sc.split(/[+\s]+/).filter(Boolean) : [] }));
}

/** item -> "breast:90:own_language+sms_reminder" (the stable identity used for picker checkboxes) */
export const itemSpec = (it: ReportItem) =>
  `${it.prog}:${it.code}${it.scenarios?.length ? ":" + it.scenarios.join("+") : ""}`;

/** County list for the picker's add-select (names come from the data API; codes are shared by both programmes). */
export const getCounties = (base = "") =>
  fetch(`${base}/api/values?key=screen_breast&level=county`)
    .then((r) => asJson<{ values: Record<string, { name: string }> }>(r))
    .then((v) => Object.entries(v.values).map(([code, x]) => ({ code, name: x.name }))
                 .sort((a, b) => a.name.localeCompare(b.name, "fi")));

/** API base: ?api= override (dev API on another port), then NEXT_PUBLIC_REPORT_API, then the app's API setting. */
export function apiBase(override?: string | null) {
  return (override || process.env.NEXT_PUBLIC_REPORT_API || API || "").replace(/\/$/, "");
}

async function asJson<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let d = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.detail) d = `${r.status}: ${String(j.detail)}`; } catch { /* keep status */ }
    throw new Error(d);
  }
  return r.json();
}

export const postReport = (items: ReportItem[], base = "", image = false) =>
  fetch(`${base}/api/report`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items, image }),
  }).then((r) => asJson<ReportResponse>(r));

export const getCover = (base = "", scene?: string) =>
  fetch(`${base}/api/report/cover${scene ? `?scene=${scene}` : ""}`).then((r) => asJson<Cover>(r));

/** Which item's visuals a slide belongs to: the item whose FACTS prefix the slide cites, else the first item. */
export function visualFor(data: ReportResponse, s: Slide): ItemVisuals | null {
  const vis = data.visuals;
  if (!vis) return null;
  const prefixes = Object.keys(vis);
  const hit = (s.fact_refs ?? []).map((k) => prefixes.find((p) => k.startsWith(`${p}_`))).find(Boolean);
  if (hit) return vis[hit] ?? null;
  const it = data.items?.[0];
  return vis[it ? `c${it.code}_${it.prog}` : ""] ?? vis[prefixes[0]] ?? null;
}

export const factsOnly = (facts: ReportResponse["facts"]) =>
  Object.fromEntries(Object.entries(facts).filter(([k, v]) => k !== "limitations" && !Array.isArray(v))) as Record<string, Fact>;

export const limitations = (facts: ReportResponse["facts"]) =>
  (Array.isArray(facts.limitations) ? facts.limitations : []) as string[];

export const KIND_TAG: Record<Kind, "data" | "note" | "sim" | "roadmap"> = {
  DATA: "data", MODEL: "note", SIMULATION: "sim", ROADMAP: "roadmap",
};
export const KIND_WORDS: Record<Kind, string> = {
  DATA: "public data", MODEL: "statistical model", SIMULATION: "simulation", ROADMAP: "national roadmap",
};

/** Unique sources behind the facts, with which evidence kinds and how many facts rely on each. */
export function sourcesOf(facts: Record<string, Fact>) {
  const m = new Map<string, { s: FactSource; kinds: Set<Kind>; n: number }>();
  for (const f of Object.values(facts)) {
    if (!f.source) continue;
    const s = f.source;
    const key = [s.title, s.url, s.period ?? s.year ?? "", f.kind === "ROADMAP" ? "" : s.note ?? ""].join("|");
    const e = m.get(key) ?? { s, kinds: new Set<Kind>(), n: 0 };
    e.kinds.add(f.kind); e.n += 1; m.set(key, e);
  }
  // roadmap pages collapse into one document entry with the page list
  const out: { s: FactSource; kinds: Kind[]; n: number; pages?: number[] }[] = [];
  const road = new Map<string, { s: FactSource; kinds: Kind[]; n: number; pages: number[] }>();
  for (const e of m.values()) {
    if (e.kinds.has("ROADMAP") && e.s.page != null) {
      const k = e.s.title ?? "roadmap";
      const r = road.get(k) ?? { s: { ...e.s, url: e.s.url?.split("#")[0] }, kinds: ["ROADMAP"], n: 0, pages: [] };
      r.n += e.n; if (!r.pages.includes(e.s.page)) r.pages.push(e.s.page);
      road.set(k, r);
    } else out.push({ s: e.s, kinds: [...e.kinds], n: e.n });
  }
  for (const r of road.values()) { r.pages.sort((a, b) => a - b); out.push(r); }
  const order: Kind[] = ["DATA", "MODEL", "SIMULATION", "ROADMAP"];
  return out.sort((a, b) => order.indexOf(a.kinds[0]) - order.indexOf(b.kinds[0]));
}
