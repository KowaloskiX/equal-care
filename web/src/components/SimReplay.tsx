"use client";
// The recorded engine answers, replayed one resident type at a time. The animation for the screening
// story (and the county card): every number comes from /api/residents — the API replays lines from the
// committed data/jev/*.jsonl caches; a scenario goes through /api/whatif first for uncached combos.
import { useEffect, useRef, useState } from "react";
import { engineName, fmt, getResidentAnswer, getResidents,
         type Recommend, type Replay, type ResidentAnswer, type ResidentRow } from "@/lib/api";
import { Assumption, Cite, DRIVER_HEADLINE, GapSplitBar, SimChip } from "@/components/RecommendBlock";
import { Skel, Tag } from "@/components/ui";

export const AXIS = { lo: 60, hi: 90 };   // attendance % axis, shared with the step-1 chart
export const axisPos = (v: number) => Math.min(100, Math.max(0, ((v - AXIS.lo) / (AXIS.hi - AXIS.lo)) * 100));
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const rowKey = (r: ResidentRow) =>
  [r.key.sex, r.key.age5, r.key.settlement, r.key.lang, r.key.edu, r.key.activity, r.key.muni_type].join("|");

// One revealed archetype: who they are, how many here, what Jev answered (raw, before anchoring).
function Tile({ r, scenario, onAsk }: { r: ResidentRow; scenario: boolean; onAsk: () => void }) {
  const k = r.key;
  const bits = [k.sex_label, k.age5, k.lang_short, k.activity, k.muni_type].filter(Boolean).join(" · ");
  return (
    <button onClick={onAsk} title={`see the exact question — ${r.file} line ${r.line ?? "?"}`}
            className="slide w-full text-left rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 hover:bg-white/[0.08]">
      <div className="text-[11px] text-white/75 leading-snug truncate">{bits}</div>
      <div className="text-[10.5px] text-white/55 mt-0.5 flex items-center gap-1.5">
        <span className="tabular-nums text-white/70 shrink-0">{r.people === 0 ? "<1" : fmt(r.people)} here</span>
        <span className="text-sky-300/90 tabular-nums shrink-0">
          {scenario && r.jev_attend_before != null
            ? `Jev ${Math.round(r.jev_attend_before * 100)} % → ${Math.round(r.jev_attend * 100)} %`
            : `Jev ${Math.round(r.jev_attend * 100)} % take part`}
        </span>
        {r.reason_short && <span className="truncate">· {r.reason_short}</span>}
        {r.borrowed && <Tag v="note">≈ same answer as a similar group</Tag>}
      </div>
    </button>
  );
}

