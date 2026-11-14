"use client";
// Presentation mode: the 2-minute story from PITCH.md as seven slides.
// Every number is fetched from the API — nothing is typed in, except the
// stage-coverage quote on the limits slide (labelled "from report text").
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  engineName, fmt, getBrief, getCorrelation, getRecommend, getValues, getWhatif,
  type Brief, type Correlation, type Recommend, type Source, type Values, type WhatIf,
} from "@/lib/api";
import { DataChip, RoadmapChip, SimChip } from "@/components/RecommendBlock";

const STAGE_REPORT_URL = "https://syoparekisteri.fi/assets/themes/ssy3/factsheets/syopa_2024_tilastoraportti.html";

const SrcLine = ({ children }: { children: React.ReactNode }) => (
  <div className="absolute bottom-6 left-0 right-0 text-center text-[11px] text-white/35 px-8">{children}</div>
);
const SrcName = ({ s }: { s?: Source | null }) =>
  s ? <span>{s.org} · {s.period ?? s.year} · <a href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline decoration-dotted hover:text-amber-300">source</a></span> : null;

const Big = ({ v, u }: { v: number | null | undefined; u?: string }) => (
  <span className="text-[96px] leading-none font-semibold tabular-nums text-amber-300">{fmt(v)}{u && <span className="text-[40px] text-amber-300/80"> {u}</span>}</span>
);
const Kicker = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[12px] uppercase tracking-[0.2em] text-white/40 mb-4">{children}</div>
);

const bar = (v: number, max: number, cls: string) => (
  <div className="h-full rounded-r-md" style={{ width: `${Math.max(1.5, (Math.abs(v) / max) * 100)}%`, background: cls }} />
);

