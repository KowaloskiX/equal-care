"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import RegionCard, { Src } from "@/components/RegionCard";
import Guided from "@/components/Guided";
import Analyst from "@/components/Analyst";
import Tour, { type TourStep } from "@/components/Tour";
import { Skel, StepNo, Tag } from "@/components/ui";
import { fmt, getBrief, getGap, getGeo, getMeta, getPathway, getValues,
         type Brief, type FC, type Gap, type Meta, type Pathway, type Values } from "@/lib/api";
import type { Crowd } from "@/lib/dots";

const ChoroplethMap = dynamic(() => import("@/components/ChoroplethMap"), { ssr: false });
const SCREENING = ["screen_breast", "screen_cervix", "screen_bowel"];
type Prog = "breast" | "bowel";
const PROG_KEY: Record<Prog, string> = { breast: "screen_breast", bowel: "screen_bowel" };
type Mode = "guided" | "explore";

// the care-pathway stepper — "diagnosis" has no public county indicator, and that is a finding in itself
const STEPS = [
  { n: 1, stage: "detection", label: "Detection", q: "Do people come to screening?" },
  { n: 2, stage: "referral", label: "Referral", q: "Do they reach a specialist in time?" },
  { n: 3, stage: "diagnosis", label: "Diagnosis", q: "Is the cancer found early?" },
  { n: 4, stage: "treatment", label: "Treatment", q: "Does treatment start in time?" },
  { n: 5, stage: "outcome", label: "Outcome", q: "How does it end?" },
];

const TOUR: TourStep[] = [
  { title: "Equal Care Finland",
    body: "Finland invites people to free cancer screening, with a national attendance target. Some counties fall short. This tool shows where, why, and what the national roadmap says to do." },
  { target: "dots", title: "Four short steps",
    body: "One county at a time: where the gap is, why, what would help, and the rest of the care pathway. Use Next and Back." },
  { target: "prog", title: "Two screening programmes",
    body: "Pick a programme: mammography for breast cancer, or the colorectal home test posted to people's homes." },
  { target: "ranking", title: "Real public data",
    body: "The counties furthest from the target. Click a row — or a county on the map — to pick one." },
  { target: "chips", title: "Three kinds of evidence",
    body: "Grey DATA = public statistics with a source link. Blue SIMULATION = residents simulated with Jev, checked against real county rates. Yellow ROADMAP = numbered actions from the national cancer strategy roadmap." },
  { target: "map", title: "The map follows",
    body: "Real attendance first, then the chosen county lights up live while its simulated residents answer." },
  { target: "next", title: "Start here", body: "Step through the story — or jump to the map anytime." },
];

