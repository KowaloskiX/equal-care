"use client";
// Guided story: one county, one programme, one question per step (Back/Next). Steps 2–3 replay
// the recorded engine answers — no simulated numbers before the user clicks Run (see SimReplay).
import { useEffect, useMemo, useState } from "react";
import { engineName, fmt, getFocus, getGap, getPathway, getRecommend, getValues,
         type Brief, type FC, type Focus, type Gap, type Pathway, type PathwayItem, type Recommend, type Values } from "@/lib/api";
import type { Crowd } from "@/lib/dots";
import { axisPos, BaselineStep, ScenarioStep } from "@/components/SimReplay";
import QueueLapse from "@/components/QueueLapse";
import FlowDots, { CountUp } from "@/components/PathwayFlow";
import { Assumption, Cite, DataChip, people, RoadmapChip, SimChip } from "@/components/RecommendBlock";
import { Row, Src, STAGE_LABEL, STAGE_QUESTION } from "@/components/RegionCard";
import { Seg, Skel, Tag } from "@/components/ui";

const PROGS = [
  { id: "breast", label: "Breast · mammography" },
  { id: "bowel", label: "Colorectal · home test" },
] as const;
type Prog = (typeof PROGS)[number]["id"];
const PROG_KEY: Record<Prog, string> = { breast: "screen_breast", bowel: "screen_bowel" };
const TITLES = ["Where is the gap?", "Why?", "What would help?", "Rest of the pathway"];
const NEXT_T = ["Why?", "What would help?", "Rest of the pathway"];

function Chip({ step, eng, src }: { step: number; eng: string | null; src?: Parameters<typeof DataChip>[0]["s"] }) {
  if (step === 4) return <><DataChip s={src} /><span title="equal and effective care"><Tag v="goal3"><i>GOAL 3</i></Tag></span></>;
  if (step === 1) return <DataChip s={src} />;
  if (step === 2) return <><DataChip s={src} /><SimChip eng={eng} /></>;
  return <><SimChip eng={eng} /><RoadmapChip /></>;
}

