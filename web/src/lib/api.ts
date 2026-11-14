// Client for the FastAPI backend (app/server.py, `make app`, port 8010). Every number arrives with its source.
export const API = process.env.NEXT_PUBLIC_API ?? "http://localhost:8010";

export type Source = { indicator: number; title: string; url: string; year: number | null; org: string; updated: string };
export type Indicator = {
  key: string; sotkanet_id: number; label: string; stage: string; goal: number | null; unit: string;
  higher_is_better: boolean | null; target: number | null; target_note: string | null; url: string; latest_year: number | null;
  title_en: string; description: string | null; updated: string;
};
export type Meta = { stages: string[]; goals: Record<string, string>; indicators: Indicator[] };
export type Values = {
  key: string; label: string; unit: string; level: string; year: number; higher_is_better: boolean | null;
  target: number | null; target_note: string | null; national: number | null;
  values: Record<string, { name: string; value: number; abs_value: number | null }>; source: Source;
};
export type PathwayItem = {
  key: string; label: string; stage: string; goal: number | null; unit: string; value: number; national: number | null;
  delta: number | null; worse_than_national: boolean | null; rank: number | null; of: number; target: number | null;
  year: number; source: Source;
};
export type Pathway = { code: string; name: string; indicators: PathwayItem[] };
export type Gap = {
  key: string; code: string; name: string; year: number; rate: number; target: number; attended: number; invited: number;
  missing_per_year: number; method: string; source: Source;
};
export type Feature = { type: "Feature"; properties: { code: string; name: string }; geometry: any };
export type FC = { type: "FeatureCollection"; features: Feature[] };

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

export const fmt = (v: number | null | undefined, unit = "") => {
  if (v == null) return "–";
  const s = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US").replace(/,/g, " ") : (Math.round(v * 10) / 10).toString();
  return unit === "%" ? `${s} %` : s;
};
