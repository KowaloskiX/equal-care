"use client";
// Generated report: /report?items=breast:90,bowel:07  (programme:countyCode[:scenario+scenario], comma-separated)
// Optional: &view=slides to open the deck, &api=http://localhost:8020 to use another API origin.
// Gemini writes the prose with {fact} placeholders; the backend fills in every number from FACTS and flags the rest.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Seg, Skel } from "@/components/ui";
import { Briefing } from "@/components/report/Briefing";
import { Deck } from "@/components/report/Deck";
import { apiBase, factsOnly, getCover, parseItems, postReport, type Cover, type ReportResponse } from "@/lib/report";

type View = "briefing" | "slides";
const VIEWS = [{ id: "briefing", label: "Briefing" }, { id: "slides", label: "Slides" }] as const;

const PRINT_CSS = `
@media print {
  html, body { background: #fff !important; color: #111 !important; }
  .no-print, .report-deck { display: none !important; }
  .report-doc { max-width: none !important; padding: 0 !important; }
  .report-doc, .report-doc * { color: #111 !important; background: transparent !important; box-shadow: none !important;
    backdrop-filter: none !important; -webkit-backdrop-filter: none !important; border-color: #d4d4d4 !important; }
  .report-doc .glass { border: 1px solid #d4d4d4 !important; }
  .report-doc .report-flags { border: 1px solid #d97706 !important; }
  .report-doc .report-flags * { color: #92400e !important; }
  .report-doc .tag { border: 1px solid #999 !important; }
  .report-doc a { text-decoration: underline; }
  .report-doc section, .report-doc li { break-inside: avoid; }
  .report-doc .report-cover { max-height: 60mm; }
  @page { margin: 16mm; }
}`;

function Loading({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-4">
      <div className="flex items-center gap-3 text-[15px] text-white/80"><span className="live-dot" />{label}</div>
      <p className="t-caption mt-2">The model writes prose only; every number is inserted afterwards by the backend from public data, the statistical model, the simulation or the national roadmap.</p>
      <div className="mt-6 space-y-3">
        <Skel className="h-9 w-2/3" /><Skel className="h-4 w-1/2" /><Skel className="h-28 w-full" />
        <Skel className="h-5 w-1/3" /><Skel className="h-16 w-full" /><Skel className="h-16 w-full" />
      </div>
    </div>
  );
}

function ReportView() {
  const sp = useSearchParams();
  const spec = sp.get("items") ?? "";
  const base = apiBase(sp.get("api"));
  const items = useMemo(() => parseItems(spec), [spec]);
  const key = `${base}|${spec}`;
  const [view, setView] = useState<View>(sp.get("view") === "slides" ? "slides" : "briefing");
  const [res, setRes] = useState<{ key: string; data?: ReportResponse; err?: string } | null>(null);
  const [cover, setCover] = useState<{ base: string; c: Cover | null; err?: string } | null>(null);

  useEffect(() => {
    if (!items.length) return;
    let live = true;
    postReport(items, base)
      .then((data) => live && setRes({ key, data }))
      .catch((e) => live && setRes({ key, err: String(e instanceof Error ? e.message : e) }));
    return () => { live = false; };
  }, [key, items, base]);

  useEffect(() => {
    if (!items.length) return;
    let live = true;
    getCover(base)
      .then((c) => live && setCover({ base, c }))
      .catch((e) => live && setCover({ base, c: null, err: String(e instanceof Error ? e.message : e) }));
    return () => { live = false; };
  }, [base, items.length]);

  const exit = useCallback(() => setView("briefing"), []);
  const cur = res?.key === key ? res : null;
  const data = cur?.data;
  const c = cover?.base === base ? cover.c : null;
  const names = data ? factsOnly(data.facts) : {};
  const progWord = (p: string) => (p === "bowel" ? "colorectal" : p);

  return (
    <main className="min-h-screen w-full">
      <style>{PRINT_CSS}</style>
      <header className="no-print sticky top-0 z-40 border-b border-white/10 bg-[#0b0c10]/90 backdrop-blur px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-[11px] uppercase tracking-wide text-white/40 hover:text-amber-300">← Back to the map</Link>
        <span className="t-panel">Generated report</span>
        <span className="flex gap-1.5 flex-wrap">
          {items.map((it) => (
            <span key={`${it.prog}:${it.code}:${it.scenarios?.join("+")}`} className="pill">
              {progWord(it.prog)} · {String(names[`c${it.code}_name`]?.value ?? it.code)}
              {it.scenarios?.length ? <span className="text-white/45"> · {it.scenarios.join(" + ")}</span> : null}
            </span>
          ))}
        </span>
        <span className="flex-1" />
        {data && <Seg options={VIEWS} value={view} onChange={setView} />}
        {data && view === "briefing" && (
          <button onClick={() => window.print()} className="chip chip-ghost">Print / PDF</button>
        )}
      </header>

      <div className="pt-8">
        {!items.length && (
          <div className="mx-auto max-w-3xl px-6">
            <div className="tag tag-warn">No items</div>
            <p className="t-body mt-3 text-white/70">Open this page with <code>?items=breast:90,bowel:07</code> (programme:county code; optional
              scenarios as <code>breast:90:own_language+sms_reminder</code>).</p>
          </div>
        )}
        {items.length > 0 && !cur && <Loading label="Gemini is writing the briefing…" />}
        {cur?.err && (
          <div className="mx-auto max-w-3xl px-6">
            <div className="rounded-xl border border-rose-300/40 bg-rose-300/[0.08] p-4">
              <div className="t-section text-rose-300">The briefing could not be generated</div>
              <p className="t-body mt-1 text-rose-200/90 break-words">{cur.err}</p>
              <p className="t-caption mt-2">No text is shown instead: the report is never filled in without the model and the backend facts.</p>
            </div>
          </div>
        )}
        {data && view === "briefing" && <Briefing data={data} cover={c} />}
        {data && view === "briefing" && (cover?.err || (c && !c.image)) && (
          <p className="no-print mx-auto max-w-3xl px-6 t-micro">Cover illustration unavailable: {cover?.err ?? c?.error ?? "no image"}</p>
        )}
      </div>
      {data && view === "slides" && <Deck data={data} cover={c} onExit={exit} />}
    </main>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<Loading label="Loading…" />}>
      <ReportView />
    </Suspense>
  );
}