// Simulated rate on the same 60–90 % axis as the real county rate and Finland.
function Gauge({ value, start, real, national, target }: {
  value: number; start?: number | null; real: number | null; national: number | null; target: number | null;
}) {
  return (
    <div className="mt-2">
      <div className="relative h-2.5 rounded-full bg-white/5">
        {start != null && (
          <div className="absolute inset-y-0 rounded-full bg-sky-300/25"
               style={{ left: `${Math.min(axisPos(start), axisPos(value))}%`,
                        width: `${Math.abs(axisPos(value) - axisPos(start))}%` }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full bg-sky-400/70 transition-[width] duration-150"
             style={{ width: `${axisPos(value)}%` }} />
        {target != null && <div className="absolute -inset-y-0.5 border-l border-dashed border-amber-300/70" style={{ left: `${axisPos(target)}%` }} />}
        {real != null && <div className="absolute -inset-y-0.5 border-l-2 border-rose-300/90" style={{ left: `${axisPos(real)}%` }} />}
        {national != null && <div className="absolute -inset-y-0.5 border-l border-white/60" style={{ left: `${axisPos(national)}%` }} />}
      </div>
      <div className="t-micro mt-1 flex flex-wrap gap-x-3">
        <span className="text-sky-300">— simulated {fmt(value, "%")}</span>
        <span><span className="text-rose-300">│</span> real {fmt(real, "%")}</span>
        <span><span className="text-white/60">│</span> Finland {fmt(national, "%")}</span>
        {start != null && <span className="text-white/40">from {fmt(start, "%")}</span>}
        {target != null && <span className="text-amber-300/70">┆ target {fmt(target, "%")}</span>}
      </div>
    </div>
  );
}

// Share of the non-attenders by Jev's main factor, building up as rows are revealed.
function Reasons({ cum, shorts, labels, big }: { cum?: Record<string, number>; shorts: Record<string, string>; labels?: Record<string, string>; big?: boolean }) {
  if (!cum) return null;
  return (
    <div className="mt-2">
      {!big && <div className="t-micro mb-1">why they say they skip — so far</div>}
      <div className={big ? "space-y-1.5" : "space-y-0.5"}>
        {Object.entries(cum).slice(0, 5).map(([r, v]) => (
          <div key={r} className="flex items-center gap-2" title={labels?.[r] ?? r}>
            <span className={`${big ? "w-28 text-[12px] text-white/75" : "w-24 text-[10px] text-white/55"} shrink-0 truncate`}>{shorts[r] ?? r}</span>
            <div className={`flex-1 ${big ? "h-2.5" : "h-2"} rounded bg-white/5 overflow-hidden`}>
              <div className="h-full rounded bg-sky-400/50 transition-[width] duration-150" style={{ width: `${v * 100}%` }} />
            </div>
            <span className={`${big ? "w-10 text-[11px]" : "w-9 text-[10px]"} text-right tabular-nums text-white/55`}>{Math.round(v * 100)} %</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The popover behind a tile: the exact JSON state and questions sent to Jev, and the raw recorded answer.
function Asked({ ans, onClose }: { ans: ResidentAnswer; onClose: () => void }) {
  const pre = (x: unknown) => JSON.stringify(x, null, 1);
  return (
    <div className="rounded-lg border border-sky-300/30 bg-[#0c0e16]/95 backdrop-blur shadow-xl p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="t-caption leading-tight">What Jev was asked — <span className="text-white/40">{ans.file} line {ans.line}</span></div>
        <button onClick={onClose} className="text-white/50 hover:text-white leading-none px-1">×</button>
      </div>
      <div className="mt-1.5 space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
        <div className="t-micro">state sent</div>
        <pre className="text-[9.5px] leading-snug text-white/60 whitespace-pre-wrap">{pre(ans.state)}</pre>
        <div className="t-micro">questions</div>
        <pre className="text-[9.5px] leading-snug text-white/60 whitespace-pre-wrap">{pre(ans.questions)}</pre>
        <div className="t-micro">recorded answer</div>
        <pre className="text-[9.5px] leading-snug text-sky-200/80 whitespace-pre-wrap">{pre(ans.answer)}</pre>
      </div>
    </div>
  );
}

export function ReplayPlayer({ replay, who, onLive, onDone, duration = 7000 }: {
  replay: Replay; who: string;
  onLive?: (v: { code: string; value: number } | null) => void;
  onDone?: () => void; duration?: number;
}) {
  const rows = replay.rows;
  const instant = reduced();
  const [i, setI] = useState(() => (instant ? rows.length : 0));
  const [stream, setStream] = useState<ResidentRow[]>([]);   // tile queue, newest first — ~1 tile in per 700 ms
  const [done, setDone] = useState(instant);
  const [ans, setAns] = useState<ResidentAnswer | null>(null);
  const liveRef = useRef(onLive);
  const doneRef = useRef(onDone);
  const iRef = useRef(i);
  useEffect(() => { liveRef.current = onLive; doneRef.current = onDone; });

  useEffect(() => {
    if (instant) return;
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const x = Math.min(1, (t - t0) / duration);
      const n = Math.round(Math.pow(x, 1.5) * rows.length);   // ease — faster at the tail
      iRef.current = n; setI(n);
      const r = n ? rows[n - 1] : null;                     // live map rate emitted from the tick —
      liveRef.current?.(r ? { code: replay.code, value: r.cum_rate } : null);   // not an effect, so no nested updates
      if (x < 1) raf = requestAnimationFrame(tick); else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rows, rows.length, duration, instant, replay.code]);

  useEffect(() => {   // counter/gauge/map follow `i` per frame; a new tile enters ~1.4×/s so each stays readable
    if (instant) return;
    const t = setInterval(() => {
      const n = iRef.current;
      if (!n) return;
      const r = rows[n - 1];
      setStream((s) => (s.length && rowKey(s[0]) === rowKey(r) ? s : [r, ...s].slice(0, 5)));
    }, 700);
    return () => clearInterval(t);
  }, [instant, rows]);

  const cur = i ? rows[i - 1] : null;
  useEffect(() => {   // reduced-motion path skips the tick — emit the final rate once
    if (instant && i) liveRef.current?.({ code: replay.code, value: rows[i - 1].cum_rate });
  }, [instant, i, rows, replay.code]);
  useEffect(() => { if (done) doneRef.current?.(); }, [done]);

  const scenario = replay.mode === "scenario";
  const start = scenario ? replay.final.baseline_rate ?? null : null;

  if (done) return null;   // the parent composes the result view

  return (
    <div className="relative mt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-white/70 tabular-nums">
          Asked {i} / {rows.length} resident types · {fmt(cur?.cum_people ?? 0)} of {fmt(replay.people_total)} {who}
        </div>
        <button onClick={() => { const last = rows[rows.length - 1];
                               iRef.current = rows.length; setI(rows.length);
                               if (last) liveRef.current?.({ code: replay.code, value: last.cum_rate });
                               setDone(true); }}
                className="t-micro underline decoration-dotted hover:text-white/80 shrink-0">Skip</button>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 mt-1 overflow-hidden">
        <div className="h-full bg-sky-400/70" style={{ width: `${(100 * i) / Math.max(1, rows.length)}%` }} />
      </div>
      <Gauge value={cur?.cum_rate ?? start ?? replay.final.rate ?? 0} start={start}
             real={replay.final.real} national={replay.final.national_real} target={replay.final.target} />
      <div className="space-y-1 mt-1">
        {stream.map((r) => (
          <Tile key={rowKey(r)} r={r} scenario={scenario}
                onAsk={() => getResidentAnswer(replay.programme, r.answer_key,
                          replay.scenarios_selected.length ? replay.scenarios_selected : undefined)
                        .then(setAns).catch(() => null)} />
        ))}
      </div>
      {!scenario && <Reasons cum={cur?.cum_reasons} shorts={replay.reason_shorts} labels={replay.reason_labels} />}
      {ans && (
        <div className="absolute inset-x-0 top-0 z-20">
          <Asked ans={ans} onClose={() => setAns(null)} />
        </div>
      )}
      <div className="t-micro mt-2 leading-snug">
        Replaying {engineName(replay.engine) ?? "the engine"}&apos;s recorded answers ·{" "}
        {replay.files.map((f) => f.path).join(" · ")} · {replay.asked_live ? `${replay.asked_live} new calls` : "0 new calls"}
        <br />Tiles show the raw answer; the gauge is calibrated so Finland = {fmt(replay.anchor.real_national, "%")} real.
      </div>
    </div>
  );
}

// After a run: the three numbers that answer the step, on the shared axis.
function NumBars({ final }: { final: Replay["final"] }) {
  const rows = [
    { label: "Expected from who lives here", v: final.rate, bar: "bg-sky-400/70", tag: <Tag v="sim"><i>SIM</i></Tag> },
    { label: "Actually attends", v: final.real, bar: "bg-rose-400/70", tag: <Tag v="data"><i>DATA</i></Tag> },
    { label: "Finland", v: final.national_real, bar: "bg-white/45", tag: <Tag v="data"><i>DATA</i></Tag> },
  ];
  return (
    <div className="relative mt-1.5">
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[168px_1fr_52px] items-center gap-2">
            <span className="text-[13px] text-white/80 leading-tight flex items-center gap-1.5 flex-wrap">{r.label}{r.tag}</span>
            <span className="relative h-3 rounded-full bg-white/5 overflow-hidden">
              <span className={`absolute inset-y-0 left-0 rounded-full ${r.bar}`} style={{ width: `${axisPos(r.v ?? 0)}%` }} />
            </span>
            <span className="text-right text-[12.5px] text-white/80 tabular-nums">{r.v != null ? fmt(r.v, "%") : "–"}</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-y-0 pointer-events-none" style={{ left: 176, right: 60 }}>
        {final.target != null && (
          <div className="absolute top-0 bottom-0 border-l border-dashed border-amber-300/60" style={{ left: `${axisPos(final.target)}%` }}>
            <span className="absolute top-0 left-1 text-[9px] text-amber-200/80 whitespace-nowrap">target {fmt(final.target, "%")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Collapsed "how this was computed": the counter, the biggest resident types in the county
// (still clickable for the exact Jev prompt/answer popover) and the provenance line.
function ReplayDetails({ replay, who }: { replay: Replay; who: string }) {
  const [ans, setAns] = useState<ResidentAnswer | null>(null);
  const scenario = replay.mode === "scenario";
  return (
    <details className="relative">
      <summary className="t-caption select-none hover:text-white/80">
        How this was computed ({replay.rows.length.toLocaleString("fi-FI")} resident types asked)
      </summary>
      <div className="mt-2">
        <div className="text-[11px] text-white/70 tabular-nums">
          Asked {replay.rows.length} / {replay.rows.length} resident types · {fmt(replay.people_total)} {who}
        </div>
        <div className="t-micro mt-2">Largest groups in {replay.name}</div>
        <div className="space-y-1 mt-1">
          {replay.rows.slice(0, 3).map((r) => (
            <Tile key={rowKey(r)} r={r} scenario={scenario}
                  onAsk={() => getResidentAnswer(replay.programme, r.answer_key,
                            replay.scenarios_selected.length ? replay.scenarios_selected : undefined)
                          .then(setAns).catch(() => null)} />
          ))}
        </div>
        <div className="t-micro mt-2 leading-snug">
          Replaying {engineName(replay.engine) ?? "the engine"}&apos;s recorded answers ·{" "}
          {replay.files.map((f) => f.path).join(" · ")} · {replay.asked_live ? `${replay.asked_live} new calls` : "0 new calls"}
          <br />Tiles show the raw answer; rates are calibrated so Finland = {fmt(replay.anchor.real_national, "%")} real.
        </div>
      </div>
      {ans && (
        <div className="absolute inset-x-0 top-6 z-20">
          <Asked ans={ans} onClose={() => setAns(null)} />
        </div>
      )}
    </details>
  );
}

// Step 2 — "Why?": nothing simulated is shown until the user asks the county's resident types.
export function BaselineStep({ prog, code, rec, who, onLive }: {
  prog: string; code: string; rec: Recommend | null; who: string;
  onLive?: (v: { code: string; value: number } | null) => void;
}) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [ran, setRan] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const resRef = useRef<HTMLDivElement>(null);
  useEffect(() => {   // bring the revealed result into view inside the column
    if (done) resRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [done]);
  useEffect(() => {   // callers key this component by prog:code, so a change remounts it
    let live = true;
    getResidents(prog, code)
      .then((r) => { if (live) setReplay(r); })
      .catch((e) => { if (live) setErr(String(e instanceof Error ? e.message : e)); });
    return () => { live = false; };
  }, [prog, code]);

  if (err) return <div className="t-body text-rose-300 mt-2">{err}</div>;
  const split = done ? rec?.split : null;
  return (
    <>
      {!ran && (
        <>
          <p className="t-body text-white/55 mt-1.5 leading-snug">
            Simulated residents — rebuilt from Statistics Finland tables — answer whether they take part
            and why not. Nothing is computed until you ask them.
          </p>
          {!replay ? <Skel className="h-9 mt-2" /> : (
            <button onClick={() => setRan(true)}
                    className="mt-2 w-full rounded-lg bg-sky-400/15 border border-sky-300/35 text-sky-200 text-[12.5px] py-2
                               hover:bg-sky-400/25">
              Ask {replay.rows.length} simulated resident types in {replay.name}
            </button>
          )}
        </>
      )}
      {ran && replay && !done && (
        <ReplayPlayer replay={replay} who={who} onLive={onLive} onDone={() => setDone(true)} />)}
      {done && !split && <Skel className="h-24 mt-3" />}
      {split && replay && (
        <div ref={resRef} className="mt-2.5 pt-2.5 border-t border-white/10 slide">
          <div className="t-panel">{DRIVER_HEADLINE[split.driver] ?? ""}</div>
          <div className="mt-4">
            <div className="t-caption uppercase tracking-wide">The gap in three numbers</div>
            <NumBars final={replay.final} />
            <p className="t-micro mt-1.5 leading-snug">
              From who lives here, {replay.name} would be at {fmt(replay.final.rate, "%")}. It really is at{" "}
              {fmt(replay.final.real, "%")} (Finland {fmt(replay.final.national_real, "%")}).
            </p>
          </div>
          <div className="mt-4">
            <div className="t-caption uppercase tracking-wide">Where the gap comes from</div>
            {split.driver === "national" ? (
              <p className="t-body text-white/55 mt-1.5">
                The county is at Finland&apos;s level; the gap to {fmt(rec?.screening?.target ?? 80, "%")} is national.
              </p>
            ) : (
              <>
                <GapSplitBar split={split} big />
                <p className="t-micro mt-1">
                  Population explains {split.comp_pts ?? "–"} of {split.total_pts ?? "–"} points
                  {split.validation?.counties_weighted?.r != null &&
                    <> · r = {split.validation.counties_weighted.r} vs real 2024 county rates</>}
                </p>
              </>
            )}
            {split.assumption && <Assumption text={split.assumption} />}
          </div>
          <div className="mt-4">
            <div className="t-caption uppercase tracking-wide">Main reasons residents give for skipping</div>
            <Reasons cum={replay.rows[replay.rows.length - 1]?.cum_reasons}
                     shorts={replay.reason_shorts} labels={replay.reason_labels} big />
          </div>
          <div className="mt-4"><ReplayDetails replay={replay} who={who} /></div>
        </div>
      )}
    </>
  );
}

// Step 3 — "What would help?": pick interventions, run the residents again, compare attempts.
export function ScenarioStep({ prog, code, rec, who, onLive }: {
  prog: string; code: string; rec: Recommend | null; who: string;
  onLive?: (v: { code: string; value: number } | null) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [runId, setRunId] = useState(0);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState<{ label: string; pct: number | null; extra: number | null; live: number }[]>([]);
  const resRef = useRef<HTMLDivElement>(null);
  useEffect(() => {   // bring the revealed result into view inside the column
    if (done) resRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [done]);
  // callers key this component by prog:code, so a programme/county change remounts and resets it

  const opts = rec?.scenarios ?? [];
  const shortOf = (id: string) => opts.find((o) => o.scenario === id)?.short ?? id;
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const run = () => {
    if (!sel.size || busy) return;
    setBusy(true); setErr(null); setDone(false);
    getResidents(prog, code, [...sel])
      .then((r) => { setReplay(r); setRunId((x) => x + 1); })
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false));
  };
  const w = done ? replay?.whatif : null;
  const onDone = () => {
    setDone(true);
    const w2 = replay?.whatif;
    if (w2) setTried((t) => [...t, { label: replay.scenarios_selected.map(shortOf).join(" + "),
                                    pct: w2.gap_closed_pct, extra: w2.extra_people_per_year, live: w2.asked_live }]);
  };

  return (
    <>
      <div className="t-caption mt-1.5 mb-1.5">Pick interventions — the residents answer again.</div>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((s) => (
          <button key={s.scenario} onClick={() => toggle(s.scenario)} title={s.label}
                  className={`chip text-[11px] ${sel.has(s.scenario) ? "chip-primary" : ""}`}>
            {s.short ?? s.label}
            {s.actions[0] && <span className="text-[9px] opacity-60 ml-1.5">{s.actions[0].id}·p.{s.actions[0].page}</span>}
          </button>
        ))}
      </div>
      <button onClick={run} disabled={!sel.size || busy}
              className="mt-2 w-full rounded-lg bg-emerald-400/15 border border-emerald-300/30 text-emerald-300 text-[12px] py-1.5
                         hover:bg-emerald-400/25 disabled:opacity-40 disabled:cursor-not-allowed">
        {busy ? "asking simulated residents…" : "Run simulation"}
      </button>
      {err && <div className="t-body text-rose-300 mt-1.5">{err}</div>}
      {replay && !busy && !done && (
        <ReplayPlayer key={runId} replay={replay} who={who} onLive={onLive} onDone={onDone} />)}
      {w && replay && (
        <div ref={resRef} className="mt-2.5 slide">
          <div className="t-panel text-emerald-300">
            +{fmt(w.extra_people_per_year)} {who} a year
            {w.gap_closed_pct != null && <span className="text-white/55"> · {w.gap_closed_pct} % of the gap</span>}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-3.5 rounded bg-white/5 overflow-hidden">
              <div className="h-full bg-emerald-400/70" style={{ width: `${Math.min(100, w.gap_closed_pct ?? 0)}%` }} />
            </div>
          </div>
          <div className="t-micro mt-1 flex items-center gap-2">
            <SimChip eng={engineName(w.engine)} />
            <span>{w.asked_live ? `${w.asked_live} new Jev calls` : "replayed from cache"} · cached {w.from_cache} · an upper bound, not a forecast</span>
          </div>
          <div className="mt-4">
            <div className="t-caption uppercase tracking-wide mb-1">What the roadmap says</div>
            <div className="space-y-0.5">
              {w.scenarios.map((s) => (
                <div key={s.scenario} className="flex flex-wrap items-baseline gap-x-2 px-0.5">
                  <span className="text-[11px] text-white/55">{s.label}</span>
                  {s.actions.map((a) => <Cite key={a.id} a={a} />)}
                  {s.assumption && <Assumption text={s.assumption} />}
                </div>
              ))}
            </div>
          </div>
          {tried.length > 0 && (
            <div className="mt-4 pt-2 border-t border-white/10">
              <div className="t-caption uppercase tracking-wide mb-1">Tried</div>
              <div className="space-y-0.5">
                {tried.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-[10.5px] text-white/55 truncate" title={t.label}>{t.label}</span>
                    <div className="flex-1 h-2 rounded bg-white/5 overflow-hidden">
                      <div className="h-full rounded bg-emerald-400/50" style={{ width: `${Math.min(100, t.pct ?? 0)}%` }} />
                    </div>
                    <span className="w-28 text-right text-[10px] tabular-nums text-emerald-300 shrink-0">
                      +{fmt(t.extra)} /yr{t.pct != null && <> · {t.pct} %</>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4"><ReplayDetails replay={replay} who={who} /></div>
        </div>
      )}
    </>
  );
}
