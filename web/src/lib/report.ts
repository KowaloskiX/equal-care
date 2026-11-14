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
  items: ReportItem[]; model: string; model_note?: string | null; latency_s?: number; cached?: boolean;
  usage?: { prompt_token_count?: number | null; candidates_token_count?: number | null;
            thoughts_token_count?: number | null; total_token_count?: number | null } | null;
  notes?: string[];
};

export type Cover = { image: string | null; model: string | null; error?: string; latency_s?: number };

/** "breast:90,bowel:07:own_language+sms_reminder" -> items */
export function parseItems(spec: string | null): ReportItem[] {
  return (spec ?? "").split(",").map((p) => p.trim().split(":")).filter((b) => b.length >= 2 && b[0] && b[1])
    .map(([prog, code, sc]) => ({ prog, code, scenarios: sc ? sc.split(/[+\s]+/).filter(Boolean) : [] }));
}

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

export const postReport = (items: ReportItem[], base = "") =>
  fetch(`${base}/api/report`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items, image: false }),
  }).then((r) => asJson<ReportResponse>(r));

export const getCover = (base = "") => fetch(`${base}/api/report/cover`).then((r) => asJson<Cover>(r));

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
