"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import RegionCard, { Src } from "@/components/RegionCard";
import Guided from "@/components/Guided";
import Analyst from "@/components/Analyst";
import Tour, { type TourStep } from "@/components/Tour";
import { Skel, StepNo, Tag } from "@/components/ui";
import { engineName, fmt, getBrief, getGap, getGeo, getMeta, getPathway, getValues,
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
    where: "Finland invites people to free cancer screening, aiming for 80 % attendance. Some counties fall short — this tool shows where, why, and what the national roadmap says to do.",
    action: "Click Next to walk the interface, or Skip to explore on your own.",
    takeaway: "Every number on screen carries a source tag: DATA, SIMULATION or ROADMAP." },
  { target: "map", location: "Map · Finland", title: "Real attendance first",
    where: "Every county is coloured by its real screening attendance from THL Sotkanet — darker red means further from the national target.",
    action: "Click any county to pick it; the map zooms in and the story column follows.",
    takeaway: "Nothing on this map is invented — hover a county to see the source." },
  { target: "dots", location: "Story · Steps 1–4", title: "Four short steps",
    where: "One county at a time: where the gap is, why it exists, what would help, and what happens after screening (care queues, survival — Goal 3).",
    action: "Use Next and Back at the bottom; the current step is the bright dot.",
    takeaway: "Step 3 needs an explicit Run — simulated results only appear when you ask for them." },
  { target: "prog", location: "Story · Programme", title: "Two screening programmes",
    where: "Mammography invitations for breast cancer, or the colorectal home test posted to people's homes.",
    action: "Switch the programme to see which counties struggle with each.",
    takeaway: "Cervical screening is left out deliberately — most of it happens outside the public programme." },
  { target: "ranking", location: "Story · Biggest gaps", title: "Counties furthest from target",
    where: "The counties furthest from the 80 % target, with the number of people missing per year.",
    action: "Click a row — or the county on the map — to choose where to look.",
    takeaway: "Missing-per-year counts real people, not just percentage points." },
  { target: "chips", location: "Story · Evidence tags", title: "Three kinds of evidence",
    where: "Grey DATA = public statistics with a source link. Blue SIMULATION = residents simulated with the Gemini Decisions API, checked against real rates. Yellow ROADMAP = numbered actions from the national roadmap.",
    action: "Watch the tags — they tell you which kind of evidence each number is.",
    takeaway: "Simulation is labelled and validated, never passed off as observed data." },
  { target: "next", location: "Story · Start", title: "Start with step 1",
    where: "The story column on the left drives the map: click through Where → Why → What → Pathway.",
    action: "Press Next — or click a county on the map first.",
    takeaway: "The ? button always shows a tour of the step you're on." },
];

// Step 2 — "Why?": decomposition (data) + simulated residents (simulation)
const TOUR_2: TourStep[] = [
  { title: "Step 2 · Why does the gap exist?",
    where: "Two answers side by side: statistics on who lives here, and simulated residents who say what stops them.",
    action: "Click Next to walk this step's parts.",
    takeaway: "The decomposition is plain regression on 291 municipalities — no AI." },
  { target: "s2-split", location: "Story · Split", title: "Population or services?",
    where: "The county's gap split in two: how much the people who live here explain (language, education, age), and how much is left unexplained — where services could matter.",
    action: "Hover the bars — the grey range is the 90 % uncertainty interval.",
    takeaway: "Unexplained ≠ proven service failure — it's what's left after composition." },
  { target: "s2-ask", location: "Story · Simulated residents", title: "Ask the residents",
    where: "Simulated resident types rebuilt from Statistics Finland tables — the Gemini Decisions API judges whether each would attend and what blocks them.",
    action: "Click the button — nothing is computed until you ask.",
    takeaway: "Answers are validated against real county rates and labelled SIMULATION." },
  { target: "map", location: "Map · Resident dots", title: "One dot, one hundred people",
    where: "Each simulated resident rains onto the map: green will attend, rose won't. They appear one by one, matched to real municipalities.",
    action: "Click any dot to see that resident's traits — and the exact question the engine was asked.",
    takeaway: "Positions are stable — in step 3 the same people just change their answer." },
  { target: "s2-groups", location: "Story · Results", title: "Who skips, and why",
    where: "After the run: the three groups most likely to skip and the barrier chart — the reasons residents give (language, time, fear…).",
    action: "Compare the barriers with the interventions in the next step — they're matched.",
    takeaway: "In Helsinki the top barrier is language — the Cancer Registry confirms it independently." },
  { target: "next", location: "Story · Start", title: "On to step 3",
    where: "You've seen where the gap is and who is behind it.",
    action: "Press Next — pick interventions and re-ask the residents.",
    takeaway: "The ? button always shows a tour of the step you're on." },
];

