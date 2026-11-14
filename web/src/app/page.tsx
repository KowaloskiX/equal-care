"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import RegionCard, { Src } from "@/components/RegionCard";
import BriefPanel from "@/components/BriefPanel";
import { SimPill } from "@/components/RecommendBlock";
import { Seg, Skel, StepNo, Tag } from "@/components/ui";
import { engineName, fmt, getBrief, getGap, getGeo, getMeta, getPathway, getSim, getValues,
         type Brief, type FC, type Gap, type Meta, type Pathway, type SimLevel, type Values } from "@/lib/api";

const ChoroplethMap = dynamic(() => import("@/components/ChoroplethMap"), { ssr: false });
const SCREENING = ["screen_breast", "screen_cervix", "screen_bowel"];
const PROGS = [{ id: "breast", label: "Breast · mammography" }, { id: "bowel", label: "Colorectal · home test" }] as const;
type Prog = (typeof PROGS)[number]["id"];

// the care-pathway stepper — "diagnosis" has no public county indicator, and that is a finding in itself
const STEPS = [
  { n: 1, stage: "detection", label: "Detection", q: "Do people come to screening?" },
  { n: 2, stage: "referral", label: "Referral", q: "Do they reach a specialist in time?" },
  { n: 3, stage: "diagnosis", label: "Diagnosis", q: "Is the cancer found early?" },
  { n: 4, stage: "treatment", label: "Treatment", q: "Does treatment start in time?" },
  { n: 5, stage: "outcome", label: "Outcome", q: "How does it end?" },
];