export default function Guided({ prog, code, step, seen, briefProg, activeInd,
                                 onStep, onCode, onProg, onInd, onLive,
                                 munis, crowd, onCrowd, preRun, onTl, reportHref, onRanCombo }: {
  prog: Prog; code: string; step: number; seen: number[]; briefProg?: Brief["programmes"][number];
  activeInd: string | null;
  onStep: (n: number) => void; onCode: (c: string) => void; onProg: (p: Prog) => void;
  onInd: (k: string | null) => void;
  onTl?: (v: Values | null) => void;         // step 4: monthly queue values driving the choropleth
  onLive?: (v: { code: string; value: number } | null) => void;
  munis?: FC | null;
  crowd?: Crowd | null;
  onCrowd?: (c: Crowd | null | ((p: Crowd | null) => Crowd | null)) => void;
  preRun?: { scenarios: string[]; key: number } | null;   // analyst drawer: preselect + auto-run
  reportHref?: string | null;                           // /report?items=… for this county + session combos
  onRanCombo?: (item: string) => void;                  // step 3 records each combo it runs
}) {
  const who = people(prog);
  const counties = useMemo(() => briefProg?.counties ?? [], [briefProg]);
  const [rec, setRec] = useState<Recommend | null>(null);
  const [path, setPath] = useState<Pathway | null>(null);
  const [pick, setPick] = useState<Gap | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let on = true;
    getRecommend(prog, code).then((r) => on && setRec(r)).catch(() => on && setErr(true));
    getPathway(code).then((p) => on && setPath(p)).catch(() => on && setPath(null));
    return () => { on = false; };
  }, [prog, code]);

  const inTop = counties.some((c) => c.code === code);
  useEffect(() => {
    if (inTop) return;                                   // "Your pick" row only when the choice is outside the top 5
    let on = true;
    getGap(PROG_KEY[prog], code).then((g) => on && setPick(g));
    return () => { on = false; };
  }, [prog, code, inTop]);

  const recF = rec && rec.code === code && rec.programme === prog ? rec : null;
  const pathF = path && path.code === code ? path : null;
  const pickF = !inTop && pick && pick.code === code ? pick : null;
  const eng = engineName(recF?.sim_split?.validation?.engine ?? recF?.split.validation?.engine)
    ?? engineName(briefProg?.note?.replace("Simulation · ", ""));
  const target = briefProg?.target ?? pickF?.target ?? 80;
  const national = briefProg?.national;
  const name = recF?.name ?? pathF?.name ?? counties.find((c) => c.code === code)?.name ?? pickF?.name ?? code;

  // step-1 headline numbers come only from the API (brief row, else the county's /api/gap)
  const topRow = counties.find((c) => c.code === code);
  const rate = topRow?.screening?.rate ?? pickF?.rate ?? null;
  const missing = topRow?.screening?.missing_per_year ?? pickF?.missing_per_year ?? null;

  if (err) {
    return <div className="t-body text-rose-300 mt-4">Can&apos;t reach the data API — start it with <code className="text-rose-200">make app</code>.</div>;
  }

  const bar = (r: { code: string; name: string; rate: number | null | undefined; missing: number | null | undefined }, hi: boolean, extra?: string) => (
    <button key={r.code} onClick={() => onCode(r.code)}
            className={`grid w-full grid-cols-[128px_1fr_44px_84px] gap-x-2 items-center rounded px-1.5 py-1 text-left
              ${hi ? "rowsel" : "hover:bg-white/5"}`}>
      <span className={`text-[11.5px] truncate ${hi ? "text-white font-medium" : "text-white/70"}`} title={r.name}>
        {extra ?? r.name}
      </span>
      <span className="relative h-2.5 rounded-full bg-white/5">
        <span className={`absolute inset-y-0 left-0 rounded-full ${hi ? "bg-white/70" : "bg-rose-400/55"}`}
              style={{ width: `${r.rate != null ? axisPos(r.rate) : 0}%` }} />
      </span>
      <span className="text-right text-[10px] tabular-nums text-white/60">{r.rate != null ? fmt(r.rate, "%") : "–"}</span>
      <span className="text-right text-[10px] tabular-nums text-white/60">
        {r.missing != null ? <>{fmt(r.missing)} <span className="text-white/35">/ yr</span></> : "–"}
      </span>
    </button>
  );

  return (
    <>
      {/* progress header: step dots (visited are clickable) + the step's data/simulation/roadmap chip */}
      <div className="flex items-center justify-between gap-2" data-tour="dots">
        <div className="t-caption">Step {step} of 4 · <span className="text-white/75">{TITLES[step - 1]}</span></div>
        <div className="flex items-center gap-1.5">
          {TITLES.map((t, i) => (
            <button key={t} title={t} disabled={!seen.includes(i + 1)} onClick={() => onStep(i + 1)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i + 1 === step ? "bg-sky-300" : seen.includes(i + 1) ? "bg-white/40 hover:bg-white/70" : "bg-white/15"}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-1.5">
        <div className="t-caption min-w-0 leading-tight">{PROGS.find((p) => p.id === prog)?.label} · <span className="text-white/75">{name}</span></div>
        <div className="flex gap-1 shrink-0" data-tour="chips"><Chip step={step} eng={eng} src={counties[0]?.screening?.source} /></div>
      </div>

      <div className="mt-1 flex-1 overflow-y-auto min-h-0 pr-1">
        {step === 1 && (
          <div className="mt-2">
            <div data-tour="prog"><Seg options={PROGS} value={prog} onChange={onProg} /></div>
            {rate != null && missing != null ? (
              <p className="t-body text-white/75 mt-2.5 leading-snug">
                {name}: {fmt(rate, "%")} of invited {who} attend —{" "}
                {missing > 0
                  ? <>about {fmt(missing)} {who} a year short of the {fmt(target, "%")} target.</>
                  : <>meets the {fmt(target, "%")} target.</>}
              </p>
            ) : <Skel className="h-8 mt-2.5" />}
            {!counties.length ? <Skel className="h-28 mt-2" /> : (
              <>
                <div className="t-caption mt-3 mb-1">Counties furthest from the {fmt(target, "%")} target</div>
                <div className="relative" data-tour="ranking">
                  <div className="space-y-1">
                    {counties.map((c) => bar({ code: c.code, name: c.name, rate: c.screening?.rate,
                                              missing: c.screening?.missing_per_year }, c.code === code))}
                    {pickF && bar({ code: pickF.code, name: pickF.name, rate: pickF.rate,
                                   missing: pickF.missing_per_year }, true, `${pickF.name} · your pick`)}
                  </div>
                  <div className="absolute inset-y-0 pointer-events-none"
                       style={{ left: "calc(128px + 8px)", right: "calc(84px + 8px + 44px + 8px)" }}>
                    {target != null && <div className="absolute inset-y-0 border-l border-dashed border-amber-300/70" style={{ left: `${axisPos(target)}%` }} />}
                    {national != null && <div className="absolute inset-y-0 border-l border-white/40" style={{ left: `${axisPos(national)}%` }} />}
                  </div>
                </div>
                <div className="t-micro mt-1 flex items-center gap-3">
                  {target != null && <span><span className="text-amber-300/80">┆</span> target {fmt(target, "%")}</span>}
                  {national != null && <span><span className="text-white/50">│</span> Finland {fmt(national, "%")}</span>}
                  <span className="ml-auto">attendance · {who} missing / yr</span>
                </div>
              </>
            )}
            {recF?.survival && (
              <p className="text-[11.5px] text-white/60 mt-2">
                <Tag v="goal3"><i>GOAL 3</i></Tag>{" "}
                5-year survival {fmt(recF.survival.value, "%")} (Finland {fmt(recF.survival.national, "%")})
              </p>
            )}
            <p className="t-caption mt-2 text-white/50">Click a row — or a county on the map — to choose where to look.</p>
          </div>
        )}

        {step === 2 && (
          <BaselineStep key={`${prog}:${code}`} prog={prog} code={code} rec={recF} who={who} onLive={onLive}
                        munis={munis} crowd={crowd} onCrowd={onCrowd} />
        )}

        {step === 3 && (
          <>
            {!recF ? <Skel className="h-24 mt-2" />
                   : <ScenarioStep key={`${prog}:${code}:${preRun?.key ?? 0}`} prog={prog} code={code} rec={recF} who={who}
                                   onLive={onLive} munis={munis} crowd={crowd} onCrowd={onCrowd}
                                   preselect={preRun?.scenarios} autoRun={!!preRun} onRanCombo={onRanCombo} />}
          </>
        )}

        {step === 4 && (
          <Step4 prog={prog} code={code} path={pathF} rec={recF} activeInd={activeInd}
                 onInd={onInd} onCode={onCode} onTl={onTl} />
        )}
      </div>

      {/* sticky footer — Back / Next (step 4: start over or leave the story) */}
      <div className="border-t border-white/10 pt-2.5 mt-2 flex items-center justify-between gap-2">
        <button onClick={() => onStep(step - 1)} disabled={step === 1}
                className="t-caption text-white/60 hover:text-white disabled:opacity-30">← Back</button>
        {step < 4 ? (
          <button data-tour="next" onClick={() => onStep(step + 1)}
                  className="rounded-lg bg-sky-400/20 border border-sky-300/40 text-sky-200 text-[12px] px-3.5 py-1.5 hover:bg-sky-400/30">
            Next: {NEXT_T[step - 1]} →
          </button>
        ) : (
          <div className="flex items-center gap-3">
            {reportHref && (
              <a href={reportHref} className="t-caption text-white/60 hover:text-white underline decoration-dotted underline-offset-2">
                Generate report
              </a>
            )}
            <button onClick={() => onStep(1)}
                    className="rounded-lg bg-sky-400/20 border border-sky-300/40 text-sky-200 text-[12px] px-3.5 py-1.5 hover:bg-sky-400/30">
              Try another county
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ASSUMPTION: for % indicators a difference under 1 point counts as "close to Finland" — the same
// 1-point threshold recommend.py uses before it attaches a roadmap action.
const close = (it: PathwayItem) => it.unit === "%" && it.delta != null && Math.abs(it.delta) < 1;
const isBehind = (it?: PathwayItem) => it?.worse_than_national === true && !close(it);

type NodeStatus = "worse" | "better" | "close" | "gap";
const NODE_STYLE: Record<NodeStatus, { dot: string; text: string; ring: string }> = {
  worse: { dot: "bg-rose-400",   text: "text-rose-300",    ring: "border-rose-300/60 bg-rose-400/10" },
  better: { dot: "bg-emerald-400", text: "text-emerald-300", ring: "border-emerald-300/50 bg-emerald-400/10" },
  close: { dot: "bg-white/50",   text: "text-white/60",    ring: "border-white/30 bg-white/5" },
  gap:   { dot: "bg-transparent border border-dashed border-white/40", text: "text-white/45",
           ring: "border-dashed border-white/25 bg-transparent" },
};
const STATUS_WORD: Record<NodeStatus, string> = { worse: "worse", better: "better", close: "close", gap: "no data" };
const statusOf = (it: PathwayItem): NodeStatus =>
  it.value == null ? "gap" : isBehind(it) ? "worse" : it.delta === 0 || close(it) ? "close" : "better";

// One-line captions under the hero number, keyed to the pathway indicators — plain wording for the
// slide look; any other key falls back to the indicator's own label.
const CAPTION: Record<string, string> = {
  screen_breast: "of invited women attend screening",
  screen_bowel: "of invited people return the home test",
  wait_6m: "per 10 000 waited over 6 months for specialist care",
  onc_ref_21: "of oncology referrals took over 21 days",
  onc_wait_90: "of oncology patients wait over 90 days",
  surv_breast: "five-year survival, breast cancer",
  surv_cervix: "five-year survival, cervical cancer",
  surv_bowel: "five-year survival, colorectal cancer",
};

// Step 4 — the whole pathway as a 5-node strip + one hero card, like the report's pathway slide.
// The selected node drives the map indicator; queue nodes get a monthly time-lapse, and each node
// shows its roadmap actions as citation chips (stage-tagged server-side).
function Step4({ prog, code, path, rec, activeInd, onInd, onCode, onTl }: {
  prog: Prog; code: string; path: Pathway | null; rec: Recommend | null;
  activeInd: string | null; onInd: (k: string | null) => void; onCode: (c: string) => void;
  onTl?: (v: Values | null) => void;
}) {
  const screenKey = PROG_KEY[prog];
  const outcomeKey = prog === "bowel" ? "surv_bowel" : "surv_breast";
  const NODES = useMemo(() => [
    { id: "detection", keys: [screenKey], mapKey: screenKey as string | null },
    { id: "referral", keys: ["wait_6m", "onc_ref_21"], mapKey: "onc_ref_21" as string | null, queue: "onc_ref_21" as const },
    { id: "diagnosis", keys: [] as string[], mapKey: null as string | null },
    { id: "treatment", keys: ["onc_wait_90"], mapKey: "onc_wait_90" as string | null, queue: "onc_wait_90" as const },
    { id: "outcome", keys: [outcomeKey], mapKey: outcomeKey as string | null },
  ], [screenKey, outcomeKey]);
  const find = (k: string) => path?.indicators.find((i) => i.key === k);
  const status = (keys: string[]): NodeStatus => {
    const its = keys.map(find).filter((i): i is PathwayItem => !!i && i.value != null);
    if (!its.length) return "gap";
    if (its.some(isBehind)) return "worse";
    if (its.some((i) => i.delta !== 0 && !close(i))) return "better";
    return "close";
  };
  const statuses = NODES.map((n) => status(n.keys));
  // share "on track" per 100 people at this stage — display transform of the sourced % indicator;
  // different cohorts per stage, so never multiplied into one number
  const onTrack = (keys: string[]): number | null => {
    const its = keys.map(find).filter((i): i is PathwayItem => !!i && i.value != null && i.unit === "%");
    if (!its.length) return null;
    const v = its[0].value!;
    return its[0].higher_is_better === false ? 100 - v : v;
  };
  // the engine's stage pick — a labelled prioritisation aid, cached server-side
  const [focus, setFocus] = useState<Focus | null>(null);
  useEffect(() => {
    let on = true;
    getFocus(prog, code).then((f) => { if (on) setFocus(f); }).catch(() => null);
    return () => { on = false; };
  }, [prog, code]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {                                                  // new county → default node again (async per lint)
    const t = setTimeout(() => setSel(null), 0);
    return () => clearTimeout(t);
  }, [prog, code]);
  const node = sel ?? NODES[statuses.indexOf("worse")]?.id ?? "treatment";
  const mapKey = NODES.find((n) => n.id === node)?.mapKey ?? null;
  useEffect(() => { onInd(mapKey); }, [node, mapKey]);               // eslint-disable-line react-hooks/exhaustive-deps

  // "Longest oncology queues now" hint chips — worst 3 counties on the latest onc_wait_90 values
  const [tops, setTops] = useState<{ code: string; name: string; value: number }[]>([]);
  useEffect(() => {
    let on = true;
    getValues("onc_wait_90").then((v) => {
      if (!on) return;
      setTops(Object.entries(v.values).sort((a, b) => b[1].value - a[1].value)
                .slice(0, 3).map(([c, r]) => ({ code: c, name: r.name, value: r.value })));
    }).catch(() => null);
    return () => { on = false; };
  }, []);

  const primary = new Set(NODES.flatMap((n) => n.keys));
  const rest = path?.indicators.filter((i) => !primary.has(i.key)) ?? [];
  const restStages = [...new Set(rest.map((i) => i.stage))];
  const behind = NODES.filter((n, i) => statuses[i] === "worse").map((n) => (STAGE_LABEL[n.id] ?? n.id).toLowerCase());
  const measured = statuses.filter((s) => s !== "gap").length;
  const cur = NODES.find((n) => n.id === node)!;
  const items = cur.keys.map(find).filter((i): i is PathwayItem => !!i && i.value != null);
  const hero = items.find(isBehind) ?? items.find((i) => i.key === cur.mapKey) ?? items[0];
  const heroStatus = hero ? statusOf(hero) : "gap";
  const acts = (rec?.pathway_actions ?? []).filter((a) => a.stage === node);
  const loose = (rec?.pathway_actions ?? []).filter((a) => !a.stage || !NODES.some((n) => n.id === a.stage));
  const rel = acts.length ? acts : loose;                    // stage-matched chips, else later-steps actions
  const shownActs = rel.slice(0, 3);
  const assum = shownActs.find((a) => a.partial_match && a.assumption)?.assumption;

  return (
    <div className="mt-1">
      {/* the slide-style takeaway: computed from the node statuses, not typed */}
      {!path ? <Skel className="h-7 mt-2 w-4/5" /> : (
        <h2 className="t-title mt-1.5 leading-snug">
          {behind.length
            ? <>Falls behind on <span className="text-rose-300">{behind.join(", ")}</span></>
            : measured ? "Keeps pace with Finland" : "A data gap in diagnosis"}
        </h2>
      )}

      {/* the 5-node pathway strip — dot colour = status; status word underneath, click swaps the card */}
      <div className="relative mt-4">
        <div className="absolute left-5 right-5 top-[8px] border-t border-white/15" />
        {/* decorative stream — people moving along the pathway; carries no number */}
        {[0, 1, 2].map((k) => <span key={k} className="flow-p" style={{ animationDelay: `${k * 1.5}s` }} />)}
        <div className="relative flex justify-between">
          {NODES.map((n, i) => {
            const st = statuses[i], s = NODE_STYLE[st], on = node === n.id;
            const track = onTrack(n.keys);
            const pick = focus?.answer.choice === n.id;
            const prob = focus?.answer.probabilities[n.id];
            return (
              <button key={n.id} onClick={() => setSel(n.id)} title={STAGE_QUESTION[n.id]}
                      className={`flex flex-col items-center gap-1 px-1 py-1 rounded-lg border w-[78px] transition
                        ${on ? s.ring : "border-transparent hover:bg-white/5"}`}>
                <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${s.dot} ${on ? "ring-2 ring-white/25" : ""}`} />
                <span className={`text-[11px] leading-tight text-center ${on ? "text-white" : "text-white/70"}`}>
                  {STAGE_LABEL[n.id] ?? n.id}
                </span>
                <span className={`text-[9px] uppercase tracking-wide leading-none ${s.text}`}>
                  {STATUS_WORD[st]}
                </span>
                <FlowDots key={`${prog}:${code}`} track={track} status={st} col={i} />
                {pick && <span className="text-[8.5px] uppercase tracking-wide text-sky-300 leading-none"
                               title={`${engineName(focus?.engine)} picks this stage first · simulated`}>
                           ◂ {Math.round((prob ?? 0) * 100)}%</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {focus && (
          <>
            <SimChip eng={engineName(focus.engine)} />
            <span className="t-micro text-white/55">
              {engineName(focus.engine)} would focus on{" "}
              <span className="text-sky-300 font-medium">{(STAGE_LABEL[focus.answer.choice] ?? focus.answer.choice).toLowerCase()}</span>
              {" "}first — ranked from this county&apos;s real numbers; a prioritisation aid, not a diagnosis.
            </span>
          </>
        )}
        <span className="t-micro text-white/30 ml-auto">1 dot = 1 of 100 people at that stage · each stage its own cohort</span>
      </div>

      {/* one hero card for the selected node — giant number, one-line caption, Finland + status + n */}
      {!path ? <div className="mt-3 space-y-2"><Skel className="h-16" /><Skel className="h-10" /></div> : (
        <div className="mt-3">
          {cur.id === "diagnosis" || !hero ? (
            <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-3.5 flex items-start gap-3">
              <span className="mt-1 w-3.5 h-3.5 rounded-full border border-dashed border-white/40 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="t-section text-white/80">A data gap in diagnosis</div>
                <p className="t-caption mt-1 leading-snug">
                  No public county data — stage known for 42 % of cancers nationally
                  (<a href="https://syoparekisteri.fi/assets/themes/ssy3/factsheets/syopa_2024_tilastoraportti.html"
                      target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-white/80">
                    Cancer Registry 2024</a>, from report text).
                </p>
              </div>
              <Tag v="note">Data gap</Tag>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className={`text-[32px] font-semibold leading-none tabular-nums ${NODE_STYLE[heroStatus].text}`}>
                  <CountUp v={hero.value} />{hero.unit === "%" ? " %" : ""}
                </div>
                <div className="t-caption mt-1.5 text-white/65 leading-snug">
                  {CAPTION[hero.key] ?? hero.label}
                  {hero.key === activeInd && hero.key !== cur.mapKey && <span className="text-sky-300"> · on map</span>}
                </div>
                <div className="t-micro mt-1"><Src s={hero.source} /></div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1 text-right">
                <span className="t-caption text-white/55">
                  Finland <span className="text-white/90 font-medium tabular-nums">{fmt(hero.national, hero.unit)}</span>
                </span>
                {heroStatus === "worse" ? <Tag v="warn">worse than Finland</Tag>
                  : heroStatus === "better"
                    ? <span className="tag" style={{ color: "#6ee7b7", borderColor: "rgba(110,231,183,0.4)",
                                                   background: "rgba(110,231,183,0.08)" }}>better than Finland</span>
                    : <Tag v="data">close to Finland</Tag>}
                {hero.abs_is_denominator && hero.abs_value != null && (
                  <span className={`t-micro tabular-nums ${hero.abs_value < 30 ? "text-amber-300" : ""}`}>
                    n = {fmt(hero.abs_value)}{hero.abs_value < 30 ? " · small numbers" : ""}
                  </span>)}
                {hero.target != null && <span className="t-micro text-amber-300/80">target {fmt(hero.target, hero.unit)}</span>}
                {hero.rank != null && <span className="t-micro">rank {hero.rank} of {hero.of}</span>}
              </div>
            </div>
          )}
          {/* other measured indicators on this node — one line each, click to put on the map */}
          {items.filter((i) => i !== hero).map((i) => (
            <button key={i.key} onClick={() => onInd(i.key)} title={`show on the map — ${i.label}`}
                    className="t-micro w-full text-left mt-1 px-1 text-white/50 hover:text-white/80 leading-snug">
              also <span className="tabular-nums text-white/70">{fmt(i.value, i.unit)}</span> {i.label.toLowerCase()}{" "}
              (Finland {fmt(i.national, i.unit)}){i.key === activeInd && <span className="text-sky-300"> · on map</span>}
            </button>
          ))}
          {cur.queue && <QueueLapse kkey={cur.queue} code={code} onValues={(v) => onTl?.(v)} />}
          {shownActs.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <RoadmapChip />
              {shownActs.map((a) => <Cite key={a.id} a={a} />)}
              {rel.length > shownActs.length && <span className="t-micro">+{rel.length - shownActs.length} more</span>}
              {assum && <Assumption text={assum} />}
            </div>
          )}
        </div>
      )}

      {tops.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="t-micro text-white/50">Longest oncology queues now:</span>
          {tops.map((t) => (
            <button key={t.code} onClick={() => onCode(t.code)}
                    className={`chip text-[10.5px] ${t.code === code ? "chip-primary" : ""}`}
                    title="switch county — stays on this step">
              {t.name} <span className="tabular-nums text-rose-300/90">{fmt(t.value, "%")}</span>
            </button>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="t-caption select-none hover:text-white/80">
            All pathway indicators ({rest.length})
          </summary>
          <div className="mt-1.5">
            {restStages.map((st) => (
              <div key={st} className="mb-2">
                <div className="px-1 mt-1.5 mb-0.5">
                  <span className="t-micro uppercase tracking-wide text-white/40">{STAGE_LABEL[st] ?? st}</span>
                </div>
                {rest.filter((i) => i.stage === st).map((it) => (
                  <Row key={it.key} it={it} onPick={onInd} active={it.key === activeInd} />))}
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="text-[10px] text-white/35 px-1 mt-1.5">ASSUMPTION badges mark judgement calls. Public data, except the stage pick labelled SIMULATION.</div>
    </div>
  );
}
