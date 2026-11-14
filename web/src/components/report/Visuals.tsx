"use client";
// Fixed slide visuals for the generated deck/briefing. Every number comes from the backend `visuals`
// payload (built in src/report.py from the same sources as FACTS); these components only draw.
// Font sizes use cqw so the same component scales inside the 16:9 slide and the inline briefing block.
import { createContext, useContext, useMemo } from "react";
import { fmt } from "@/lib/api";
import type { ItemVisuals, Slide, VFeature } from "@/lib/report";

// Font floor in cqw: inside the 16:9 deck a slide at 1280x720 makes 1 cqw ~ 11.3 px, so the deck
// renders visuals with MinFs=1.15 (~13 px effective); the inline briefing block leaves the floor at 0.
export const MinFs = createContext(0);
const useFs = () => {
  const m = useContext(MinFs);
  return useMemo(() => (cqw: number) => ({ fontSize: `${Math.max(cqw, m)}cqw` }), [m]);
};
const SKY = "rgba(56,189,248,0.75)", ROSE = "rgba(251,113,133,0.75)", AMBER = "#fbbf24";

// ---------- shared bits

function Meter({ score }: { score?: number | null }) {
  const dots = score == null ? 0 : score >= 2.5 ? 3 : score >= 2 ? 2 : 1;
  return (
    <span className="inline-flex items-end gap-[0.2cqw]">
      {[0, 1, 2].map((i) => (
        <span key={i} className="rounded-full"
              style={{ width: "0.45cqw", height: "0.45cqw",
                       background: i < dots ? "#fbbf24" : "rgba(255,255,255,0.15)" }} />
      ))}
    </span>
  );
}

function ActionChip({ a }: { a: { id: string; title_en?: string | null; page?: number | null; score?: number | null;
                                partial_match?: boolean | null; matched_by?: string | null } }) {
  const F = useFs();
  return (
    <span className="inline-flex items-center gap-[0.5cqw] rounded-full border border-amber-300/40 bg-amber-300/10
                     text-amber-200 px-[0.9cqw] py-[0.25cqw] whitespace-nowrap" style={F(1.15)}
          title={`${a.title_en ?? a.id}${a.score != null ? ` · matched by ${a.matched_by ?? "Gemini Decisions"} · fit ${a.score}/3` : ""}`}>
      {a.id} · p.{a.page} <Meter score={a.score} />
      {a.partial_match && <span className="text-white/45" style={F(1)}>partial</span>}
    </span>
  );
}

function ringsOf(g: { type: string; coordinates: number[][][] | number[][][][] }): number[][][] {
  if (g.type === "Polygon") return g.coordinates as number[][][];
  if (g.type === "MultiPolygon") return (g.coordinates as number[][][][]).flat();
  return [];
}