// Step 3 — "What would help?": interventions → residents answer again → roadmap citations
const TOUR_3: TourStep[] = [
  { title: "Step 3 · What would help?",
    where: "Pick roadmap-backed interventions, re-ask the simulated residents, and see the upper-bound effect — as a range across two engines.",
    action: "Click Next to walk this step's parts.",
    takeaway: "We show a range, not one number — the models disagree on size, not on order." },
  { target: "s3-interv", location: "Story · Interventions", title: "Roadmap-backed options",
    where: "Each chip is an intervention; the small code (1.3.1 · p.33) is the matching action in the national implementation plan.",
    action: "Select one or combine several — try Own language first for Helsinki.",
    takeaway: "The Decisions API matched each intervention to the roadmap text and scored the fit." },
  { target: "s3-run", location: "Story · Run", title: "Re-ask the residents",
    where: "The same simulated residents answer again with the intervention in place — dots rain in, then flip colour as answers change.",
    action: "Click Run simulation and watch the map.",
    takeaway: "Nothing pre-computed is shown before you run it — it's your simulation." },
  { target: "map", location: "Map · Flipping dots", title: "Same people, new answer",
    where: "Rose dots turn green as resident types change their answer under the intervention — positions never move.",
    action: "Click a dot that flipped to see what changed its mind.",
    takeaway: "Flips happen gradually, in step with the resident count on the left." },
  { target: "s3-result", location: "Story · Result", title: "Range, citations, history",
    where: "The effect as a people-per-year range across two engines, each intervention's roadmap actions scored ●●●/●●, and the TRIED list of your runs.",
    action: "Try another combination — TRIED keeps your runs to compare.",
    takeaway: "It's a simulated upper bound, not a forecast — a pilot measures the real effect." },
  { target: "next", location: "Story · Start", title: "On to step 4",
    where: "Screening is only the first step — the gap can continue into queues and survival.",
    action: "Press Next for the rest of the pathway (Goal 3).",
    takeaway: "The ? button always shows a tour of the step you're on." },
];

// Step 4 — "Rest of the pathway": stages, engine pick, hero, queue movie
const TOUR_4: TourStep[] = [
  { title: "Step 4 · The rest of the pathway",
    where: "Screening is step one — after it come referral, diagnosis, treatment and survival. This is where Goal 3 lives: equal and effective care.",
    action: "Click Next to walk this step's parts.",
    takeaway: "Everything here is public THL data — except the engine's stage pick, labelled SIMULATION." },
  { target: "s4-strip", location: "Story · Pathway", title: "Five stages, 100 dots each",
    where: "Each stage shows a waffle of 100 dots filling in: green stay on track, rose drop out, dim means no public data. Status words sit underneath (worse / close / better / no data).",
    action: "Click a stage to swap the card below.",
    takeaway: "Each stage is measured on its own cohort — the columns don't multiply into one funnel." },
  { target: "s4-focus", location: "Story · Engine pick", title: "Where Gemini would start",
    where: "The Decisions API reads this county's real stage numbers and picks which stage to fix first — the ◂ marker on the strip.",
    action: "Switch counties in the chips below and watch the pick move.",
    takeaway: "It's a prioritisation aid ranked from real numbers, not a diagnosis — labelled SIMULATION." },
  { target: "s4-hero", location: "Story · Hero number", title: "The stage's headline",
    where: "The selected stage's key indicator counts up next to Finland's value, its status tag, target and rank — with n warnings when numbers are small.",
    action: "Click Referral or Treatment — the number re-counts for that stage.",
    takeaway: "n = 8 style warnings flag small denominators — noisy data is shown, not hidden." },
  { target: "s4-queue", location: "Story · Queue movie", title: "Queues, month by month",
    where: "On Referral or Treatment a timeline plays monthly THL queue data — press ▶ and watch the county's month move, or the map re-colours per month.",
    action: "Pick the Treatment stage and press ▶ Play.",
    takeaway: "Satakunta's 37.5 % is only 8 patients — the app says so out loud." },
  { target: "map", location: "Map · Choropleth", title: "All Finland, all months",
    where: "The map colours every county by the selected indicator — and during the queue movie it re-colours month by month.",
    action: "Click 'Longest oncology queues' chips to jump between counties.",
    takeaway: "This step is why the demo exists — Goal 3 means the whole pathway, not just screening." },
];

