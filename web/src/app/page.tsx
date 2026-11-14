"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import RegionCard, { Src } from "@/components/RegionCard";
import { DataChip, DRIVER_BADGE, people, RoadmapChip, SimChip, SimPill, SplitBar, splitEngine, splitSentence } from "@/components/RecommendBlock";
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
  const [key, setKey] = useState("screen_breast");
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
  // Programme toggle also steers the map: the coloured layer follows the programme's screening indicator.
  const pickProg = (p: Prog) => { setProg(p); if (mode === "data") setKey(p === "breast" ? "screen_breast" : "screen_bowel"); };

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <ChoroplethMap counties={geo.county} municipalities={geo.municipality} county={shown}
                     muni={mode === "data" && sel === muni.county ? muni.vals : null} selected={sel} onSelect={setSel} />

      <div className="absolute left-4 top-4 bottom-4 w-[340px] flex flex-col gap-3 pointer-events-none">
        <div className="glass p-4 pointer-events-auto">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Equal Care Across Finland</div>
            <div className="flex gap-1 items-center">
              <a href="/story" className="pill text-white/50 hover:text-amber-300 hover:border-amber-300/60">Story</a>
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
                <button key={p.id} onClick={() => pickProg(p.id)} className={`chip ${prog === p.id ? "chip-primary" : ""}`}>{p.label}</button>
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
              {mode === "data" ? `Weakest six of ${ranked.length}.` : `Largest unexplained gap of ${ranked.length}.`}
            </div>
          </div>
        )}
      </div>

      {shown && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass px-3 py-2 text-[11px] text-white/70 flex items-center gap-3 pointer-events-none">
          <span className="font-semibold text-white/85">Map: {shown.label}</span>
          {mode === "data" ? (
            <>
              <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/80" />better than Finland</span>
              <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/80" />worse</span>
              <span>stronger colour = bigger difference</span>
              <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-white/15" />no data</span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/80" />gap the population does not explain</span>
              <span>stronger colour = bigger gap</span>
            </>
          )}
        </div>
      )}

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
                  <button key={p.id} onClick={() => pickProg(p.id)} className={`chip ${prog === p.id ? "chip-primary" : ""}`}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="text-[11px] text-white/45 mt-1">
              Where are the most people missing from screening, why, and what would help.
            </div>
            <div className="text-[10px] text-white/40 mt-1 leading-snug">
              <span className="text-white/60 font-semibold">DATA</span> = public statistics ·{" "}
              <span className="text-sky-300/80 font-semibold">SIMULATION</span> = model of residents, checked against real 2024 rates
              {briefProg.validation?.counties_weighted?.r != null && <> (r = {briefProg.validation.counties_weighted.r})</>} ·{" "}
              <span className="text-amber-300/80 font-semibold">ROADMAP</span> = numbered action in the national cancer strategy roadmap
            </div>
            <div className="mt-2 space-y-2">
              {briefProg.counties.map((c) => {
                const sp = c.split; const ts = c.top_scenario; const act = ts?.actions[0];
                const who = people(prog);
                return (
                  <button key={c.code} onClick={() => setSel(c.code)} className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-amber-300/40">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13.5px] font-semibold">{c.name}</span>
                      <span className="pill text-white/70 border-white/25 shrink-0">{DRIVER_BADGE[sp.driver] ?? sp.driver}</span>
                    </div>
                    {c.screening && (
                      <div className="mt-1.5">
                        <DataChip s={c.screening.source} />
                        <p className="text-[11.5px] text-white/75 mt-1 leading-relaxed">
                          {fmt(c.screening.rate, "%")} of invited {who} attend. Target {fmt(c.screening.target, "%")}.{" "}
                          About <b className="text-rose-300">{fmt(c.screening.missing_per_year)} {who}</b> a year are missing.
                        </p>
                        {c.survival?.below_national && (
                          <p className="text-[11px] text-white/55 mt-0.5">
                            <span className="pill text-amber-300 border-amber-300/40 mr-1">Goal 3</span>
                            5-year survival {fmt(c.survival.value, "%")} (Finland {fmt(c.survival.national, "%")})
                          </p>
                        )}
                      </div>
                    )}
                    <div className="mt-1.5">
                      <SimChip eng={splitEngine(sp)} />
                      <p className="text-[11.5px] text-white/70 mt-1 leading-relaxed">
                        {splitSentence(sp, fmt(c.screening?.target ?? 80, "%"))}
                      </p>
                      {(sp.composition_gap != null && sp.other_gap != null) && <SplitBar split={sp} />}
                    </div>
                    {ts && act && (
                      <div className="mt-1.5">
                        <RoadmapChip />
                        <p className="text-[11.5px] text-white/65 mt-1 leading-relaxed">
                          Best step: {ts.label} → about <b className="text-emerald-300">+{fmt(ts.extra_people_per_year)} {who}</b> a
                          year (simulated).{" "}
                          <a href={act.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                             className="text-amber-300/90 underline decoration-dotted" title={act.title}>
                            Action {act.id}, p.{act.page}: {act.title_en ?? ts.label}
                          </a>
                        </p>
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
