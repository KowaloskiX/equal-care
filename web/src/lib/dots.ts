// Simulated residents as map dots: deterministic pseudo-random points inside municipality polygons.
// Positions are stable across baseline and scenario (same seeds), so the scenario run only recolours.
import type { FC, Feature, Replay, ResidentRow } from "./api";
import type { Position } from "geojson";

export type CrowdDot = { lon: number; lat: number; u: number; order: number; row: number; muni: string; tip: string };
export type Crowd = {
  prog: string; code: string;
  dots: CrowdDot[]; rows: ResidentRow[]; perDot: number; who: string; engine: string;
  pRow: number[];                       // current calibrated probability per replay row
  revealed: number;                     // baseline rows revealed (all during a scenario run)
  revealFrac: number;                   // 0..1 share of dots visible — rows run largest-first,
                                        // so revealing by row would pop most dots at once
  flip: Record<number, ResidentRow>;    // baseline row index -> scenario row once revealed
  scenarios: string[];                  // scenario names for the "what was asked" popover
};

const FNV = (s: string) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const rng = (seed: number) => () => {   // mulberry32 — deterministic positions per row+muni
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const u01 = (s: string) => FNV(s) / 4294967296;

export const rowKey = (r: ResidentRow) =>
  [r.key.sex, r.key.age5, r.key.settlement, r.key.lang, r.key.edu, r.key.activity, r.key.muni_type].join("|");

const rings = (f: Feature): Position[][][] =>
  f.geometry.type === "Polygon" ? [f.geometry.coordinates as Position[][]]
    : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates as Position[][][] : [];

const inRing = (x: number, y: number, ring: Position[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inPoly = (x: number, y: number, poly: Position[][]) =>
  inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h));

function sample(f: Feature, seed: string, n: number): [number, number][] {
  const polys = rings(f);
  if (!polys.length) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const ring of poly) for (const p of ring) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  const rnd = rng(FNV(seed));
  const out: [number, number][] = [];
  for (let j = 0; j < n; j++) {
    let pt: [number, number] | null = null;
    for (let t = 0; t < 400 && !pt; t++) {          // bbox rejection sampling, deterministic stream
      const c: [number, number] = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
      if (polys.some((poly) => inPoly(c[0], c[1], poly))) pt = c;
    }
    out.push(pt ?? [(x0 + x1) / 2, (y0 + y1) / 2]);
  }
  return out;
}

const tipOf = (r: ResidentRow) =>
  [r.key.sex_label, r.key.age5, r.key.lang_short, r.key.activity].filter(Boolean).join(" · ");

export function buildCrowd(replay: Replay, munis: FC | null, who: string, engine: string): Crowd {
  const byCode = new Map((munis?.features ?? []).map((f) => [f.properties.code, f]));
  const dots: CrowdDot[] = [];
  replay.rows.forEach((r, i) => {
    for (const [muni, k] of r.dots ?? []) {
      const f = byCode.get(muni);
      if (!f) continue;
      const seed = `${rowKey(r)}|${muni}`;
      for (const [j, [lon, lat]] of sample(f, seed, k).entries())
        dots.push({ lon, lat, u: u01(`${seed}|${j}`), order: u01(`${seed}|ord|${j}`), row: i, muni, tip: tipOf(r) });
    }
  });
  return { prog: replay.programme, code: replay.code, dots, rows: replay.rows,
           perDot: replay.per_dot ?? 1, who, engine,
           pRow: replay.rows.map((r) => r.p_cal ?? r.jev_attend),
           revealed: 0, revealFrac: 0, flip: {}, scenarios: [] };
}

// baseline row index for each scenario row (same archetype key) — used to flip dots red -> green
export const scenarioRowIndex = (crowd: Crowd) => {
  const m = new Map<string, number>();
  crowd.rows.forEach((r, i) => m.set(rowKey(r), i));
  return m;
};