// One continuous walkthrough: each tour step carries goStep so Next advances the app itself.
// Tail "press Next" cards are dropped — the tour does the moving.
const seg = (arr: TourStep[], step: number) => arr.slice(0, -1).map((s) => ({ ...s, goStep: step }));
const TOUR_ALL: TourStep[] = [
  ...seg(TOUR, 1), ...seg(TOUR_2, 2), ...seg(TOUR_3, 3), ...seg(TOUR_4, 4),
  { goStep: 4, title: "That's the whole story",
    where: "Where the gap is, who is behind it, what would help, and what happens after screening — Goal 3 end to end.",
    action: "Generate report in the top bar writes it up as slides; Ask the analyst answers with the same data.",
    takeaway: "Every claim keeps its tag: DATA, SIMULATION or ROADMAP." },
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
  const [reportRuns, setReportRuns] = useState<string[]>([]);                        // "prog:code:scen+scen" combos run in step 3 this session
  const [visited, setVisited] = useState<string[]>([]);                              // "prog:code" counties clicked in the guided flow

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

  // every change of context (county, programme, step) clears the live simulation overlay; the crowd
  // (and its camera focus) survives between steps 2 and 3 so the map stays on the county, and is
  // cleared leaving the sim steps — the map flies back to Finland once.
  const goStep = (n: number) => { setStep(n); setLive(null); setTl(null); setPreRun(null);
                                  setSeen((s) => (s.includes(n) ? s : [...s, n]));
                                  if (n === 1 || n === 4) setCrowd(null); };
  const pickProg = (p: Prog) => { setProg(p); setPicked(null); setPathKey(null); setLive(null); setCrowd(null);
                                  setTl(null); setPreRun(null); setStep(1); setSeen([1]); };
  const markVisited = (p: string, c: string) =>
    setVisited((v) => (v.includes(`${p}:${c}`) ? v : [...v, `${p}:${c}`]));
  const pickCode = (c: string) => { setPicked(c); setLive(null); setPathKey(null); setCrowd(null); setTl(null); setPreRun(null);
                                    markVisited(prog, c); };
  const explore = () => { setMode("explore"); setLive(null); setTl(null); setCrowd(null); };
  const guided = () => { setMode("guided"); setSel(null); setLive(null); setTl(null); setPreRun(null); setCrowd(null); };
  const explain = (c: string) => { setPicked(c); setSel(null); setMode("guided"); setLive(null); setTl(null);
                                   setCrowd(null); setPreRun(null); setStep(2); setSeen([1, 2]); markVisited(prog, c); };
  // ? opens one continuous walkthrough — the tour drives the guided steps; opening mid-flow
  // resumes at the section for the step you're on
  const restartTour = () => setTour(true);
  const tourStart = mode === "guided" ? Math.max(0, TOUR_ALL.findIndex((t) => t.goStep === step)) : 0;
  const tourGo = useCallback((st: TourStep) => {
    if (!st.goStep) return;
    if (mode !== "guided") { setMode("guided"); setSel(null); setLive(null); setTl(null); setCrowd(null); setPreRun(null); }
    setStep(st.goStep);
    setSeen((s) => Array.from(new Set([...s, st.goStep!])).sort());
  }, [mode]);
  const tourDone = () => { setTour(false); localStorage.setItem("ec_tour_done", "1"); };
  // analyst drawer actions: jump into the guided story at the answered county
  const showInStory = (f: { prog: string; code: string }) => {
    setProg(f.prog as Prog); setPicked(f.code); setSel(null); setMode("guided");
    setLive(null); setCrowd(null); setTl(null); setPreRun(null); setStep(2); setSeen([1, 2]); setAsk(false);
    markVisited(f.prog, f.code);
  };
  const playRun = (r: { prog: string; code: string; scenarios: string[] }) => {
    setProg(r.prog as Prog); setPicked(r.code); setSel(null); setMode("guided");
    setLive(null); setCrowd(null); setTl(null); setStep(3); setSeen([1, 2, 3]);
    markVisited(r.prog, r.code);
    setPreRun({ scenarios: r.scenarios, key: Date.now() }); setAsk(false);
  };

  const activeStage = ind?.stage;
  const liveName = live ? county?.values[live.code]?.name ?? live.code : null;
  const addReportRun = (item: string) => setReportRuns((r) => (r.includes(item) ? r : [...r, item]));
  // /report entry point: the current guided county first, then every step-3 combo run this session,
  // then the other counties clicked along the way — all deduped (a combo already covers its county)
  const reportHref = (() => {
    if (mode !== "guided" || !code) return null;
    const cur = `${prog}:${code}`;
    const runs = reportRuns.filter((x) => x !== cur);
    const runKeys = new Set(runs.map((x) => x.split(":").slice(0, 2).join(":")));
    const counties = visited.filter((x) => x !== cur && !runKeys.has(x));
    return `/report?items=${[...new Set([cur, ...runs, ...counties])].slice(0, 6).join(",")}`;
  })();

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
          {reportHref && <a href={reportHref} className="tag tag-data">Generate report</a>}
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
                  onStep={goStep} onCode={pickCode} onProg={pickProg}
                  onInd={setPathKey} onLive={setLive} onTl={setTl}
                  munis={geo.municipality} crowd={crowd} onCrowd={setCrowd} preRun={preRun}
                  reportHref={reportHref} onRanCombo={addReportRun} />
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

      {/* map legend — centred in the free area right of the column, bounded so it never leaves the viewport */}
      {shown && (
        <div className="absolute bottom-4 left-[472px] right-4 flex justify-center pointer-events-none">
          <div className="glass px-4 py-2 flex items-center gap-3 min-w-0 overflow-hidden">
          <span className="t-caption font-semibold text-white/85 whitespace-nowrap max-w-[300px] truncate">
            {live ? `Simulated attendance · ${liveName}` : (ind?.short ?? shown.label)}
            {crowd ? ` · Simulation · ${engineName(crowd.engine) ?? crowd.engine}` : ""}</span>
          <span className="t-micro whitespace-nowrap">worse</span>
          <div className="w-24 h-2 rounded-full shrink-0"
               style={{ background: "linear-gradient(90deg, rgb(232,93,74) 0%, rgb(70,76,92) 50%, rgb(72,196,160) 100%)" }} />
          <span className="t-micro whitespace-nowrap">better</span>
          {shown.national != null && <span className="t-micro whitespace-nowrap">· Finland {fmt(shown.national, shown.unit)}</span>}
          <span className="t-micro whitespace-nowrap flex items-center gap-1">
            <i className="inline-block w-2.5 h-2.5 rounded-sm bg-white/15" />no data</span>
          {crowd && (
            <span className="t-micro whitespace-nowrap flex items-center gap-1.5 border-l border-white/15 pl-3">
              <i className="inline-block w-2 h-2 rounded-full" style={{ background: "#4ade80" }} />takes part
              <i className="inline-block w-2 h-2 rounded-full ml-1.5" style={{ background: "#f87171" }} />skips
              <span className="ml-1">1 dot ≈ {crowd.perDot}</span>
            </span>
          )}
          </div>
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

      {tour && <Tour steps={TOUR_ALL} startAt={tourStart} onActivate={tourGo} onDone={tourDone} />}
    </main>
  );
}
