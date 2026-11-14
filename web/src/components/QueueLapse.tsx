"use client";
// Oncology queue time-lapse (step 4): plays the monthly THL care-access periods on the map —
// each tick pushes a Values payload for that period up to the choropleth. County vs Finland is
// drawn as a small SVG line chart; n (patients) and shared-producer warnings stay visible.
import { useEffect, useRef, useState } from "react";
import { fmt, getTimeline, getValues, type Timeline, type Values } from "@/lib/api";
import { Src } from "@/components/RegionCard";
import { Skel } from "@/components/ui";

const PERIOD = (p: number) => `${String(p).slice(4, 6)}.${String(p).slice(0, 4)}`;   // 202609 -> "09.2026"
const STEP_MS = 350;

export default function QueueLapse({ kkey, code, onValues }: {
  kkey: "onc_wait_90" | "onc_ref_21"; code: string;
  onValues: (v: Values | null) => void;   // monthly choropleth override; null on unmount
}) {
  const [tl, setTl] = useState<Timeline | null>(null);
  const [tpl, setTpl] = useState<Values | null>(null);        // latest-year fetch — names + target
  const [pi, setPi] = useState(0);
  const [play, setPlay] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onValuesRef = useRef(onValues);
  useEffect(() => { onValuesRef.current = onValues; });

  useEffect(() => {
    let on = true;
    Promise.all([getTimeline(kkey), getValues(kkey)])
      .then(([t, v]) => { if (on) { setTl(t); setTpl(v); setPi(t.periods.length - 1); } })
      .catch((e) => on && setErr(String(e instanceof Error ? e.message : e)));
    return () => { on = false; };
  }, [kkey]);

  // push the current month's values to the map; clear the override when the component unmounts
  useEffect(() => {
    if (!tl || !tl.periods.length) return;
    const p = tl.periods[pi];
    const rows = tl.values[String(p)] ?? {};
    const names = tpl?.values ?? {};
    onValuesRef.current({
      key: tl.key, label: tl.label, unit: tl.unit, level: "county", year: p,
      higher_is_better: tl.higher_is_better,
      target: tpl?.target ?? null, target_note: tpl?.target_note ?? null,
      national: tl.national[String(p)] ?? null,
      values: Object.fromEntries(Object.entries(rows).map(([c, r]) =>
        [c, { name: names[c]?.name ?? c, value: r.value, abs_value: r.abs_value,
              shared_producer: r.shared }])),
      source: { ...tl.source, period: PERIOD(p) },
    });
  }, [tl, tpl, pi]);
  useEffect(() => () => onValuesRef.current(null), []);

  // playback: ~350 ms per month, stops at the end (derived — see `playing` below). No autoplay.
  useEffect(() => {
    if (!play || !tl || pi >= tl.periods.length - 1) return;
    const t = setTimeout(() => setPi(pi + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [play, pi, tl]);

  if (err) return <div className="t-body text-rose-300 mt-2">{err}</div>;
  if (!tl) return <Skel className="h-24 mt-2" />;

  const p = tl.periods[pi];
  const playing = play && pi < tl.periods.length - 1;   // derived: stops at the last period
  const cur = tl.values[String(p)]?.[code];
  const smallN = cur?.abs_value != null && cur.abs_value < 30;

  // county vs Finland across all periods; gaps in either series stay gaps in the polyline
  const countySeries = tl.periods.map((pp) => tl.values[String(pp)]?.[code]?.value ?? null);
  const natSeries = tl.periods.map((pp) => tl.national[String(pp)] ?? null);
  const all = [...countySeries, ...natSeries].filter((v): v is number => v != null);
  const lo = Math.min(...all), hi = Math.max(...all), span = Math.max(0.5, hi - lo);
  const W = 400, H = 86, PX = 8, PY = 10;
  const X = (i: number) => PX + (i / Math.max(1, tl.periods.length - 1)) * (W - 2 * PX);
  const Y = (v: number) => PY + (1 - (v - lo) / span) * (H - 2 * PY);
  const line = (s: (number | null)[]) =>
    s.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`))
     .filter(Boolean).join(" ");

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <div className="flex items-center gap-2">
        <button onClick={() => { if (playing) setPlay(false); else { if (pi >= tl.periods.length - 1) setPi(0); setPlay(true); } }}
                title={playing ? "Pause" : "Play the months"}
                className="w-6 h-6 rounded-full bg-sky-400/15 border border-sky-300/35 text-sky-200 text-[10px]
                           flex items-center justify-center hover:bg-sky-400/25">
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="t-caption leading-tight">
          {tl.label} · <span className="text-white/80">{PERIOD(p)}</span>
        </div>
      </div>
      <input type="range" min={0} max={tl.periods.length - 1} value={pi} disabled={playing}
             onChange={(e) => setPi(Number(e.target.value))}
             className="w-full mt-2 accent-sky-400" aria-label="month" />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[86px] mt-1" preserveAspectRatio="none">
        <polyline points={line(natSeries)} fill="none" stroke="rgba(255,255,255,0.35)"
                  strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <polyline points={line(countySeries)} fill="none" stroke="#7dd3fc" strokeWidth="2"
                  vectorEffect="non-scaling-stroke" />
        <line x1={X(pi)} x2={X(pi)} y1={PY - 4} y2={H - PY + 4} stroke="rgba(255,255,255,0.25)"
              strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {countySeries.map((v, i) => v == null ? null : (
          <g key={i}>
            <circle cx={X(i)} cy={Y(v)} r={i === pi ? 4 : 2.2}
                    fill={i === pi ? "#f0abfc" : "#7dd3fc"} opacity={i === pi ? 1 : 0.8}>
              <title>{`${PERIOD(tl.periods[i])}: ${fmt(v, tl.unit)}${tl.values[String(tl.periods[i])]?.[code]?.abs_value != null
                ? ` · n = ${fmt(tl.values[String(tl.periods[i])][code].abs_value)}` : ""}`}</title>
            </circle>
            <circle cx={X(i)} cy={Y(v)} r={8} fill="transparent">
              <title>{`${PERIOD(tl.periods[i])}: ${fmt(v, tl.unit)}${tl.values[String(tl.periods[i])]?.[code]?.abs_value != null
                ? ` · n = ${fmt(tl.values[String(tl.periods[i])][code].abs_value)}` : ""}`}</title>
            </circle>
          </g>
        ))}
        {natSeries.map((v, i) => v == null ? null : (
          <circle key={`n${i}`} cx={X(i)} cy={Y(v)} r={1.6} fill="rgba(255,255,255,0.45)">
            <title>{`Finland ${PERIOD(tl.periods[i])}: ${fmt(v, tl.unit)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="t-micro mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span><span className="text-sky-300">—</span> {cur ? fmt(cur.value, tl.unit) : "no data"}</span>
        <span><span className="text-white/50">┅</span> Finland {fmt(tl.national[String(p)], tl.unit)}</span>
        {cur?.abs_value != null && <span>n = {fmt(cur.abs_value)} patients{smallN && <span className="text-amber-300"> · small numbers</span>}</span>}
        {cur?.shared && <span>shared producer {cur.shared}</span>}
        <span className="ml-auto"><Src s={tl.source} /></span>
      </div>
    </div>
  );
}
