"use client";
// Guided story: one county, one programme, one question per step (Back/Next). Steps 2–3 replay
// the recorded engine answers — no simulated numbers before the user clicks Run (see SimReplay).
import { useEffect, useMemo, useState } from "react";
import { engineName, fmt, getGap, getPathway, getRecommend,
         type Brief, type Gap, type Pathway, type Recommend } from "@/lib/api";
import { axisPos, BaselineStep, ScenarioStep } from "@/components/SimReplay";
import { Assumption, Cite, DataChip, people, RoadmapChip, SimChip } from "@/components/RecommendBlock";
import { Row, STAGE_LABEL, STAGE_QUESTION } from "@/components/RegionCard";
import { Seg, Skel, Tag } from "@/components/ui";

const PROGS = [
  { id: "breast", label: "Breast · mammography" },
  { id: "bowel", label: "Colorectal · home test" },
] as const;
type Prog = (typeof PROGS)[number]["id"];
const PROG_KEY: Record<Prog, string> = { breast: "screen_breast", bowel: "screen_bowel" };
const TITLES = ["Where is the gap?", "Why?", "What would help?", "Rest of the pathway"];
const NEXT_T = ["Why?", "What would help?", "Rest of the pathway"];
const PATH_STAGES = ["referral", "diagnosis", "treatment", "outcome"];

function Chip({ step, eng, src }: { step: number; eng: string | null; src?: Parameters<typeof DataChip>[0]["s"] }) {
  if (step === 1 || step === 4) return <DataChip s={src} />;
  if (step === 2) return <SimChip eng={eng} />;
  return <><SimChip eng={eng} /><RoadmapChip /></>;
}

export default function Guided({ prog, code, step, seen, briefProg, activeInd,
                                 onStep, onCode, onProg, onExplore, onInd, onLive }: {
  prog: Prog; code: string; step: number; seen: number[]; briefProg?: Brief["programmes"][number];
  activeInd: string | null;
  onStep: (n: number) => void; onCode: (c: string) => void; onProg: (p: Prog) => void;
  onExplore: () => void; onInd: (k: string) => void;
  onLive?: (v: { code: string; value: number } | null) => void;
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
          <BaselineStep key={`${prog}:${code}`} prog={prog} code={code} rec={recF} who={who} onLive={onLive} />
        )}

        {step === 3 && (
          <>
            {!recF ? <Skel className="h-24 mt-2" />
                   : <ScenarioStep key={`${prog}:${code}`} prog={prog} code={code} rec={recF} who={who} onLive={onLive} />}
          </>
        )}

        {step === 4 && (
          <div className="mt-2">
            <p className="t-body text-white/75 leading-snug">After screening: does care in {name} keep pace with Finland?</p>
            {!pathF ? <div className="mt-2 space-y-2"><Skel className="h-10" /><Skel className="h-10" /></div> : (
              PATH_STAGES.map((st) => {
                const items = pathF.indicators.filter((i) => i.stage === st);
                return (
                  <div key={st} className="mb-2">
                    <div className="px-2.5 mt-2 mb-0.5">
                      <span className="t-caption uppercase tracking-wide text-white/45">{STAGE_LABEL[st]}</span>
                      <span className="t-micro italic ml-1.5">{STAGE_QUESTION[st]}</span>
                    </div>
                    {st === "diagnosis" ? (
                      <p className="t-caption leading-snug mx-2.5 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
                        No public county data — stage known for 42 % of cancers nationally
                        (<a href="https://syoparekisteri.fi/assets/themes/ssy3/factsheets/syopa_2024_tilastoraportti.html"
                            target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-white/80">
                          Cancer Registry 2024</a>, from report text).
                      </p>
                    ) : items.map((it) => <Row key={it.key} it={it} onPick={onInd} active={it.key === activeInd} />)}
                  </div>
                );
              })
            )}
            {recF && recF.pathway_actions.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-white/10">
                <div className="t-caption mb-1 flex items-center gap-2"><RoadmapChip /> Roadmap actions for later steps</div>
                {recF.pathway_actions.map((a) => (
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