export default function Home() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [geo, setGeo] = useState<{ county: FC | null; municipality: FC | null }>({ county: null, municipality: null });
  const [county, setCounty] = useState<Values | null>(null);
  const [muni, setMuni] = useState<{ county: string; vals: Values | null }>({ county: "", vals: null });
  const [sel, setSel] = useState<string | null>(null);            // county card (explore mode)
  const [path, setPath] = useState<Pathway | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [briefErr, setBriefErr] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [tour, setTour] = useState(false);

  const [mode, setMode] = useState<Mode>("guided");
  const [step, setStep] = useState(1);
  const [seen, setSeen] = useState<number[]>([1]);               // visited dots are clickable
  const [prog, setProg] = useState<Prog>("breast");
  const [picked, setPicked] = useState<string | null>(null);     // guided: the ONE county (null → brief's first)
  const [pathKey, setPathKey] = useState<string | null>(null);   // guided step 4: which indicator colours the map
  const [key, setKey] = useState("screen_breast");               // explore: which indicator colours the map
  const [live, setLive] = useState<{ code: string; value: number } | null>(null);   // replay's running sim rate
  const [crowd, setCrowd] = useState<Crowd | null>(null);                           // simulated residents as map dots
  const [tl, setTl] = useState<Values | null>(null);                                // step-4 queue time-lapse month
  const [ask, setAsk] = useState(false);                                            // analyst drawer
  const [preRun, setPreRun] = useState<{ scenarios: string[]; key: number } | null>(null);

  useEffect(() => {
    getMeta().then(setMeta).catch((e) => setErr(String(e)));
    Promise.all([getGeo("county"), getGeo("municipality")]).then(([c, m]) => setGeo({ county: c, municipality: m })).catch((e) => setErr(String(e)));
    getBrief(undefined, 5).then(setBrief).catch(() => setBriefErr(true));
    const raf = requestAnimationFrame(() => { if (!localStorage.getItem("ec_tour_done")) setTour(true); });
    return () => cancelAnimationFrame(raf);
  }, []);

  const briefProg = brief?.programmes.find((p) => p.programme === prog);
  const code = picked ?? briefProg?.counties[0]?.code ?? null;   // guided county, defaults to the brief's first row

  const shownKey = mode === "guided" ? (step === 4 && pathKey ? pathKey : PROG_KEY[prog]) : key;
  useEffect(() => { getValues(shownKey).then(setCounty).catch((e) => setErr(String(e))); }, [shownKey]);
  useEffect(() => {
    if (!sel) return;
    getPathway(sel).then(setPath);
    Promise.all(SCREENING.map((k) => getGap(k, sel))).then((g) => setGaps(g.filter(Boolean) as Gap[]));
  }, [sel]);
  useEffect(() => {
    if (sel && mode === "explore") getValues(shownKey, "municipality", sel)
      .then((v) => setMuni({ county: sel, vals: Object.keys(v.values).length ? v : null }))
      .catch(() => setMuni({ county: sel, vals: null }));
  }, [shownKey, sel, mode]);

  const ind = meta?.indicators.find((i) => i.key === shownKey);
  const shown = tl ?? county;                                  // time-lapse months override the yearly choropleth
  const ranked = useMemo(() => {
    if (!shown) return [];
    const xs = Object.entries(shown.values).map(([c, v]) => ({ code: c, ...v }));
    const better = shown.higher_is_better ?? true;
    return xs.sort((a, b) => (better ? a.value - b.value : b.value - a.value));   // worst first
  }, [shown]);

  // every change of context (county, programme, step) clears the live simulation overlay
  const goStep = (n: number) => { setStep(n); setLive(null); setTl(null); setPreRun(null);
                                  setSeen((s) => (s.includes(n) ? s : [...s, n]));
                                  if (n === 1) setCrowd(null); };
  const pickProg = (p: Prog) => { setProg(p); setPicked(null); setPathKey(null); setLive(null); setCrowd(null);
                                  setTl(null); setPreRun(null); setStep(1); setSeen([1]); };
  const pickCode = (c: string) => { setPicked(c); setLive(null); setPathKey(null); setCrowd(null); setTl(null); setPreRun(null); };
  const explore = () => { setMode("explore"); setLive(null); setTl(null); };
  const guided = () => { setMode("guided"); setSel(null); setLive(null); setTl(null); setPreRun(null); };
  const explain = (c: string) => { setPicked(c); setSel(null); setMode("guided"); setLive(null); setTl(null);
                                   setPreRun(null); setStep(2); setSeen([1, 2]); };
  const restartTour = () => { guided(); setStep(1); setSeen([1]); setPreRun(null); setTour(true); };
  const tourDone = () => { setTour(false); localStorage.setItem("ec_tour_done", "1"); };
  // analyst drawer actions: jump into the guided story at the answered county
  const showInStory = (f: { prog: string; code: string }) => {
    setProg(f.prog as Prog); setPicked(f.code); setSel(null); setMode("guided");
    setLive(null); setCrowd(null); setTl(null); setPreRun(null); setStep(2); setSeen([1, 2]); setAsk(false);
  };
  const playRun = (r: { prog: string; code: string; scenarios: string[] }) => {
    setProg(r.prog as Prog); setPicked(r.code); setSel(null); setMode("guided");
    setLive(null); setCrowd(null); setTl(null); setStep(3); setSeen([1, 2, 3]);
    setPreRun({ scenarios: r.scenarios, key: Date.now() }); setAsk(false);
  };

  const activeStage = ind?.stage;
  const liveName = live ? county?.values[live.code]?.name ?? live.code : null;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0" data-tour="map">
        <ChoroplethMap counties={geo.county} municipalities={geo.municipality} county={shown}
                       muni={sel === muni.county && mode === "explore" ? muni.vals : null}
                       selected={mode === "guided" ? code : sel}
                       onSelect={(c) => (mode === "guided" ? (c ? pickCode(c) : null) : setSel(c))}
                       live={live} crowd={crowd} />
      </div>

      {/* top bar */}
      <header className="absolute left-4 right-4 top-3 glass px-4 h-[52px] flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="t-panel whitespace-nowrap">Equal Care Finland</span>
          <span className="t-caption truncate hidden md:block">Where cancer care falls behind, and what each county can do</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setAsk((a) => !a)} className="tag tag-sim">Ask the analyst</button>
          <button onClick={restartTour} title="Show me around"
                  className="tag tag-data w-6 h-6 justify-center !px-0">?</button>
          {mode === "guided"
            ? <button onClick={explore} className="tag tag-data">Explore all indicators</button>
            : <button onClick={guided} className="tag tag-data">← Guided story</button>}
          <a href="/story" className="tag tag-data">Story ▸</a>
        </div>
      </header>

      {/* left column: the guided story, or the whole care pathway in explore mode */}
      <div className="absolute left-4 top-[72px] bottom-4 w-[440px] glass p-4 flex flex-col min-h-0">
        {mode === "guided" && code ? (
          <Guided prog={prog} code={code} step={step} seen={seen} briefProg={briefProg}
                  activeInd={step === 4 ? pathKey : null}
                  onStep={goStep} onCode={pickCode} onProg={pickProg} onExplore={explore}
                  onInd={setPathKey} onLive={setLive} onTl={setTl}
                  munis={geo.municipality} crowd={crowd} onCrowd={setCrowd} preRun={preRun} />
        ) : mode === "guided" ? (
          briefErr
            ? <div className="t-body text-rose-300 mt-4">Can&apos;t reach the data API — start it with <code className="text-rose-200">make app</code>.</div>
            : <div className="mt-3 space-y-2"><Skel className="h-5 w-2/3" /><Skel className="h-28" /><Skel className="h-20" /></div>
        ) : (
          <>
            <div className="t-panel">Care pathway</div>
            {err && <p className="t-body text-rose-300 mt-2">API: {err}. Is <code>make app</code> running?</p>}
            {!meta ? <div className="mt-3 space-y-2"><Skel className="h-8" /><Skel className="h-8" /><Skel className="h-8" /></div> : (
              <div className="mt-3 flex-1 overflow-y-auto min-h-0 pr-1">
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
          </>
        )}
      </div>

      {/* map legend — centred in the free area right of the column */}
      {shown && (
        <div className="absolute bottom-4 left-[calc(50%+236px)] -translate-x-1/2 glass px-4 py-2 flex items-center gap-3 pointer-events-none">
          <span className="t-caption font-semibold text-white/85 whitespace-nowrap max-w-[260px] truncate">
            {live ? `Simulated attendance · ${liveName}` : (ind?.short ?? shown.label)}</span>
          <span className="t-micro whitespace-nowrap">worse</span>
          <div className="w-24 h-2 rounded-full shrink-0"
               style={{ background: "linear-gradient(90deg, rgb(232,93,74) 0%, rgb(70,76,92) 50%, rgb(72,196,160) 100%)" }} />
          <span className="t-micro whitespace-nowrap">better</span>
          {shown.national != null && <span className="t-micro whitespace-nowrap">· Finland {fmt(shown.national, shown.unit)}</span>}
          <span className="t-micro whitespace-nowrap flex items-center gap-1">
            <i className="inline-block w-2.5 h-2.5 rounded-sm bg-white/15" />no data</span>
        </div>
      )}

      {mode === "explore" && path && sel && (
        <div className="absolute right-4 top-[72px]">
          <RegionCard p={path} gaps={gaps} active={shownKey}
                      onPick={setKey} onClose={() => setSel(null)} prog={prog} onExplain={explain} />
        </div>
      )}

      {ask && (
        <Analyst prog={mode === "guided" ? prog : null}
                 code={mode === "guided" ? code : sel}
                 countyName={(c) => county?.values[c]?.name ?? c}
                 onShow={showInStory} onPlay={playRun} onClose={() => setAsk(false)} />
      )}

      {tour && <Tour steps={TOUR} onDone={tourDone} />}
    </main>
  );
}