function MiniMap({ features, highlight }: { features: VFeature[]; highlight?: string }) {
  const polys = useMemo(() => features.map((f) => ({ code: f.code, rings: ringsOf(f.geometry) })), [features]);
  const { paths, vb } = useMemo(() => {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const f of polys) for (const ring of f.rings) for (const [x, y] of ring) {
      const X = x * 0.43;                              // cos(~64 N) so Finland keeps its shape
      if (X < minX) minX = X; if (X > maxX) maxX = X;
      if (-y < minY) minY = -y; if (-y > maxY) maxY = -y;
    }
    const padX = (maxX - minX) * 0.04, padY = (maxY - minY) * 0.04;
    const vb = `${minX - padX} ${minY - padY} ${maxX - minX + 2 * padX} ${maxY - minY + 2 * padY}`;
    const paths = polys.map((f) => ({
      code: f.code,
      d: f.rings.map((r) => r.map(([x, y], i) => `${i ? "L" : "M"}${(x * 0.43).toFixed(3)} ${(-y).toFixed(3)}`).join(" ") + " Z").join(" "),
    }));
    return { paths, vb };
  }, [polys]);
  return (
    <svg viewBox={vb} className="w-full h-full" aria-hidden>
      {paths.map((f) => (
        <path key={f.code} d={f.d}
              fill={f.code === highlight ? "rgba(251,191,36,0.9)" : "rgba(255,255,255,0.10)"}
              stroke={f.code === highlight ? "#fbbf24" : "rgba(255,255,255,0.18)"}
              strokeWidth={0.12} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

// ---------- per-kind visuals

function Where({ v }: { v: NonNullable<ItemVisuals["where"]> }) {
  const F = useFs();
  const rows = v.ranking ?? [];
  const hi = v.map?.highlight;
  const vals = rows.map((r) => r.rate).concat([v.target ?? 80, v.national ?? 85]);
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 6));
  const span = Math.max(...vals) + 2 - lo || 1;
  const x = (val: number) => (Math.min(Math.max(val, lo), lo + span) - lo) / span * 100;
  const tx = v.target == null ? 0 : x(v.target);
  return (
    <div className="flex items-stretch gap-[2.5cqw] h-full">
      <div className="w-[34%] min-w-0 flex flex-col">
        <div className="text-white/45 uppercase tracking-[0.18em]" style={F(1)}>Wellbeing services counties</div>
        <div className="flex-1 min-h-0 mt-[0.6cqw]">
          {v.map?.features?.length ? <MiniMap features={v.map.features} highlight={hi} /> : null}
        </div>
        <div className="text-amber-300/90 mt-[0.4cqw]" style={F(1.15)}>
          {v.county?.name} · {fmt(v.county?.rate, v.unit)} · {fmt(v.county?.missing_per_year)} missing a year
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="text-white/45 uppercase tracking-[0.18em]" style={F(1)}>Counties furthest from the target</div>
        <div className="relative mt-[1cqw]">
          {v.target != null && (
            <div className="absolute top-[-0.5cqw] bottom-[-0.5cqw] w-px bg-white/40 z-10" style={{ left: `${tx}%` }}>
              <span className="absolute -top-[1.7cqw] text-white/50 whitespace-nowrap"
                    style={{ ...F(1), left: 0,
                             transform: tx > 86 ? "translateX(-100%)" : tx < 14 ? "none" : "translateX(-50%)" }}>
                target {fmt(v.target, "%")}
              </span>
            </div>
          )}
          <div className="space-y-[0.9cqw] pt-[1.6cqw]">
            {rows.map((r) => (
              <div key={r.code}>
                <div className="flex justify-between items-baseline" style={F(1.25)}>
                  <span className={r.code === hi ? "text-amber-300 font-medium" : "text-white/80"}>{r.name}</span>
                  <span className="tabular-nums text-white/70">{fmt(r.rate, "%")}
                    {r.missing_per_year != null && <span className="text-white/40" style={F(1)}> · {fmt(r.missing_per_year)}/yr</span>}
                  </span>
                </div>
                <div className="rounded-full bg-white/[0.07] mt-[0.3cqw]" style={{ height: "0.75cqw" }}>
                  <div className="h-full rounded-full" style={{
                    width: `${x(r.rate)}%`,
                    background: r.code === hi ? AMBER : "rgba(251,113,133,0.6)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Why({ v }: { v: NonNullable<ItemVisuals["why"]> }) {
  const F = useFs();
  const bars = [
    { label: "Actually attends", val: v.real, color: "rgba(251,113,133,0.8)" },
    { label: "Expected from who lives here", val: v.expected, color: SKY },
    { label: "Finland", val: v.national_real, color: "rgba(255,255,255,0.5)" },
  ].filter((b) => b.val != null);
  const comp = Math.abs(v.composition_gap ?? 0), other = Math.abs(v.unexplained_gap ?? 0), tot = comp + other;
  const compW = tot ? (comp / tot) * 100 : 0;
  const [blo, bhi] = v.composition_gap_90 ?? [null, null];
  // the 90 % interval bracket inside the composition segment's track
  const bx0 = comp && blo != null ? (Math.abs(blo) / comp) * compW : 0;
  const bx1 = comp && bhi != null ? (Math.abs(bhi) / comp) * compW : 0;
  return (
    <div className="flex flex-col justify-center h-full">
      <div className="space-y-[1.3cqw]">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex justify-between items-baseline" style={F(1.25)}>
              <span className="text-white/80">{b.label}</span>
              <span className="tabular-nums text-white/70">{fmt(b.val, "%")}</span>
            </div>
            <div className="rounded-full bg-white/[0.07] mt-[0.3cqw]" style={{ height: "0.9cqw" }}>
              <div className="h-full rounded-full" style={{ width: `${b.val}%`, background: b.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-[2.6cqw]">
        <div className="text-white/45 uppercase tracking-[0.18em]" style={F(1)}>
          Where the {Math.abs(v.total_gap ?? 0).toFixed(1)}-point distance to Finland comes from
        </div>
        <div className="relative mt-[0.8cqw]">
          <div className="flex rounded-full overflow-hidden bg-white/[0.07]" style={{ height: "1.6cqw" }}>
            <div style={{ width: `${compW}%`, background: SKY }} />
            <div className="flex-1" style={{ background: ROSE }} />
          </div>
          {comp > 0 && blo != null && bhi != null && (
            <div className="absolute" style={{ left: `${bx0}%`, width: `${bx1 - bx0}%`, top: "45%", height: "55%" }}>
              <div className="absolute left-0 right-0 top-[0.35cqw] border-t-[0.15cqw] border-white/80" />
              <div className="absolute left-0 top-0 h-[0.4cqw] border-l-[0.15cqw] border-white/80" />
              <div className="absolute right-0 top-0 h-[0.4cqw] border-r-[0.15cqw] border-white/80" />
            </div>
          )}
        </div>
        <div className="flex justify-between mt-[0.8cqw]" style={F(1.15)}>
          <span className="text-sky-300/90">
            who lives here ≈ {Math.abs(v.composition_gap ?? 0).toFixed(1)} pts
            {blo != null && bhi != null && <span className="text-white/45"> ({Math.abs(blo).toFixed(1)}–{Math.abs(bhi).toFixed(1)})</span>}
          </span>
          <span className="text-rose-300/90">not explained ≈ {Math.abs(v.unexplained_gap ?? 0).toFixed(1)} pts</span>
        </div>
        <div className="text-white/45 mt-[0.6cqw]" style={F(1)}>
          Based on {v.n_municipalities} municipalities — composition explains {v.r2_pct} % of their differences.
        </div>
      </div>
    </div>
  );
}

function Who({ v, prog }: { v: NonNullable<ItemVisuals["who"]>; prog?: string }) {
  const F = useFs();
  const skipN = v.expected_skip_per_100 ?? 0;
  const barriers = Object.entries(v.barriers ?? {}).sort((a, b) => b[1] - a[1]);
  const maxB = barriers[0]?.[1] || 1;
  return (
    <div className="flex items-stretch gap-[2.5cqw] h-full">
      <div className="w-[30%] min-w-0 flex flex-col justify-center">
        <div className="grid grid-cols-10 gap-[0.22cqw]">
          {Array.from({ length: 100 }, (_, i) => (
            <span key={i} className="rounded-full" style={{
              aspectRatio: "1",
              background: i < skipN ? ROSE : "rgba(72,196,160,0.55)" }} />
          ))}
        </div>
        <div className="mt-[0.9cqw] text-white/70 leading-snug" style={F(1.1)}>
          Out of 100 invited, about <span className="text-rose-300 font-medium">{skipN}</span> are expected to skip
          <span className="text-white/40"> · {v.note ?? "simulation"}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-[1cqw]">
        <div className="space-y-[0.7cqw]">
          {(v.groups ?? []).map((g, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.04] px-[1cqw] py-[0.6cqw]">
              <div style={F(1.2)} className="text-white/85">{prog === "breast" ? "Women" : "People"} with {g.lang_group === "another native language" ? "another native language" : "Finnish or Swedish"} · {g.activity}</div>
              <div style={F(1)} className="text-white/50 mt-[0.15cqw]">
                ~{fmt(g.expected_skip)} expected to skip · {fmt(g.rate, "%")} take part
                {g.main_barrier_short && <> · main barrier: <span className="text-amber-300/90">{g.main_barrier_short}</span></>}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-white/45 uppercase tracking-[0.18em]" style={F(1)}>Main barriers residents give</div>
          <div className="space-y-[0.5cqw] mt-[0.5cqw]">
            {barriers.map(([k, share]) => (
              <div key={k} className="flex items-center gap-[0.8cqw]" style={F(1.05)}>
                <span className="w-[7.5cqw] text-white/60 truncate">{v.barrier_labels?.[k] ?? k}</span>
                <div className="flex-1 rounded-full bg-white/[0.07]" style={{ height: "0.55cqw" }}>
                  <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${(share / maxB) * 100}%` }} />
                </div>
                <span className="tabular-nums text-white/60 w-[3cqw] text-right">{Math.round(share * 100)} %</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function What({ v }: { v: NonNullable<ItemVisuals["what"]> }) {
  const F = useFs();
  const minFs = useContext(MinFs);
  const rows = v.rows ?? [];
  const missing = v.missing_per_year;
  // One shared axis for every row so band proportions stay comparable between interventions.
  // A negative share keeps a real position left of the zero tick — it is labelled "+/−", never clamped.
  const pcts = rows.flatMap((c) => [c.gemini_pct, c.jev_pct].filter((x): x is number => x != null));
  let lo = Math.min(0, ...pcts);
  if (lo < 0) lo -= Math.max(3, -lo * 0.4);      // small pad so a negative marker is not on the track edge
  const hi = Math.max(100, ...pcts);
  const span = hi - lo || 1;
  const X = (p: number) => ((p - lo) / span) * 100;
  const lx = (p: number) => Math.max(2, Math.min(98, X(p)));   // label position, clamped for legibility only
  const minH = minFs ? (rows.length > 4 ? "11cqw" : "14cqw") : undefined;
  return (
    <div className="flex flex-col h-full" style={{ gap: "1cqw" }}>
      {missing != null && (
        <div className="text-white/45 shrink-0" style={F(1.05)}>
          <span className="uppercase tracking-[0.18em]">Simulated reach per year</span>
          {" — "}{fmt(missing)} people a year short of the target
        </div>
      )}
      {rows.map((c, i) => {
        const g = c.gemini_pct ?? null, j = c.jev_pct ?? null;
        const ends = [g, j].filter((x): x is number => x != null);
        const bandL = ends.length ? X(Math.min(...ends)) : 0;   // band runs from the lower engine share
        const bandR = ends.length ? X(Math.max(...ends)) : bandL;
        const neg = ends.some((x) => x < 0);
        return (
          <div key={i} className="flex-1 min-h-0 flex items-center gap-[1.6cqw] rounded-xl border border-white/10
                                  bg-white/[0.04] px-[1.2cqw] py-[0.5cqw]"
               style={minH ? { minHeight: minH } : undefined}>
            <div className="w-[16cqw] shrink-0 min-w-0">
              <div className="text-white/90 font-medium leading-snug" style={F(1.25)}>{c.label}</div>
              <div className="tabular-nums text-emerald-300 mt-[0.25cqw]" style={F(1.1)}>
                {c.gemini_extra != null ? `${c.gemini_extra >= 0 ? "+" : "−"}${fmt(Math.abs(c.gemini_extra))} a year`
                  : (c.note ?? "no cached run")}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="relative rounded-full bg-white/[0.07]" style={{ height: "1.5cqw" }}>
                {lo < 0 && (
                  <div className="absolute inset-y-0 w-px bg-white/50" style={{ left: `${X(0)}%` }}>
                    {neg && <span className="absolute -top-[1.15cqw] left-1/2 -translate-x-1/2 text-white/45"
                                  style={F(0.85)}>+/−</span>}
                  </div>
                )}
                {ends.length > 1 && bandR > bandL && (
                  <div className="absolute inset-y-0 rounded-full bg-emerald-400/30"
                       style={{ left: `${bandL}%`, width: `${bandR - bandL}%` }} />
                )}
                {j != null && (
                  <div className="absolute inset-y-0 w-[0.3cqw] rounded bg-sky-300/80"
                       title={`Jev: ${j} % of the gap`}
                       style={{ left: `calc(${X(j)}% - 0.15cqw)` }} />
                )}
                {g != null && (
                  <div className="absolute inset-y-0 w-[0.3cqw] rounded bg-emerald-300"
                       title={`Gemini Decisions: ${g} % of the gap`}
                       style={{ left: `calc(${X(g)}% - 0.15cqw)` }} />
                )}
                {g != null && (
                  <span className="absolute bottom-full mb-[0.15cqw] -translate-x-1/2 whitespace-nowrap tabular-nums
                                   text-emerald-300/90" style={{ ...F(0.95), left: `${lx(g)}%` }}>{fmt(g)} %</span>
                )}
              </div>
              <div className="flex items-baseline justify-between mt-[0.6cqw] tabular-nums" style={F(0.95)}>
                <span className="text-sky-300/85 whitespace-nowrap">
                  {c.jev_extra != null
                    ? `Jev ${c.jev_extra >= 0 ? "+" : "−"}${fmt(Math.abs(c.jev_extra))} a year` +
                      (j != null ? ` · ${fmt(j)} %` : "")
                    : "Gemini Decisions only"}
                </span>
                <span className="text-white/35" style={F(0.85)}>share of the gap · simulated upper bound</span>
                <span className="text-emerald-300/80 whitespace-nowrap">
                  {c.gemini_extra != null
                    ? `Gemini Decisions ${c.gemini_extra >= 0 ? "+" : "−"}${fmt(Math.abs(c.gemini_extra))} a year` +
                      (g != null ? ` · ${fmt(g)} %` : "")
                    : "not cached"}
                </span>
              </div>
            </div>
            <div className="shrink-0 flex flex-wrap justify-end content-center gap-[0.45cqw] max-w-[24cqw]">
              {(c.actions ?? []).slice(0, 3).map((a) => <ActionChip key={a.id} a={a} />)}
            </div>
          </div>
        );
      })}
      {!rows.length && <div className="text-white/50" style={F(1.2)}>No intervention runs for this item.</div>}
    </div>
  );
}

const NODE_STYLE: Record<string, { dot: string; text: string }> = {
  worse: { dot: "#f87171", text: "#fca5a5" },
  better: { dot: "#34d399", text: "#6ee7b7" },
  close: { dot: "rgba(255,255,255,0.5)", text: "rgba(255,255,255,0.6)" },
  gap: { dot: "rgba(255,255,255,0.15)", text: "rgba(255,255,255,0.4)" },
};
const NODE_LABEL: Record<string, string> = {
  detection: "Detection", referral: "Referral", diagnosis: "Diagnosis", treatment: "Treatment", outcome: "Outcome",
};

function Pathway({ v }: { v: NonNullable<ItemVisuals["pathway"]> }) {
  const F = useFs();
  const nodes = v.nodes ?? [];
  const q = v.queue;
  const line = useMemo(() => {
    if (!q?.periods?.length) return null;
    const pts = q.periods.map((p) => ({ p, c: q.county?.[String(p)], f: q.finland?.[String(p)] }))
                        .filter((x) => x.c != null || x.f != null);
    const vals = pts.flatMap((x) => [x.c, x.f].filter((z): z is number => z != null));
    if (!vals.length) return null;
    const hi = Math.max(...vals) * 1.1 || 1;
    const W = 100, H = 34;
    const xy = (i: number, val: number) => `${(i / Math.max(1, pts.length - 1)) * W},${H - (val / hi) * (H - 3) - 1}`;
    const mk = (pick: (x: (typeof pts)[0]) => number | null | undefined) =>
      pts.map((x, i) => ({ i, v: pick(x) })).filter((x): x is { i: number; v: number } => x.v != null)
         .map((x) => xy(x.i, x.v)).join(" ");
    return { W, H, cLine: mk((x) => x.c), fLine: mk((x) => x.f), hi, n: pts.length };
  }, [q]);
  return (
    <div className="flex flex-col justify-center h-full">
      <div className="relative">
        <div className="absolute left-[4cqw] right-[4cqw] top-[0.8cqw] border-t border-white/15" />
        <div className="relative flex justify-between">
          {nodes.map((n) => {
            const st = NODE_STYLE[n.status] ?? NODE_STYLE.gap;
            return (
              <div key={n.id} className="flex flex-col items-center gap-[0.4cqw] w-[16%]">
                <span className="rounded-full" style={{ width: "1.15cqw", height: "1.15cqw", background: st.dot,
                  ...(n.status === "gap" ? { border: "0.15cqw dashed rgba(255,255,255,0.4)", background: "transparent" } : {}) }} />
                <span className="text-center uppercase tracking-wide" style={{ ...F(1.1), color: st.text }}>
                  {NODE_LABEL[n.id] ?? n.id}
                </span>
                <span className="tabular-nums text-white/60 text-center" style={F(1.1)}>
                  {n.value != null ? fmt(n.value, n.unit ?? "") : "no data"}
                  {n.small_n && <span className="text-amber-300/80"> · small n</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {line && q && (
        <div className="mt-[2cqw]">
          <div className="text-white/45 uppercase tracking-[0.18em]" style={F(1)}>
            {q.label} — monthly
          </div>
          <svg viewBox={`0 0 ${line.W} ${line.H}`} className="w-full mt-[0.5cqw]" style={{ height: "13cqw" }}
               preserveAspectRatio="none" aria-hidden>
            <polyline points={line.fLine} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
            <polyline points={line.cLine} fill="none" stroke={AMBER} strokeWidth="0.7" />
          </svg>
          <div className="flex justify-between mt-[0.4cqw] text-white/45" style={F(1)}>
            <span><span style={{ color: AMBER }}>—</span> county &nbsp; <span className="text-white/60">—</span> Finland</span>
            <span>{line.n} months · oncology patients waiting &gt; 90 days</span>
          </div>
        </div>
      )}
    </div>
  );
}

const LIMIT_ICONS = ["M12 4v8l4 4", "M4 12h16M12 4v16", "M6 6l12 12M18 6L6 18", "M12 3a9 9 0 100 18 9 9 0 000-18"];

function Limits({ v }: { v: { limits?: string[] } }) {
  const F = useFs();
  return (
    <div className="grid grid-cols-2 gap-[1.2cqw] h-full content-center">
      {(v.limits ?? []).map((l, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/[0.04] p-[1.1cqw] flex gap-[0.9cqw] items-start">
          <svg viewBox="0 0 24 24" className="shrink-0 mt-[0.15cqw]" style={{ width: "1.7cqw", height: "1.7cqw" }}
               fill="none" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d={LIMIT_ICONS[i % LIMIT_ICONS.length]} />
          </svg>
          <span className="text-white/80 leading-snug" style={F(1.25)}>{l}</span>
        </div>
      ))}
    </div>
  );
}

function Next({ v }: { v: NonNullable<ItemVisuals["next"]> }) {
  const F = useFs();
  return (
    <div className="flex flex-col justify-center h-full gap-[2cqw]">
      <div className="relative">
        <div className="absolute left-[4cqw] right-[4cqw] top-[1cqw] border-t border-emerald-300/25" />
        <div className="relative flex justify-between">
          {(v.steps ?? []).map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-[0.6cqw] w-[30%] text-center">
              <span className="rounded-full bg-emerald-400/20 border border-emerald-300/50 text-emerald-300
                               flex items-center justify-center tabular-nums"
                    style={{ width: "2.1cqw", height: "2.1cqw", ...F(1.15) }}>{i + 1}</span>
              <span className="text-white/80 leading-snug" style={F(1.15)}>{s}</span>
            </div>
          ))}
        </div>
      </div>
      {(v.actions ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-[0.7cqw]">
          <span className="text-white/45 uppercase tracking-[0.18em]" style={F(1)}>Roadmap</span>
          {v.actions!.map((a) => <ActionChip key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}

/** The fixed visual for a slide kind, drawn from the item's backend visuals. `minFs` floors every cqw
    font size inside the visual (the deck passes ~1.15 so a 720p projection still reads ~13 px). */
export function SlideVisual({ slide, v, minFs = 0 }: { slide: Slide; v: ItemVisuals | null; minFs?: number }) {
  if (!v) return null;
  const inner = (() => {
    switch (slide.kind) {
      case "where": return v.where && !v.where.error ? <Where v={v.where} /> : null;
      case "why": return v.why && !v.why.error ? <Why v={v.why} /> : null;
      case "who": return v.who && !v.who.error ? <Who v={v.who} prog={v.prog} /> : null;
      case "what": return v.what && !v.what.error ? <What v={v.what} /> : null;
      case "pathway": return v.pathway && !v.pathway.error ? <Pathway v={v.pathway} /> : null;
      case "limits": return v.limits?.length ? <Limits v={v} /> : null;
      case "next": return v.next ? <Next v={v.next} /> : null;
      default: return null;
    }
  })();
  return <MinFs.Provider value={minFs}>{inner}</MinFs.Provider>;
}

/** Hero numbers for the title slide: "N people a year missing" per item. */
export function HeroStats({ data }: { data: { items?: { prog: string; code: string }[];
                                             visuals?: Record<string, ItemVisuals> } }) {
  const F = useFs();
  const rows = (data.items ?? []).map((it) => {
    const w = data.visuals?.[`c${it.code}_${it.prog}`]?.where;
    return w?.county ? { name: w.county.name, missing: w.county.missing_per_year, rate: w.county.rate,
                         target: w.target } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  if (!rows.length) return null;
  return (
    <div className="flex gap-[3cqw] mt-[2cqw]">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="font-semibold text-amber-300 tabular-nums leading-none" style={F(3.4)}>{fmt(r.missing)}</div>
          <div className="text-white/55 mt-[0.5cqw]" style={F(1.1)}>
            people a year missing in {r.name} · {fmt(r.rate, "%")} attends · target {fmt(r.target, "%")}
          </div>
        </div>
      ))}
    </div>
  );
}
