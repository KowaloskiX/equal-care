"use client";
// The recorded engine answers, replayed one resident type at a time. The animation for the screening
// story (and the county card): every number comes from /api/residents — the API replays lines from the
// committed data/decisions/*.jsonl caches; a scenario goes through /api/whatif first for uncached combos.
import { useEffect, useRef, useState } from "react";
import { engineName, fmt, getBaselineReplay, getResidentAnswer, getResidents,
         type FC, type Recommend, type Replay, type ResidentAnswer, type ResidentRow } from "@/lib/api";
import { buildCrowd, scenarioRowIndex, type Crowd } from "@/lib/dots";
import { Assumption, Cite, DRIVER_HEADLINE, SimChip } from "@/components/RecommendBlock";
import { Skel, Tag } from "@/components/ui";

export const AXIS = { lo: 60, hi: 90 };   // attendance % axis, shared with the step-1 chart
export const axisPos = (v: number) => Math.min(100, Math.max(0, ((v - AXIS.lo) / (AXIS.hi - AXIS.lo)) * 100));
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const rowKey = (r: ResidentRow) =>
  [r.key.sex, r.key.age5, r.key.settlement, r.key.lang, r.key.edu, r.key.activity, r.key.muni_type].join("|");
const sgn = (v: number | null | undefined) => (v == null ? "–" : v < 0 ? `−${fmt(-v)}` : `+${fmt(v)}`);

// One revealed archetype: who they are, how many here, what the engine answered (raw, before anchoring).
function Tile({ r, scenario, eng, onAsk }: { r: ResidentRow; scenario: boolean; eng: string; onAsk: () => void }) {
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
            ? `${eng} ${Math.round(r.jev_attend_before * 100)} % → ${Math.round(r.jev_attend * 100)} %`
            : `${eng} ${Math.round(r.jev_attend * 100)} % take part`}
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

