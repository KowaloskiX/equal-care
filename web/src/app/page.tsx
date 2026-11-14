"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import RegionCard, { Src } from "@/components/RegionCard";
import { SimPill } from "@/components/RecommendBlock";
import { engineName, fmt, getBrief, getGap, getGeo, getMeta, getPathway, getSim, getValues,
         type Brief, type FC, type Gap, type Meta, type Pathway, type SimLevel, type Values } from "@/lib/api";

const ChoroplethMap = dynamic(() => import("@/components/ChoroplethMap"), { ssr: false });
const STAGE_ORDER = ["detection", "referral", "treatment", "outcome", "context"];
const SCREENING = ["screen_breast", "screen_cervix", "screen_bowel"];
const PROGS = [{ id: "breast", label: "Breast" }, { id: "bowel", label: "Colorectal" }] as const;
type Prog = (typeof PROGS)[number]["id"];

export default function Home() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [geo, setGeo] = useState<{ county: FC | null; municipality: FC | null }>({ county: null, municipality: null });
  const [key, setKey] = useState("surv_bowel");
  const [county, setCounty] = useState<Values | null>(null);
  const [muni, setMuni] = useState<{ county: string; vals: Values | null }>({ county: "", vals: null });
  const [sel, setSel] = useState<string | null>(null);
  const [path, setPath] = useState<Pathway | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"data" | "sim">("data");
  const [prog, setProg] = useState<Prog>("breast");
  const [sims, setSims] = useState<Partial<Record<Prog, SimLevel>>>({});
  const [brief, setBrief] = useState<Brief | null>(null);

  useEffect(() => {
    getMeta().then(setMeta).catch((e) => setErr(String(e)));
    Promise.all([getGeo("county"), getGeo("municipality")]).then(([c, m]) => setGeo({ county: c, municipality: m })).catch((e) => setErr(String(e)));
    getBrief().then(setBrief).catch(() => null);
  }, []);
  useEffect(() => { getValues(key).then(setCounty).catch((e) => setErr(String(e))); }, [key]);
  useEffect(() => {
    if (!sel) return;
    getPathway(sel).then(setPath);
    Promise.all(SCREENING.map((k) => getGap(k, sel))).then((g) => setGaps(g.filter(Boolean) as Gap[]));
  }, [sel]);
  useEffect(() => {
    if (sel) getValues(key, "municipality", sel)
      .then((v) => setMuni({ county: sel, vals: Object.keys(v.values).length ? v : null }))
      .catch(() => setMuni({ county: sel, vals: null }));
  }, [key, sel]);
  useEffect(() => {
    if (mode !== "sim" || sims[prog]) return;
    getSim(prog).then((s) => setSims((m) => ({ ...m, [prog]: s }))).catch(() => null);
  }, [mode, prog, sims]);

  const ind = meta?.indicators.find((i) => i.key === key);
  // Simulation view: counties coloured by the unexplained part of the attendance gap (other_gap, from the API).
  const sim = mode === "sim" ? sims[prog] : undefined;
  const simValues = useMemo<Values | null>(() => {
    if (!sim || !county) return null;
    return {
      key: `sim_${prog}`, label: `${sim.label} — unexplained gap`, unit: "pts", level: "county", year: sim.year,
      higher_is_better: true, target: null, target_note: null, national: 0,
      values: Object.fromEntries(Object.entries(sim.rows).filter(([, r]) => r.other_gap != null)
        .map(([c, r]) => [c, { name: county.values[c]?.name ?? c, value: r.other_gap as number, abs_value: null }])),
      source: sim.source,
    };
  }, [sim, county, prog]);

  const shown = mode === "sim" ? simValues : county;
  const ranked = useMemo(() => {
    if (!shown) return [];
    const xs = Object.entries(shown.values).map(([code, v]) => ({ code, ...v }));
    const better = shown.higher_is_better ?? true;
    return xs.sort((a, b) => (better ? a.value - b.value : b.value - a.value));   // worst first
  }, [shown]);

  const briefProg = brief?.programmes.find((p) => p.programme === prog);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <ChoroplethMap counties={geo.county} municipalities={geo.municipality} county={shown}
                     muni={mode === "data" && sel === muni.county ? muni.vals : null} selected={sel} onSelect={setSel} />

      <div className="absolute left-4 top-4 bottom-4 w-[340px] flex flex-col gap-3 pointer-events-none">
        <div className="glass p-4 pointer-events-auto">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Equal Care Across Finland</div>
            <div className="flex gap-1">
              {(["data", "sim"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                        className={`pill ${mode === m ? "text-amber-300 border-amber-300/60" : "text-white/50"}`}>
                  {m === "data" ? "Data" : "Simulation"}
                </button>
              ))}
            </div>
          </div>
          <h1 className="text-[18px] font-semibold leading-tight mt-1">Where does the cancer care pathway fall behind?</h1>
          <p className="text-[12.5px] text-white/55 mt-1.5">
            {mode === "data"
              ? "Public data only: THL Sotkanet (Finnish Cancer Registry figures) and Statistics Finland. Click a county."
              : "Simulation: colour shows the part of the attendance gap the county's population does not explain."}
          </p>
          {err && <p className="text-rose-400 text-[12px] mt-2">API: {err}. Is <code>make app</code> running?</p>}
        </div>

        {mode === "data" ? (
          <div className="glass p-3 pointer-events-auto overflow-y-auto">
            {meta && STAGE_ORDER.map((st) => (
              <div key={st} className="mb-1.5">
                <div className="text-[10.5px] uppercase tracking-wide text-white/35 px-1 mb-1">{st}</div>
                <div className="flex flex-wrap gap-1.5">
                  {meta.indicators.filter((i) => i.stage === st && i.unit !== "people" && i.unit !== "visits").map((i) => (
                    <button key={i.key} onClick={() => setKey(i.key)} className={`chip ${i.key === key ? "chip-primary" : ""}`}>{i.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass p-3 pointer-events-auto">
            <div className="text-[10.5px] uppercase tracking-wide text-white/35 px-1 mb-1">Screening programme</div>
            <div className="flex gap-1.5">
              {PROGS.map((p) => (
                <button key={p.id} onClick={() => setProg(p.id)} className={`chip ${prog === p.id ? "chip-primary" : ""}`}>{p.label}</button>
              ))}
            </div>
          </div>
        )}

        {shown && (mode === "data" ? ind : sim) && (
          <div className="glass p-4 pointer-events-auto overflow-y-auto min-h-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[13px] font-semibold leading-tight">{shown.label}, {shown.source.period ?? shown.year}</div>
              <div className="flex items-center gap-1.5">{mode === "sim" && <SimPill text={`Simulation${engineName(sim?.engine) ? ` · ${engineName(sim?.engine)}` : ""}`} />}<Src s={shown.source} /></div>
            </div>
            <div className="text-[12px] text-white/55 mt-1">
              {mode === "data" ? (
                <>Finland {fmt(shown.national, shown.unit)}{shown.target != null && <> · target {fmt(shown.target, shown.unit)}</>}
                {ind?.goal && <> · strategy goal {ind.goal}</>}</>
              ) : (
                <>0 = gap fully explained by population · red = unexplained{sim?.validation?.counties_weighted?.r != null && <> · validation r {sim.validation.counties_weighted.r}</>}</>
              )}
            </div>
            <div className="mt-2 space-y-0.5">
              {ranked.slice(0, 6).map((r) => (
                <button key={r.code} onClick={() => setSel(r.code)} className="w-full flex justify-between text-[12.5px] px-1.5 py-1 rounded hover:bg-white/5">
                  <span className="text-white/75 truncate">{r.name.replace(" hyvinvointialue", "").replace("n hyvinvointialue", "")}</span>
                  <span className="tabular-nums text-rose-300">{fmt(r.value, shown.unit)}</span>
                </button>
              ))}
            </div>
            <div className="text-[10.5px] text-white/35 mt-1.5">
              {mode === "data" ? `Weakest six of ${ranked.length}. Red on the map = worse than Finland.` : `Largest unexplained gap of ${ranked.length}. Red = below 0.`}
            </div>
          </div>
        )}
      </div>

      {path && sel ? (
        <div className="absolute right-4 top-4">
          <RegionCard p={path} gaps={gaps} active={key} onPick={setKey} onClose={() => setSel(null)} />
        </div>
      ) : briefProg && (
        <div className="absolute right-4 top-4 w-[380px] max-h-[calc(100vh-32px)] flex flex-col gap-3">
          <div className="glass p-4 overflow-y-auto">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[13px] font-semibold">2-minute brief</div>
              <div className="flex gap-1.5">
                {PROGS.map((p) => (
                  <button key={p.id} onClick={() => setProg(p.id)} className={`chip ${prog === p.id ? "chip-primary" : ""}`}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="text-[11px] text-white/45 mt-1">
              Counties with the most people short of the 80 % attendance target.
              {briefProg.validation?.counties_weighted?.r != null && <span> Simulation validated vs 2024 county rates (r = {briefProg.validation.counties_weighted.r}).</span>}
            </div>
            <div className="mt-2 space-y-2">
              {briefProg.counties.map((c) => {
                const sp = c.split; const ts = c.top_scenario; const act = ts?.actions[0];
                const tot = Math.abs(sp.composition_gap ?? 0) + Math.abs(sp.other_gap ?? 0);
                return (
                  <button key={c.code} onClick={() => setSel(c.code)} className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-amber-300/40">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13.5px] font-semibold">{c.name}</span>
                      {c.screening && (
                        <span className="tabular-nums text-[12px] text-white/70">
                          {fmt(c.screening.rate, "%")} · <b className="text-rose-300">{fmt(c.screening.missing_per_year)} people/yr</b> short
                        </span>
                      )}
                    </div>
                    {sp.composition_gap != null && sp.other_gap != null && (
                      <div className="mt-1.5">
                        <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="bg-sky-400/70" style={{ width: `${tot ? (100 * Math.abs(sp.composition_gap)) / tot : 0}%` }} />
                          <div className="bg-rose-400/70 flex-1" />
                        </div>
                        <div className="text-[10.5px] text-white/50 mt-1 flex items-center gap-1.5">
                          <span>population explains {fmt(Math.abs(sp.composition_gap))} pts · not explained {fmt(Math.abs(sp.other_gap))} pts</span>
                          <SimPill text={sp.note} />
                        </div>
                      </div>
                    )}
                    {ts && act && (
                      <div className="text-[11.5px] text-white/65 mt-1.5">
                        {ts.extra_people_per_year != null && ts.extra_people_per_year > 0 && <span className="text-emerald-300 font-semibold">+{fmt(ts.extra_people_per_year)} people/yr</span>}
                        {" — "}
                        <a href={act.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                           className="text-amber-300/90 underline decoration-dotted">Roadmap {act.id}, p.{act.page}</a>
                        <span className="text-white/40" title={act.title}> {act.title_en ?? ts.label}</span>
                      </div>
                    )}
                    {c.survival?.below_national && (
                      <div className="text-[11px] text-white/55 mt-1">
                        <span className="pill text-amber-300 border-amber-300/40 mr-1">Goal 3</span>
                        5-yr survival {fmt(c.survival.value, "%")} vs Finland {fmt(c.survival.national, "%")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