export default function Home() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [geo, setGeo] = useState<{ county: FC | null; municipality: FC | null }>({ county: null, municipality: null });
  const [key, setKey] = useState("screen_breast");
  const [county, setCounty] = useState<Values | null>(null);
  const [muni, setMuni] = useState<{ county: string; vals: Values | null }>({ county: "", vals: null });
  const [sel, setSel] = useState<string | null>(null);      // open county card
  const [focus, setFocus] = useState<string | null>(null);  // brief selection: map highlight only
  const [path, setPath] = useState<Pathway | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [briefErr, setBriefErr] = useState(false);
  const [mode, setMode] = useState<"data" | "sim">("data");
  const [prog, setProg] = useState<Prog>("breast");
  const [sims, setSims] = useState<Partial<Record<Prog, SimLevel>>>({});
  const [brief, setBrief] = useState<Brief | null>(null);

  useEffect(() => {
    getMeta().then(setMeta).catch((e) => setErr(String(e)));
    Promise.all([getGeo("county"), getGeo("municipality")]).then(([c, m]) => setGeo({ county: c, municipality: m })).catch((e) => setErr(String(e)));
    getBrief(undefined, 5).then(setBrief).catch(() => setBriefErr(true));
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
  const pickProg = (p: Prog) => {
    setProg(p); setFocus(null);
    if (mode === "data") setKey(p === "breast" ? "screen_breast" : "screen_bowel");
  };

  const activeStage = ind?.stage;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <ChoroplethMap counties={geo.county} municipalities={geo.municipality} county={shown}
                     muni={mode === "data" && sel === muni.county ? muni.vals : null} selected={sel ?? focus} onSelect={setSel} />

      {/* top bar */}
      <header className="absolute left-4 right-4 top-3 glass px-4 h-[52px] flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="t-panel whitespace-nowrap">Equal Care Finland</span>
          <span className="t-caption truncate hidden md:block">Where cancer care falls behind, and what each county can do</span>
        </div>
        <div className="flex items-center gap-3">
          <Seg options={[{ id: "data", label: "Data" }, { id: "sim", label: "Simulation" }] as const}
               value={mode} onChange={setMode} small />
          <a href="/story" className="tag tag-data">Story ▸</a>
        </div>
      </header>

      {/* left: care-pathway stepper */}
      <div className="absolute left-4 top-[72px] bottom-4 w-[320px] flex flex-col gap-3 pointer-events-none">
        {mode === "data" ? (
          <div className="glass p-4 pointer-events-auto overflow-y-auto min-h-0">
            <div className="t-panel">Care pathway</div>
            {err && <p className="t-body text-rose-300 mt-2">API: {err}. Is <code>make app</code> running?</p>}
            {!meta ? <div className="mt-3 space-y-2"><Skel className="h-8" /><Skel className="h-8" /><Skel className="h-8" /></div> : (
              <div className="mt-3">
                {STEPS.map((st, i) => {
                  const items = meta.indicators.filter((x) => x.stage === st.stage && x.unit !== "people" && x.unit !== "visits");
                  const open = st.stage === activeStage;
                  return (
                    <div key={st.stage} className="relative pl-7 pb-3 last:pb-0">
                      {i < STEPS.length - 1 && <div className="absolute left-[8.5px] top-5 bottom-0 border-l border-white/10" />}
                      <div className="absolute left-0 top-0.5"><StepNo n={st.n} /></div>
                      <button onClick={() => items[0] && setKey(items[0].key)}
                              className="w-full text-left flex items-baseline justify-between gap-2">
                        <span className="t-section">{st.label}</span>
                        <span className="t-caption text-right">{st.q}</span>
                      </button>
                      {items.length === 0 ? (
                        <p className="t-caption leading-snug mt-1.5 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
                          No public county data on stage at diagnosis — stage known for 42 % of cancers nationally
                          (<a href="https://syoparekisteri.fi/assets/themes/ssy3/factsheets/syopa_2024_tilastoraportti.html"
                              target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-white/80">
                            Cancer Registry 2024 report</a>, from report text).
                        </p>
                      ) : open && (
                        <div className="mt-1.5 space-y-0.5">
                          {items.map((it) => (
                            <button key={it.key} onClick={() => setKey(it.key)}
                                    className={`w-full flex items-center gap-2 rounded px-2 py-1 text-left ${it.key === key ? "rowsel" : "hover:bg-white/5"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${it.key === key ? "bg-white" : "bg-white/20"}`} />
                              <span className="t-body text-white/75 truncate">{it.short ?? it.label}</span>
                              {it.goal === 3 && <Tag v="goal3">GOAL 3</Tag>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <details className="mt-1 border-t border-white/10 pt-2" open={activeStage === "context"}>
                  <summary className="t-caption select-none hover:text-white/80">Who lives here (context)</summary>
                  <div className="mt-1.5 space-y-0.5">
                    {meta.indicators.filter((x) => x.stage === "context").map((it) => (
                      <button key={it.key} onClick={() => setKey(it.key)}
                              className={`w-full flex items-center gap-2 rounded px-2 py-1 text-left ${it.key === key ? "rowsel" : "hover:bg-white/5"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${it.key === key ? "bg-white" : "bg-white/20"}`} />
                        <span className="t-body text-white/75 truncate">{it.short ?? it.label}</span>
                      </button>
                    ))}
                  </div>
                </details>
                {shown && (
                  <details className="mt-2 border-t border-white/10 pt-2">
                    <summary className="t-caption select-none hover:text-white/80">
                      Ranking — {shown.label}, {shown.source.period ?? shown.year}
                    </summary>
                    <div className="mt-1.5 space-y-0.5">
                      {ranked.slice(0, 5).map((r) => (
                        <button key={r.code} onClick={() => setSel(r.code)}
                                className="w-full flex justify-between gap-2 rounded px-2 py-1 hover:bg-white/5 text-left">
                          <span className="t-body text-white/70 truncate">{r.name}</span>
                          <span className="t-body tabular-nums text-rose-300 shrink-0">{fmt(r.value, shown.unit)}</span>
                        </button>
                      ))}
                      {shown.national != null && (
                        <div className="flex justify-between gap-2 rounded px-2 py-1 border-t border-white/10 mt-1">
                          <span className="t-body text-white/85">Finland</span>
                          <span className="t-body tabular-nums text-white/85">{fmt(shown.national, shown.unit)}</span>
                        </div>
                      )}
                    </div>
                    <div className="t-micro mt-1">weakest five of {ranked.length} · <Src s={shown.source} /></div>
                  </details>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="glass p-4 pointer-events-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="t-panel">Unexplained gap</div>
              <SimPill text={`Simulation${engineName(sim?.engine) ? ` · ${engineName(sim?.engine)}` : ""}`} />
            </div>
            <p className="t-caption mt-1.5">
              Colour shows the part of the attendance gap the county&apos;s population does not explain — where the
              service, not the residents, is the likely lever.
            </p>
            <div className="mt-2"><Seg options={PROGS} value={prog} onChange={pickProg} small /></div>
            {sim?.validation?.counties_weighted?.r != null && (
              <div className="t-micro mt-2">validation r {sim.validation.counties_weighted.r} vs real 2024 county rates</div>
            )}
            {shown && (
              <div className="mt-2 space-y-0.5">
                {ranked.slice(0, 5).map((r) => (
                  <button key={r.code} onClick={() => setSel(r.code)}
                          className="w-full flex justify-between gap-2 rounded px-2 py-1 hover:bg-white/5 text-left">
                    <span className="t-body text-white/70 truncate">{r.name}</span>
                    <span className="t-body tabular-nums text-rose-300 shrink-0">{fmt(r.value, shown.unit)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* map legend */}
      {shown && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass px-4 py-2 flex items-center gap-3 pointer-events-none">
          <span className="t-caption font-semibold text-white/85 whitespace-nowrap max-w-[260px] truncate">
            {mode === "data" ? (ind?.short ?? shown.label) : "Unexplained screening gap"}</span>
          {mode === "data" ? (
            <>
              <span className="t-micro whitespace-nowrap">worse</span>
              <div className="w-24 h-2 rounded-full shrink-0"
                   style={{ background: "linear-gradient(90deg, rgb(232,93,74) 0%, rgb(70,76,92) 50%, rgb(72,196,160) 100%)" }} />
              <span className="t-micro whitespace-nowrap">better</span>
              {shown.national != null && <span className="t-micro whitespace-nowrap">· Finland {fmt(shown.national, shown.unit)}</span>}
              <span className="t-micro whitespace-nowrap flex items-center gap-1">
                <i className="inline-block w-2.5 h-2.5 rounded-sm bg-white/15" />no data</span>
            </>
          ) : (
            <>
              <span className="t-micro whitespace-nowrap">explained</span>
              <div className="w-24 h-2 rounded-full shrink-0"
                   style={{ background: "linear-gradient(90deg, rgb(70,76,92) 0%, rgb(232,93,74) 100%)" }} />
              <span className="t-micro whitespace-nowrap">gap the population does not explain</span>
            </>
          )}
        </div>
      )}

      {path && sel ? (
        <div className="absolute right-4 top-[72px]">
          <RegionCard p={path} gaps={gaps} active={key} onPick={setKey} onClose={() => setSel(null)} prog={prog} onProg={pickProg} />
        </div>
      ) : (
        <BriefPanel briefProg={briefProg} prog={prog} onProg={pickProg}
                    focus={focus} onFocus={setFocus} onOpen={setSel} error={briefErr} />
      )}
    </main>
  );
}