// Share of expected non-attendance by barrier, building up as rows are revealed (motivators excluded).
function Reasons({ cum, shorts, labels, big }: { cum?: Record<string, number>; shorts: Record<string, string>; labels?: Record<string, string>; big?: boolean }) {
  if (!cum) return null;
  return (
    <div className="mt-2">
      {!big && <div className="t-micro mb-1">main barriers among those expected to skip — so far</div>}
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

// The popover behind a tile: the exact JSON state and questions sent to the engine, and the raw recorded answer.
export function Asked({ ans, eng, onClose }: { ans: ResidentAnswer; eng?: string | null; onClose: () => void }) {
  const pre = (x: unknown) => JSON.stringify(x, null, 1);
  return (
    <div className="rounded-lg border border-sky-300/30 bg-[#0c0e16]/95 backdrop-blur shadow-xl p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="t-caption leading-tight">What {eng ?? "the engine"} was asked — <span className="text-white/40">{ans.file} line {ans.line}</span></div>
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

export function ReplayPlayer({ replay, who, onLive, onProgress, onDone, duration = 7000 }: {
  replay: Replay; who: string;
  onLive?: (v: { code: string; value: number } | null) => void;
  onProgress?: (n: number) => void;         // rows revealed so far — drives the map dots
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
  const progRef = useRef(onProgress);
  const iRef = useRef(i);
  const rafRef = useRef(0);
  useEffect(() => { liveRef.current = onLive; doneRef.current = onDone; progRef.current = onProgress; });

  useEffect(() => {
    if (instant) return;
    const t0 = performance.now();
    const tick = (t: number) => {
      const x = Math.min(1, (t - t0) / duration);
      const n = Math.round(x * rows.length);   // linear — the counter, tiles and map stay in sync
      iRef.current = n; setI(n); progRef.current?.(n);
      const r = n ? rows[n - 1] : null;                     // live map rate emitted from the tick —
      liveRef.current?.(r ? { code: replay.code, value: r.cum_rate } : null);   // not an effect, so no nested updates
      if (x < 1) rafRef.current = requestAnimationFrame(tick); else setDone(true);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
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
    if (instant && i) { liveRef.current?.({ code: replay.code, value: rows[i - 1].cum_rate }); progRef.current?.(i); }
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
        <button onClick={() => { cancelAnimationFrame(rafRef.current);
                               const last = rows[rows.length - 1];
                               iRef.current = rows.length; setI(rows.length); progRef.current?.(rows.length);
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
          <Tile key={rowKey(r)} r={r} scenario={scenario} eng={engineName(replay.engine) ?? replay.engine}
                onAsk={() => getResidentAnswer(replay.programme, r.answer_key,
                          replay.scenarios_selected.length ? replay.scenarios_selected : undefined)
                        .then(setAns).catch(() => null)} />
        ))}
      </div>
      {!scenario && <Reasons cum={cur?.cum_reasons} shorts={replay.reason_shorts} labels={replay.reason_labels} />}
      {ans && (
        <div className="absolute inset-x-0 top-0 z-20">
          <Asked ans={ans} eng={engineName(replay.engine)} onClose={() => setAns(null)} />
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

// Collapsed "how this was computed": the counter, the biggest resident types in the county
// (still clickable for the exact engine prompt/answer popover) and the provenance line.
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
            <Tile key={rowKey(r)} r={r} scenario={scenario} eng={engineName(replay.engine) ?? replay.engine}
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
        {replay.final.group_validation?.length ? (
          <div className="mt-3">
            <div className="t-micro mb-1">Registry 2024 vs simulated — national participation by group</div>
            <table className="w-full text-[10.5px] text-white/65">
              <thead>
                <tr className="text-white/40">
                  <th className="text-left font-normal pb-0.5">group</th>
                  <th className="text-right font-normal pb-0.5 pr-2">registry</th>
                  <th className="text-right font-normal pb-0.5">simulated</th>
                </tr>
              </thead>
              <tbody>
                {replay.final.group_validation.map((r) => (
                  <tr key={r.key} className="border-t border-white/5">
                    <td className="py-0.5 pr-2">{r.group}</td>
                    <td className="text-right tabular-nums pr-2">{fmt(r.registry, "%")}</td>
                    <td className="text-right tabular-nums text-sky-300/80">{fmt(r.simulated, "%")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="t-micro mt-1 leading-snug text-white/40">
              Registry column: {replay.final.group_validation_source?.method ?? "attendees / invitees"} ·{" "}
              {replay.final.group_validation_source?.url ? (
                <a href={replay.final.group_validation_source.url} target="_blank" rel="noreferrer"
                   className="underline decoration-dotted hover:text-white/70">
                  {replay.final.group_validation_source.org} {replay.final.group_validation_source.period}
                </a>
              ) : "Finnish Cancer Registry 2024"}
              {" "}· simulated column: {engineName(replay.engine) ?? "the engine"}, national
            </div>
          </div>
        ) : null}
      </div>
      {ans && (
        <div className="absolute inset-x-0 top-6 z-20">
          <Asked ans={ans} eng={engineName(replay.engine)} onClose={() => setAns(null)} />
        </div>
      )}
    </details>
  );
}

// Step 2a — the DATA answer to "why?": a municipality-level statistical model splits the county's
// gap into what who-lives-here explains and what it does not. All numbers from /api/recommend.split.
const HEADLINE_TEXT: Record<string, string> = {
  mostly_population: "Mostly who lives here",
  mostly_unexplained: "Mostly not explained by who lives here",
  both: "Both: who lives here and something local",
};

function DataBlock({ split, target }: { split: Recommend["split"] | null; target: number }) {
  if (!split) return <Skel className="h-32 mt-2" />;
  const comp = -(split.composition_gap ?? 0);             // >0 = population explains part of the shortfall
  const other = -(split.other_gap ?? 0);                  // >0 = the gap is deeper than composition predicts
  const compNeg = Math.max(0, comp), otherNeg = Math.max(0, other), tot = compNeg + otherNeg;
  const ci = split.composition_gap_90
    ? [Math.min(...split.composition_gap_90.map(Math.abs)), Math.max(...split.composition_gap_90.map(Math.abs))]
    : null;
  const headline = HEADLINE_TEXT[split.headline ?? ""] ?? DRIVER_HEADLINE[split.driver] ?? "";
  const rows = [
    { label: "Actual attendance", v: split.real, bar: "bg-rose-400/80" },
    { label: "Expected from demographics", v: split.expected, bar: "bg-sky-400/80" },
    { label: "Finland average", v: split.national_real, bar: "bg-white/50" },
  ];
  return (
    <div className="slide rounded-xl border border-white/10 bg-white/[0.025] p-3.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="t-panel">{headline || "Demographics vs unexplained"}</div>
        <Tag v="data">DATA · {split.n_municipalities ?? 291} munis</Tag>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[164px_1fr_50px] items-center gap-2">
            <span className="text-[12px] text-white/80 leading-tight truncate">{r.label}</span>
            <span className="relative h-2.5 rounded-full bg-white/[0.07] overflow-hidden">
              <span className={`absolute inset-y-0 left-0 rounded-full ${r.bar}`} style={{ width: `${axisPos(r.v ?? 0)}%` }} />
            </span>
            <span className="text-right text-[12px] font-medium text-white/90 tabular-nums">{r.v != null ? fmt(r.v, "%") : "–"}</span>
          </div>
        ))}
      </div>
      {split.driver === "national" ? (
        <p className="t-caption text-white/65 mt-2.5">
          At Finland&apos;s level — the shortfall to {fmt(target, "%")} is national.
        </p>
      ) : tot > 0 ? (
        <div className="mt-3 pt-2.5 border-t border-white/[0.08]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="t-caption font-medium text-white/75">{fmt(split.total_pts)}-pt gap to Finland</span>
            <span className="t-micro">R² = {split.r2_pct ?? "–"} % across municipalities</span>
          </div>
          <div className="relative mt-1.5">
            <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="bg-sky-400/75 h-full" style={{ width: `${(100 * compNeg) / tot}%` }} />
              <div className="bg-rose-400/75 h-full flex-1" />
            </div>
            {ci && compNeg > 0 && (
              <div className="absolute pointer-events-none border-t-2 border-x-2 border-white/85 rounded-t-[2px]"
                   title={`90 % interval: ${fmt(ci[0])}–${fmt(ci[1])} pts`}
                   style={{ left: `${(100 * Math.min(ci[0], tot)) / tot}%`,
                            width: `${(100 * (Math.min(ci[1], tot) - Math.min(ci[0], tot))) / tot}%`,
                            top: 2, height: 8 }} />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11.5px] text-white/75 mt-2">
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400 mr-1.5 align-middle" />
              Demographics <b className="font-semibold text-white tabular-nums">{split.comp_pts ?? fmt(compNeg)} pts</b>
              {ci && <span className="text-white/45 text-[10.5px]"> ({fmt(ci[0])}–{fmt(ci[1])})</span>}
            </span>
            <span>
              <span className={`inline-block w-2 h-2 rounded-full ${other >= 0 ? "bg-rose-400" : "bg-emerald-400"} mr-1.5 align-middle`} />
              {other >= 0
                ? <>Unexplained <b className="font-semibold text-white tabular-nums">{split.other_pts ?? fmt(otherNeg)} pts</b></>
                : <>{fmt(-other)} pts better than predicted</>}
            </span>
          </div>
        </div>
      ) : null}
      {split.assumption && <div className="mt-1.5"><Assumption text={split.assumption} /></div>}
    </div>
  );
}

// Top-3 who-is-skipping cards from the baseline replay (backend groups by language x activity).
function SkipGroups({ groups, eng, who }: { groups: NonNullable<Replay["final"]["groups"]>; eng: string; who: string }) {
  const cap = who.charAt(0).toUpperCase() + who.slice(1);
  return (
    <div className="space-y-1.5 mt-1.5">
      {groups.map((g, i) => (
        <div key={i} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="text-[12px] text-white/90 font-medium leading-snug truncate">
              {cap} · {g.lang_group === "Finnish or Swedish" ? "Finnish / Swedish" : g.lang_group} · {g.activity}
            </div>
            <div className="t-micro mt-0.5 leading-snug">
              {eng} {fmt(g.rate, "%")} attend
              {g.main_barrier_short && <> · top barrier: <span className="text-sky-300 font-medium">{g.main_barrier_short}</span></>}
            </div>
          </div>
          <span className="shrink-0 rounded-md bg-rose-400/12 border border-rose-300/25 px-2 py-0.5 text-[11px] font-medium text-rose-200 tabular-nums">
            ~{fmt(g.expected_skip)} skip
          </span>
        </div>
      ))}
    </div>
  );
}

// Step 2 — "Why?": (a) the data decomposition, always visible; (b) the simulated residents for
// who-skips-and-why — nothing simulated is shown until the user clicks Run.
export function BaselineStep({ prog, code, rec, who, onLive, munis, onCrowd }: {
  prog: string; code: string; rec: Recommend | null; who: string;
  onLive?: (v: { code: string; value: number } | null) => void;
  munis?: FC | null;                                     // municipality shapes for the resident dots
  crowd?: Crowd | null;
  onCrowd?: (c: Crowd | null | ((p: Crowd | null) => Crowd | null)) => void;
}) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [ran, setRan] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const resRef = useRef<HTMLDivElement>(null);
  useEffect(() => {   // callers key this component by prog:code, so a change remounts it
    let live = true;
    getBaselineReplay(prog, code)
      .then((r) => { if (live) setReplay(r); })
      .catch((e) => { if (live) setErr(String(e instanceof Error ? e.message : e)); });
    return () => { live = false; };
  }, [prog, code]);
  // crowd dots appear only when the run starts; they stay until county/programme changes
  useEffect(() => {
    if (!ran || !replay || !munis) return;
    onCrowd?.((p) => (p && p.prog === replay.programme && p.code === replay.code ? p
                     : buildCrowd(replay, munis, who, engineName(replay.engine) ?? replay.engine)));
  }, [ran, replay, munis]);   // eslint-disable-line react-hooks/exhaustive-deps
  const onProgress = (n: number) => onCrowd?.((p) =>
    (p ? { ...p, revealed: n, revealFrac: p.rows.length ? n / p.rows.length : p.revealFrac } : p));

  if (err) return <div className="t-body text-rose-300 mt-2">{err}</div>;
  const eng = engineName(replay?.engine) ?? engineName(rec?.sim_split?.validation?.engine ?? null) ?? "the engine";
  const simSplit = rec?.sim_split;
  return (
    <>
      <div data-tour="s2-split"><DataBlock split={rec?.split ?? null} target={rec?.screening?.target ?? 80} /></div>

      <div className="mt-3.5 rounded-xl border border-white/10 bg-white/[0.025] p-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="t-section">Who skips, and what stops them</span>
          <SimChip eng={eng} />
        </div>
        {!ran && (
          <>
            <p className="t-caption mt-1.5 leading-snug">
              Synthetic residents built from Statistics Finland census tables answer whether they attend and what blocks them.
            </p>
            {!replay ? <Skel className="h-9 mt-2.5" /> : (
              <button data-tour="s2-ask" onClick={() => setRan(true)}
                      className="mt-2.5 w-full rounded-lg bg-sky-400/18 border border-sky-300/40 text-sky-100 font-medium text-[12.5px] py-2
                                 hover:bg-sky-400/28 transition-colors">
                Ask {replay.rows.length} simulated resident types in {replay.name} →
              </button>
            )}
          </>
        )}
        {ran && replay && !done && (
          <ReplayPlayer replay={replay} who={who} onLive={onLive} onProgress={onProgress} onDone={() => setDone(true)} />)}
        {done && !replay && <Skel className="h-24 mt-3" />}
        {done && replay && (
          <div ref={resRef} className="mt-2.5 slide" data-tour="s2-groups">
            {replay.final.groups?.length ? (
              <div>
                <div className="t-micro uppercase tracking-wider text-white/50">Largest non-attending groups</div>
                <SkipGroups groups={replay.final.groups} eng={eng} who={who} />
              </div>
            ) : null}
            <div className="mt-3">
              <div className="t-micro uppercase tracking-wider text-white/50">Top barriers among non-attendees</div>
              <Reasons cum={replay.rows[replay.rows.length - 1]?.cum_reasons}
                       shorts={replay.reason_shorts} labels={replay.reason_labels} big />
            </div>
            {simSplit?.composition_gap != null && simSplit.other_gap != null && (
              <p className="t-micro mt-3 leading-snug">
                Model split ({eng}): demographics {fmt(Math.abs(simSplit.composition_gap))} pts · unexplained {fmt(Math.abs(simSplit.other_gap))} pts.
              </p>
            )}
            <div className="mt-2 pt-2 border-t border-white/[0.08]"><ReplayDetails replay={replay} who={who} /></div>
          </div>
        )}
      </div>
    </>
  );
}

// Step 3 — "What would help?": pick interventions, run the residents again, compare attempts.
export function ScenarioStep({ prog, code, rec, who, onLive, munis, crowd, onCrowd, onRanCombo }: {
  prog: string; code: string; rec: Recommend | null; who: string;
  onLive?: (v: { code: string; value: number } | null) => void;
  munis?: FC | null;
  crowd?: Crowd | null;
  onCrowd?: (c: Crowd | null | ((p: Crowd | null) => Crowd | null)) => void;
  onRanCombo?: (item: string) => void;                   // "prog:code:scen+scen" for the report entry point
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
  // baseline replay is prefetched on mount so Run starts raining dots in the same frame —
  // the ~1.2 s fetch otherwise leaves the map silent before the reveal can begin
  const baseRef = useRef<Replay | null>(null);
  useEffect(() => {
    let live = true;
    getBaselineReplay(prog, code).then((b) => { if (live) baseRef.current = b; }).catch(() => null);
    return () => { live = false; };
  }, [prog, code]);
  // baseline crowd must exist before the scenario flips dots — but raining the dots in over
  // ~1.8 s is the visible "the residents are answering" beat, so reveal them progressively
  const revealRef = useRef(0);
  useEffect(() => () => cancelAnimationFrame(revealRef.current), []);
  const revealBaseline = (b: Replay) => {
    const instant = reduced();
    cancelAnimationFrame(revealRef.current);
    onCrowd?.((p) => {
      const base = p && p.prog === b.programme && p.code === b.code
        ? { ...p, flip: {}, scenarios: [...sel],
            pRow: b.rows.map((r) => r.p_cal ?? r.jev_attend) }
        : { ...buildCrowd(b, munis ?? null, who, engineName(b.engine) ?? b.engine),
            scenarios: [...sel] };
      return { ...base, revealed: instant ? b.rows.length : 0, revealFrac: instant ? 1 : 0 };
    });
    if (instant) return;
    const t0 = performance.now();
    const sweep = (t: number) => {
      // cover the fetch wait only — once the scenario replay starts, its own progress drives the rain
      const x = Math.min(1, (t - t0) / 2200) * 0.45;
      const n = Math.round(x * b.rows.length);
      onCrowd?.((p) => (p ? { ...p, revealed: Math.max(p.revealed, n),
                                  revealFrac: Math.max(p.revealFrac, x) } : p));
      if (x < 0.45) revealRef.current = requestAnimationFrame(sweep);
    };
    revealRef.current = requestAnimationFrame(sweep);
  };
  const run = () => {
    if (!sel.size || busy) return;
    setBusy(true); setErr(null); setDone(false);
    (baseRef.current ? Promise.resolve(baseRef.current) : getBaselineReplay(prog, code))
      .then(revealBaseline).catch(() => null);
    getResidents(prog, code, [...sel])
      .then((r) => { setReplay(r); setRunId((x) => x + 1);
                     onRanCombo?.(`${prog}:${code}:${[...sel].sort().join("+")}`); })
      .catch((e) => { setErr(String(e instanceof Error ? e.message : e));
                      // the wait-cover sweep caps at 45% — finish the reveal so the map isn't left half-empty
                      onCrowd?.((p) => (p ? { ...p, revealed: p.rows.length, revealFrac: 1 } : p)); })
      .finally(() => setBusy(false));
  };
  useEffect(() => {   // a crowd built before municipalities loaded has zero dots — rebuild it once
    if (!munis || !crowd || crowd.dots.length || crowd.prog !== prog || crowd.code !== code) return;
    getBaselineReplay(prog, code).then((b) => {
      const c = buildCrowd(b, munis, who, engineName(b.engine) ?? b.engine);
      onCrowd?.((p) => (p && p.prog === prog && p.code === code && !p.dots.length
        ? { ...c, revealed: p.revealed, revealFrac: p.revealFrac, scenarios: p.scenarios, flip: p.flip, pRow: p.pRow } : p));
    }).catch(() => null);
  }, [crowd, munis, prog, code]);   // eslint-disable-line react-hooks/exhaustive-deps
  // scenario progress n -> rain the baseline dots in with the counter AND flip revealed scenario
  // rows to their new p_cal — one shared pace, so the map never stalls mid-run
  const onProgress = (n: number) => onCrowd?.((p) => {
    if (!p || !replay) return p;
    const idx = scenarioRowIndex(p);
    const pRow = [...p.pRow]; const flip = { ...p.flip };
    for (let j = 0; j < Math.min(n, replay.rows.length); j++) {
      const i = idx.get(rowKey(replay.rows[j]));
      if (i != null) { pRow[i] = replay.rows[j].p_cal ?? pRow[i]; flip[i] = replay.rows[j]; }
    }
    const frac = n / replay.rows.length;
    return { ...p, pRow, flip, revealed: Math.max(p.revealed, Math.round(frac * p.rows.length)),
                   revealFrac: Math.max(p.revealFrac, frac) };
  });
  const w = done ? replay?.whatif : null;
  const onDone = () => {
    setDone(true);
    const w2 = replay?.whatif;
    if (w2) setTried((t) => [...t, { label: replay.scenarios_selected.map(shortOf).join(" + "),
                                    pct: w2.gap_closed_pct, extra: w2.extra_people_per_year, live: w2.asked_live }]);
  };

  return (
    <>
      <div className="t-caption mb-2">Choose interventions to re-run simulated residents:</div>
      <div className="grid grid-cols-2 gap-2" data-tour="s3-interv">
        {opts.map((s, i) => {
          const on = sel.has(s.scenario);
          return (
            <button key={s.scenario} data-tour={i === 0 ? "s3-chip0" : undefined}
                    onClick={() => toggle(s.scenario)} title={s.label}
                    className={`rounded-lg border px-2.5 py-2 text-left transition-all ${
                      on ? "border-emerald-400/60 bg-emerald-400/12 text-white shadow-[inset_0_1px_0_rgba(110,231,183,0.15)]"
                         : "border-white/10 bg-white/[0.03] text-white/80 hover:border-white/25 hover:bg-white/[0.06]"}`}>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[12px] font-medium leading-tight truncate">{s.short ?? s.label}</span>
                <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] shrink-0 border ${
                  on ? "border-emerald-300 bg-emerald-400 text-slate-950 font-bold" : "border-white/20 bg-transparent text-transparent"}`}>✓</span>
              </div>
              {s.actions[0] && (
                <div className="text-[10px] text-amber-300/80 mt-0.5 tabular-nums">
                  Action {s.actions[0].id} · p.{s.actions[0].page}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <button data-tour="s3-run" onClick={run} disabled={!sel.size || busy}
              className="mt-2.5 w-full rounded-lg bg-emerald-400/20 border border-emerald-300/45 text-emerald-100 font-medium text-[12.5px] py-2
                         hover:bg-emerald-400/30 disabled:opacity-35 disabled:cursor-not-allowed transition-colors">
        {busy ? "Asking simulated residents…" : "Run simulation →"}
      </button>
      {err && <div className="t-body text-rose-300 mt-2">{err}</div>}
      {replay && !busy && !done && (
        <ReplayPlayer key={runId} replay={replay} who={who} onLive={onLive} onProgress={onProgress} onDone={onDone} />)}
      {w && replay && (() => {
        const oe = w.other_engine;
        const both = oe?.extra_people_per_year != null && w.extra_people_per_year != null;
        const ex = w.extra_people_per_year;
        const low = both ? Math.min(oe!.extra_people_per_year!, ex!) : ex;
        const high = both ? Math.max(oe!.extra_people_per_year!, ex!) : ex;
        const pcts = [w.gap_closed_pct, oe?.gap_closed_pct].filter((x): x is number => x != null);
        const loPct = pcts.length ? Math.min(...pcts) : null;
        const hiPct = pcts.length ? Math.max(...pcts) : null;
        const missing = w.missing_per_year;
        const gapLine = missing != null && low != null && high != null
          ? low >= missing
            ? `Closes the entire gap of ${fmt(missing)} / yr`
            : high >= missing
              ? `Closes up to the entire gap of ${fmt(missing)} / yr`
              : loPct != null && hiPct != null
                ? `Closes ${loPct === hiPct ? loPct : `${loPct}–${hiPct}`} % of the ${fmt(missing)} annual gap`
                : null
          : null;
        return (
        <div ref={resRef} className="mt-3 slide" data-tour="s3-result">
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3.5">
            <div className="text-[24px] font-semibold leading-none tabular-nums text-emerald-300">
              {both ? `+${fmt(low)} to +${fmt(high)}` : sgn(ex)}{" "}
              <span className="text-[14px] font-normal text-emerald-200/80">{who} / yr</span>
            </div>
            {gapLine && <div className="text-[12px] text-white/85 mt-1.5 font-medium">{gapLine}</div>}
            <div className="relative h-2.5 rounded-full bg-white/[0.08] overflow-hidden mt-2" title="share of the gap closed, per model">
              {loPct != null && hiPct != null && (
                <div className="absolute inset-y-0 bg-emerald-400/40 rounded-full"
                     style={{ left: `${Math.max(0, Math.min(100, loPct))}%`,
                              width: `${Math.min(100, Math.max(0, hiPct)) - Math.max(0, Math.min(100, loPct))}%` }} />
              )}
              {w.gap_closed_pct != null && (
                <div className="absolute inset-y-0 w-[3px] bg-emerald-300 rounded-full"
                     title={`${engineName(w.engine) ?? w.engine}: ${w.gap_closed_pct} %`}
                     style={{ left: `calc(${Math.max(0, Math.min(100, w.gap_closed_pct))}% - 1.5px)` }} />
              )}
            </div>
            <div className="t-micro mt-2 text-white/55">
              {both
                ? <>{engineName(w.engine) ?? w.engine} {sgn(ex)} · {engineName(oe!.engine) ?? oe!.engine} {sgn(oe!.extra_people_per_year)} · </>
                : null}
              simulated upper bound · {w.from_cache} resident types changed{w.asked_live ? ` · ${w.asked_live} live calls` : ""}
            </div>
          </div>

          <div className="mt-3.5">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="t-caption font-medium text-white/80">Cited roadmap actions</span>
              <span className="t-micro">●●● direct · ●● partial fit</span>
            </div>
            <div className="space-y-1.5">
              {w.scenarios.map((s) => (
                <div key={s.scenario} className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 space-y-1.5">
                  <div className="text-[11.5px] font-medium text-white/80 leading-snug">{s.label}</div>
                  {s.actions.map((a) => (
                    <div key={a.id} className="flex items-start gap-2">
                      <Cite a={a} />
                      <span className="text-[11.5px] text-white/65 leading-snug">
                        {a.title_en ?? a.title}
                        {a.partial_match && <span className="text-white/40"> · partial fit</span>}
                      </span>
                    </div>
                  ))}
                  {s.assumption && <Assumption text={s.assumption} />}
                </div>
              ))}
            </div>
          </div>
          {tried.length > 0 && (
            <div className="mt-3.5 pt-2.5 border-t border-white/10">
              <div className="t-micro uppercase tracking-wider text-white/50 mb-1.5">Session runs</div>
              <div className="space-y-1">
                {tried.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-[11px] text-white/70 truncate" title={t.label}>{t.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-white/[0.07] overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-400/60" style={{ width: `${Math.min(100, Math.max(0, t.pct ?? 0))}%` }} />
                    </div>
                    <span className="w-28 text-right text-[11px] tabular-nums text-emerald-300 shrink-0">
                      {sgn(t.extra)} /yr{t.pct != null && <> · {t.pct > 100 ? "> gap" : `${t.pct} %`}</>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3"><ReplayDetails replay={replay} who={who} /></div>
        </div>
        );
      })()}
    </>
  );
}