export default function Story() {
  const [i, setI] = useState(0);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [rec, setRec] = useState<Recommend | null>(null);        // Helsinki breast
  const [recQ, setRecQ] = useState<Recommend | null>(null);      // Satakunta (queue citations)
  const [wi, setWi] = useState<WhatIf | null>(null);
  const [wait, setWait] = useState<Values | null>(null);
  const [cors, setCors] = useState<Correlation[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getBrief().then(setBrief),
      getRecommend("breast", "90").then(setRec),
      getRecommend("breast", "06").then(setRecQ),
      getWhatif("breast", "90", ["own_language", "sms_reminder"]).then(setWi),
      getValues("onc_wait_90").then(setWait),
      Promise.all([
        getCorrelation("screen_breast", "surv_breast"),
        getCorrelation("screen_bowel", "surv_bowel"),
        getCorrelation("screen_cervix", "surv_cervix"),
      ]).then(setCors),
    ]).catch((e) => setErr(String(e instanceof Error ? e.message : e)));
  }, []);

  const N = 7;
  const next = () => setI((x) => Math.min(N - 1, x + 1));
  const prev = () => setI((x) => Math.max(0, x - 1));
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) { e.preventDefault(); next(); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); prev(); }
      if (e.key === "Home") setI(0); if (e.key === "End") setI(N - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const breast = brief?.programmes.find((p) => p.programme === "breast");
  const hel = breast?.counties[0];
  const r = breast?.validation?.counties_weighted?.r;
  const split = rec?.split;
  const corrRange = cors.length ? [Math.min(...cors.map((c) => c.r)), Math.max(...cors.map((c) => c.r))] : null;
  const waitRows = wait
    ? Object.entries(wait.values).map(([code, v]) => ({ code, ...v })).sort((a, b) => b.value - a.value).slice(0, 9)
    : [];
  const waitMax = waitRows.length ? Math.max(waitRows[0].value, wait?.national ?? 0) : 1;
  const queueActions = (recQ?.pathway_actions ?? []).filter((a) => ["3.1.2", "3.1.4"].includes(a.id));

  const slides = [
    // 1 — Title
    <div key={0} className="text-center">
      <Kicker>Junction 2026 · AstraZeneca challenge</Kicker>
      <h1 className="text-[56px] font-semibold leading-tight">Equal Care Across Finland</h1>
      <p className="text-[20px] text-white/60 mt-5">Where does cancer care fall behind, and what should each county do?</p>
      <p className="text-[13px] text-white/40 mt-8">A map of Finland&apos;s 23 wellbeing services counties — public data only,<br />a source behind every number, recommendations cited to the national roadmap.</p>
      <SrcLine>THL Sotkanet · THL Hoitoon pääsy · Statistics Finland (CC BY 4.0) · Kansallinen syöpästrategia, roadmap 2026–2031</SrcLine>
    </div>,

    // 2 — Helsinki is furthest behind
    <div key={1} className="w-full max-w-3xl">
      <Kicker>Breast cancer screening attendance, 2024 · <DataChip s={hel?.screening?.source} /></Kicker>
      <div className="glass p-8 text-center">
        <div className="text-[16px] text-white/55">The county furthest from the {fmt(hel?.screening?.target, "%")} target is not in the countryside.</div>
        <div className="mt-4"><Big v={hel?.screening?.rate} u="%" /></div>
        <div className="text-[26px] font-semibold mt-2">{hel?.name ?? "…"}</div>
        <div className="mt-4 text-[18px] text-rose-300">about <b className="tabular-nums">{fmt(hel?.screening?.missing_per_year)}</b> women a year missing
          <span className="text-white/45 text-[14px]"> of {fmt(hel?.screening?.invited)} invited</span></div>
        <div className="mt-6 space-y-1.5">
          {breast?.counties.map((c) => (
            <div key={c.code} className="flex items-center gap-3 text-[13px]">
              <span className="w-40 text-right text-white/60 truncate">{c.name}</span>
              <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">{bar(c.screening?.rate ?? 0, 100, c.code === "90" ? "#f43f5e88" : "#f5b94255")}</div>
              <span className="w-14 text-left tabular-nums text-white/70">{fmt(c.screening?.rate)} %</span>
            </div>
          ))}
        </div>
      </div>
      <SrcLine><SrcName s={hel?.screening?.source} />{hel?.screening?.source?.indicator ? ` · Sotkanet indicator #${hel.screening.source.indicator}` : ""}</SrcLine>
    </div>,

    // 3 — The gap is services, not residents
    <div key={2} className="w-full max-w-3xl">
      <Kicker>Where the gap comes from — simulated residents <SimChip eng={split?.note?.replace("Simulation · ", "")} /></Kicker>
      <div className="glass p-8">
        <div className="text-[16px] text-white/60">Helsinki&apos;s gap to the national rate, in points:</div>
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-44 text-[13px] text-white/60 text-right">population composition</span>
            <div className="flex-1 h-7 rounded bg-white/5 overflow-hidden">{bar(Math.abs(split?.composition_gap ?? 0), 8, "#38bdf8aa")}</div>
            <span className={`w-20 tabular-nums ${Math.abs(split?.composition_gap ?? 0) >= Math.abs(split?.other_gap ?? 0) ? "text-sky-300 font-semibold" : "text-white/80"}`}>{Math.abs(split?.composition_gap ?? 0).toFixed(1)} pts</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-44 text-[13px] text-white/60 text-right">services — unexplained</span>
            <div className="flex-1 h-7 rounded bg-white/5 overflow-hidden">{bar(Math.abs(split?.other_gap ?? 0), 8, "#f43f5eaa")}</div>
            <span className={`w-20 tabular-nums ${Math.abs(split?.composition_gap ?? 0) >= Math.abs(split?.other_gap ?? 0) ? "text-white/80" : "text-rose-300 font-semibold"}`}>{Math.abs(split?.other_gap ?? 0).toFixed(1)} pts</span>
          </div>
        </div>
        <p className="mt-6 text-[14px] text-white/55 leading-relaxed">
          We rebuilt Finland&apos;s 50–74 year olds from Statistics Finland tables and asked simulated residents whether they
          would attend. {split?.driver === "services"
            ? "Almost none of the capital’s gap is explained by who lives there — the lever is services: access, appointment times, and private mammography counted as absence."
            : "In Helsinki the simulated gap tracks who lives there — age, language and where people get their care — so the lever is targeted outreach: invitations and reminders in people’s own language."}
        </p>
        <p className="mt-3 text-[12.5px] text-white/40">Validated against real 2024 county rates: r = {r ?? "…"} {split?.note ? `· ${split.note}` : ""}</p>
      </div>
      <SrcLine>Simulated residents ({split?.note?.replace("Simulation · ", "") ?? "…"}) vs THL / Sotkanet 2024 · Statistics Finland population tables</SrcLine>
    </div>,

    // 4 — Actions and the live what-if
    <div key={3} className="w-full max-w-3xl">
      <Kicker>What to do — every recommendation cites a roadmap action <RoadmapChip /></Kicker>
      <div className="glass p-7">
        <div className="space-y-2">
          {rec?.scenarios.map((s) => (
            <div key={s.scenario} className="flex items-baseline gap-3 border-b border-white/5 pb-2">
              <span className="flex-1 text-[13.5px] text-white/80 leading-tight">{s.label}</span>
              <span className="tabular-nums text-emerald-300 font-semibold w-24 text-right">+{fmt(s.extra_people_per_year)}/yr</span>
              <span className="w-44 text-right space-x-1.5">
                {s.actions.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                     title={a.title_en ?? a.title}
                     className="tag tag-roadmap">{a.id} · p.{a.page}</a>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.06] p-4">
          <div className="text-[11px] uppercase tracking-wide text-emerald-300/80">Live simulation · combine interventions <SimChip eng={engineName(wi?.engine)} /></div>
          <div className="mt-1.5 text-[20px] font-semibold text-emerald-300 tabular-nums">
            +{fmt(wi?.extra_people_per_year)} people/yr
            <span className="text-white/60 font-normal text-[14px]"> · {wi?.gap_closed_pct != null && wi.gap_closed_pct > 100 ? "more than closes the gap (upper bound)" : <>closes {fmt(wi?.gap_closed_pct, "%")} of the gap</>} · {wi?.delta_points != null && wi.delta_points > 0 ? "+" : ""}{wi?.delta_points} pts</span>
          </div>
          <div className="text-[11.5px] text-white/40 mt-1">
            {wi?.name}: own language + SMS reminder · live calls {wi?.asked_live ?? "…"} · cached {wi?.from_cache ?? "…"} · an upper bound from the model, not a forecast
          </div>
        </div>
      </div>
      <SrcLine>Kansallisen syöpästrategian toimeenpanon tiekartta 2026–2031 (action ids and pages) · simulated residents</SrcLine>
    </div>,

    // 5 — Goal 3: oncology queue
    <div key={4} className="w-full max-w-3xl">
      <Kicker>Goal 3 — further down the pathway: oncology waiting over 90 days</Kicker>
      <div className="glass p-7">
        {corrRange && (
          <p className="text-[13.5px] text-white/55 mb-4">
            Screening does not explain survival: county-level r between {corrRange[0].toFixed(2)} and {corrRange[1] >= 0 ? "+" : ""}{corrRange[1].toFixed(2)}.
            The gap emerges later — this is where THL&apos;s monthly queue data shows it.
          </p>
        )}
        <div className="space-y-1.5">
          {waitRows.map((w) => (
            <div key={w.code} className="flex items-center gap-3 text-[13px]">
              <span className="w-44 text-right text-white/60 truncate">{w.name.replace(" hyvinvointialue", "").replace("n hyvinvointialue", "")}</span>
              <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">{bar(w.value, waitMax, "#f43f5e99")}</div>
              <span className="w-14 text-left tabular-nums text-white/80">{fmt(w.value)} %</span>
              <span className="w-28 text-[11px] text-white/40">
                n = {fmt(w.abs_value)}{w.abs_value != null && w.abs_value < 30 && <span className="tag tag-warn ml-1"><i>small n</i></span>}
                {w.shared_producer && <span title={`reported under ${w.shared_producer}`}> ·{w.shared_producer}</span>}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-3 text-[13px] pt-1 border-t border-white/10">
            <span className="w-44 text-right text-white/80 font-semibold">Finland</span>
            <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">{bar(wait?.national ?? 0, waitMax, "#f5b942aa")}</div>
            <span className="w-14 text-left tabular-nums text-amber-300 font-semibold">{fmt(wait?.national)} %</span>
            <span className="w-28" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4 text-[12.5px]">
          <span className="text-white/50">Recommendation:</span>
          {queueActions.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
               title={a.title} className="text-amber-300/90 underline decoration-dotted hover:text-amber-200">
              Roadmap {a.id}, p.{a.page} — {a.title_en ?? a.title}
            </a>
          ))}
        </div>
      </div>
      <SrcLine><SrcName s={wait?.source} /> · correlations: THL / Sotkanet, county level</SrcLine>
    </div>,

    // 6 — Limits
    <div key={5} className="w-full max-w-3xl">
      <Kicker>What the data cannot show</Kicker>
      <div className="glass p-8">
        <ul className="space-y-3 text-[15px] text-white/70 leading-relaxed list-disc pl-5">
          <li>Screening attendance counts only the public programme — private and occupational mammography count as absence.</li>
          <li>Sotkanet survival rates come without case counts, so small counties (Åland) are noisy.</li>
          <li>Oncology queue data covers non-urgent care and is reported per producer — Helsinki and the four Uusimaa counties share the HUS figure.</li>
          <li>Small denominators are flagged: every queue value shows its n.</li>
          <li>Simulated effects are upper bounds from a model — labelled Simulation everywhere, never shown as data.</li>
        </ul>
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1.5">from report text</div>
          <p className="text-[14.5px] text-white/75 italic leading-relaxed">
            “Stage at diagnosis is recorded for only 42 % of cancers nationally, 72 % in Pirkanmaa — against a ≥ 70 % goal.”
          </p>
          <p className="text-[12px] text-white/45 mt-2">
            Until the quality registry (roadmap 3.2.1) exists, no one can say which county diagnoses late.
            Per-county values exist only as a chart image, so they are not an indicator here.
            <a href={STAGE_REPORT_URL} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
               className="underline decoration-dotted hover:text-amber-300 ml-1">Syöpärekisteri, Syöpä 2024 report, chapter 5</a>
          </p>
        </div>
      </div>
      <SrcLine>Sotkanet method notes · THL Hoitoon pääsy · CLAUDE.md data limits · Finnish Cancer Registry 2024 report</SrcLine>
    </div>,

    // 7 — Beyond Junction
    <div key={6} className="w-full max-w-2xl text-center">
      <Kicker>Beyond Junction</Kicker>
      <div className="glass p-8 text-left">
        <ul className="space-y-3 text-[15px] text-white/70 leading-relaxed list-disc pl-5">
          <li>A pilot with one county: monthly refresh from THL and Sotkanet, the what-if run before each procurement round.</li>
          <li>Stage-at-diagnosis coverage the day the Cancer Registry publishes its county table — the schema is ready for it.</li>
          <li>The simulation engine is switchable — Gemini Decisions today, Jev with one setting (<code className="text-amber-300/80">SIM_ENGINE=jev</code>); both caches ship in the repo.</li>
        </ul>
        <p className="mt-7 text-center text-[19px] text-white/85 font-medium">
          Public data, a source behind every number,<br />and an action a county can put in its next procurement.
        </p>
        <div className="mt-6 text-center">
          <Link href="/" onClick={(e) => e.stopPropagation()} className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-[13px] text-white/85 hover:bg-white/10 inline-block">Open the live map →</Link>
        </div>
      </div>
      <SrcLine>equal-care · Junction 2026</SrcLine>
    </div>,
  ];

  return (
    <main className="relative h-screen w-screen overflow-hidden flex items-center justify-center cursor-pointer select-none"
          onClick={next}>
      {err && <div className="absolute top-5 left-1/2 -translate-x-1/2 tag tag-warn z-10">API error: {err}</div>}
      <div key={i} className="slide px-6 flex justify-center w-full">{slides[i]}</div>
      <div className="absolute bottom-5 right-7 flex items-center gap-3 z-10" onClick={(e) => e.stopPropagation()}>
        {i > 0 && <button onClick={prev} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/60 hover:text-white">←</button>}
        <div className="flex gap-1.5">
          {slides.map((_, k) => (
            <button key={k} onClick={() => setI(k)} aria-label={`slide ${k + 1}`}
                    className={`w-2 h-2 rounded-full ${k === i ? "bg-white" : "bg-white/20 hover:bg-white/40"}`} />
          ))}
        </div>
        <span className="text-[11px] text-white/35 tabular-nums">{i + 1} / {N}</span>
        {i < N - 1 && <button onClick={next} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/60 hover:text-white">→</button>}
      </div>
      <Link href="/" onClick={(e) => e.stopPropagation()}
            className="absolute top-5 left-6 text-[11px] uppercase tracking-wide text-white/35 hover:text-amber-300 z-10">← map</Link>
    </main>
  );
}
