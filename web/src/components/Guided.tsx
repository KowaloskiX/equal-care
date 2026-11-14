"use client";
// Guided story: one county, one programme, one question per step (Back/Next). Steps 2–3 replay
// the recorded engine answers — no simulated numbers before the user clicks Run (see SimReplay).
import { useEffect, useMemo, useState } from "react";
import { engineName, fmt, getGap, getPathway, getRecommend, getValues,
         type Brief, type FC, type Gap, type Pathway, type PathwayItem, type Recommend, type Values } from "@/lib/api";
import type { Crowd } from "@/lib/dots";
import { axisPos, BaselineStep, ScenarioStep } from "@/components/SimReplay";
import QueueLapse from "@/components/QueueLapse";
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
  if (step === 2) return <SimChip eng={eng} />;
  return <><SimChip eng={eng} /><RoadmapChip /></>;
}

export default function Guided({ prog, code, step, seen, briefProg, activeInd,
                                 onStep, onCode, onProg, onExplore, onInd, onLive,
                                 munis, crowd, onCrowd, preRun, onTl }: {
  prog: Prog; code: string; step: number; seen: number[]; briefProg?: Brief["programmes"][number];
  activeInd: string | null;
  onStep: (n: number) => void; onCode: (c: string) => void; onProg: (p: Prog) => void;
  onExplore: () => void; onInd: (k: string | null) => void;
  onTl?: (v: Values | null) => void;         // step 4: monthly queue values driving the choropleth
  onLive?: (v: { code: string; value: number } | null) => void;
  munis?: FC | null;
  crowd?: Crowd | null;
  onCrowd?: (c: Crowd | null | ((p: Crowd | null) => Crowd | null)) => void;
  preRun?: { scenarios: string[]; key: number } | null;   // analyst drawer: preselect + auto-run
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
  const eng = engineName(recF?.split.validation?.engine) ?? engineName(briefProg?.note?.replace("Simulation · ", ""));
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
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <div className="t-caption truncate">{PROGS.find((p) => p.id === prog)?.label} · <span className="text-white/75">{name}</span></div>
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
                                   preselect={preRun?.scenarios} autoRun={!!preRun} />}
          </>
        )}

        {step === 4 && (
          <Step4 prog={prog} code={code} name={name} path={pathF} rec={recF} activeInd={activeInd}
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
            <button onClick={onExplore} className="t-caption text-white/60 hover:text-white underline decoration-dotted underline-offset-2">
              Explore all indicators
            </button>
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

// Step 4 — the whole pathway as a 5-node strip. The selected node drives the map indicator; queue
// nodes get a monthly time-lapse, and each node shows its own roadmap actions (stage-tagged server-side).
function Step4({ prog, code, name, path, rec, activeInd, onInd, onCode, onTl }: {
  prog: Prog; code: string; name: string; path: Pathway | null; rec: Recommend | null;
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
  const behind = NODES.filter((n, i) => statuses[i] === "worse").map((n) => STAGE_LABEL[n.id] ?? n.id);
  const cur = NODES.find((n) => n.id === node)!;
  const acts = (rec?.pathway_actions ?? []).filter((a) => a.stage === node);
  const loose = (rec?.pathway_actions ?? []).filter((a) => !a.stage || !NODES.some((n) => n.id === a.stage));

  return (
    <div className="mt-2">
      <p className="t-body text-white/75 leading-snug">
        {!path ? <>After screening: does care in {name} keep pace with Finland?</>
          : behind.length
            ? <>After screening, {name} falls behind on: <span className="text-rose-300">{behind.join(", ")}</span></>
            : <>After screening, {name} keeps pace with Finland on the published indicators.</>}
      </p>
      <p className="t-caption mt-1 text-white/50 leading-snug">
        Screening is only the first step. Here is how {name} compares with Finland on the later steps — public data, no simulation.
      </p>

      {/* the 5-node pathway strip — node colour = status of its primary indicator */}
      <div className="relative mt-3">
        <div className="absolute left-4 right-4 top-[7px] border-t border-white/15" />
        <div className="relative flex justify-between">
          {NODES.map((n, i) => {
            const st = statuses[i], s = NODE_STYLE[st];
            return (
              <button key={n.id} onClick={() => setSel(n.id)} title={STAGE_QUESTION[n.id]}
                      className={`flex flex-col items-center gap-1 px-1 py-0.5 rounded-lg border w-[76px] transition
                        ${node === n.id ? s.ring : "border-transparent hover:bg-white/5"}`}>
                <span className={`w-3 h-3 rounded-full shrink-0 ${s.dot}`} />
                <span className={`text-[10px] leading-tight text-center ${node === n.id ? s.text : "text-white/60"}`}>
                  {STAGE_LABEL[n.id] ?? n.id}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* the selected node's rows, queue time-lapse and roadmap actions */}
      {!path ? <div className="mt-2 space-y-2"><Skel className="h-10" /><Skel className="h-10" /></div> : (
        <div className="mt-2.5">
          <div className="px-1 mb-0.5">
            <span className="t-caption uppercase tracking-wide text-white/45">{STAGE_LABEL[cur.id]}</span>
            <span className="t-micro italic ml-1.5">{STAGE_QUESTION[cur.id]}</span>
          </div>
          {cur.id === "diagnosis" ? (
            <div className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 bg-white/[0.03] border border-white/10">
              <span className="t-caption leading-snug">
                No public county data — stage known for 42 % of cancers nationally
                (<a href="https://syoparekisteri.fi/assets/themes/ssy3/factsheets/syopa_2024_tilastoraportti.html"
                    target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-white/80">
                  Cancer Registry 2024</a>, from report text).
              </span>
              <Tag v="note">Data gap</Tag>
            </div>
          ) : (
            cur.keys.map((k) => {
              const it = find(k);
              return it ? <ScoreRow key={k} it={it} active={it.key === activeInd}
                                    onPick={() => onInd(it.key)} /> : null;
            })
          )}
          {cur.queue && <QueueLapse kkey={cur.queue} code={code} onValues={(v) => onTl?.(v)} />}
          {acts.length > 0 && (
            <div className="mt-2">
              <div className="t-caption mb-1 flex items-center gap-2"><RoadmapChip /> What the roadmap says</div>
              {acts.map((a) => (
                <div key={a.id} className="px-1 py-1">
                  {a.why && <div className="text-[11.5px] text-white/60 leading-snug">{a.why}</div>}
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Cite a={a} />
                    {a.small_numbers && <Tag v="note">{a.small_numbers}</Tag>}
                    {a.assumption && <Assumption text={a.assumption} />}
                  </div>
                </div>
              ))}
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
      {loose.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-white/10">
          <div className="t-caption mb-1 flex items-center gap-2"><RoadmapChip /> What the roadmap says for later steps</div>
          {loose.map((a) => (
            <div key={a.id} className="px-1 py-1">
              {a.why && <div className="text-[11.5px] text-white/60 leading-snug">{a.why}</div>}
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Cite a={a} />
                {a.assumption && <Assumption text={a.assumption} />}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-white/35 px-1 mt-1.5">ASSUMPTION badges mark judgement calls. Simulated estimates, not forecasts.</div>
    </div>
  );
}

// Step-4 scorecard row: key indicator, value vs Finland, status pill — clutter in the tooltip.
function ScoreRow({ it, active, onPick }: { it: PathwayItem; active: boolean; onPick: () => void }) {
  const pill = it.value == null ? <Tag v="data">No data</Tag>
    : isBehind(it) ? <Tag v="warn">Worse than Finland</Tag>
    : it.delta === 0 || close(it) ? <Tag v="data">Close to Finland</Tag>
    : <span className="tag" style={{ color: "#6ee7b7", borderColor: "rgba(110,231,183,0.4)", background: "rgba(110,231,183,0.08)" }}>Better</span>;
  const tip = [it.rank != null && `rank ${it.rank} of ${it.of}`,
               it.target != null && `target ${fmt(it.target, it.unit)}`].filter(Boolean).join(" · ");
  return (
    <button onClick={onPick} title={tip || it.label}
            className={`w-full text-left rounded-lg px-2.5 py-1.5 transition ${active ? "rowsel" : "hover:bg-white/5"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="t-body text-white/80 leading-tight">
          {it.label}
          {active && <span className="t-micro text-sky-300"> · shown on map</span>}
        </span>
        <span className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          <span className="t-section tabular-nums">{fmt(it.value, it.unit)}</span>
          <span className="t-caption text-white/50">Finland {fmt(it.national, it.unit)}</span>
          {pill}
        </span>
      </div>
      <div className="t-micro mt-0.5 flex gap-2">
        {it.abs_is_denominator && it.abs_value != null &&
          <span>n = {fmt(it.abs_value)}{it.abs_value < 30 ? " · small numbers" : ""}</span>}
        {it.shared_producer && <span>shared producer {it.shared_producer}</span>}
        <Src s={it.source} />
      </div>
    </button>
  );
}
