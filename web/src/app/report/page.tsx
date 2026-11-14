"use client";
// Generated report: /report?items=breast:90,bowel:07  (programme:countyCode[:scenario+scenario], comma-separated)
// Optional: &view=slides to open the deck, &api=http://localhost:8020 to use another API origin.
// A picker lists every item (checked) before generating; Generate posts the checked items only.
// Gemini writes the prose with {fact} placeholders; the backend fills in every number from FACTS and flags the rest.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Seg, Skel } from "@/components/ui";
import { Briefing } from "@/components/report/Briefing";
import { Deck } from "@/components/report/Deck";
import {
  apiBase, factsOnly, getCounties, getCover, itemSpec, parseItems, postReport,
  type Cover, type ReportItem, type ReportResponse,
} from "@/lib/report";

type View = "briefing" | "slides";
const VIEWS = [{ id: "briefing", label: "Briefing" }, { id: "slides", label: "Slides" }] as const;
const PROGS = [{ id: "breast", label: "Breast" }, { id: "bowel", label: "Colorectal" }] as const;
type Prog = (typeof PROGS)[number]["id"];

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

const progWord = (p: string) => (p === "bowel" ? "colorectal" : p);
const humanScen = (s: string) => s.replace(/_/g, " ");

function Loading({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-4">
      <div className="flex items-center gap-3 text-[15px] text-white/80"><span className="live-dot" />{label}</div>
      <p className="t-caption mt-2">The model writes prose only; every number comes afterwards from the backend — public data, the statistical model, the simulation or the national roadmap.</p>
      <div className="mt-6 space-y-3">
        <Skel className="h-9 w-2/3" /><Skel className="h-4 w-1/2" /><Skel className="h-28 w-full" />
        <Skel className="h-5 w-1/3" /><Skel className="h-16 w-full" /><Skel className="h-16 w-full" />
      </div>
    </div>
  );
}

/** Which items the report covers: a checkbox per candidate (county + programme + combo label, pre-checked
    from the URL) plus a County select that adds any other county for the chosen programme. Remounts on
    ?items= changes via key={spec}, so a new URL resets the checkboxes. */
function Picker({ urlItems, counties, countyName, busy, generated, onGenerate, onChange }: {
  urlItems: ReportItem[]; counties: { code: string; name: string }[];
  countyName: (code: string) => string; busy: boolean; generated: boolean;
  onGenerate: (sel: ReportItem[]) => void; onChange: (sel: ReportItem[]) => void;
}) {
  const [cands, setCands] = useState<ReportItem[]>(urlItems);
  const [checks, setChecks] = useState<Set<string>>(() => new Set(urlItems.map(itemSpec)));
  const [addProg, setAddProg] = useState<Prog>(urlItems[0]?.prog === "bowel" ? "bowel" : "breast");
  const sel = () => cands.filter((it) => checks.has(itemSpec(it)));
  const toggle = (k: string) =>
    setChecks((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const addCounty = (code: string) => {
    if (!code) return;
    const it: ReportItem = { prog: addProg, code, scenarios: [] };
    setCands((cs) => (cs.some((x) => itemSpec(x) === itemSpec(it)) ? cs : [...cs, it]));
    setChecks((s) => new Set(s).add(itemSpec(it)));
    onChange([...sel(), it]);
  };
  const addable = cands.length >= 6   // src/report.py MAX_ITEMS
    ? [] : counties.filter((x) => !cands.some((it) => it.prog === addProg && it.code === x.code));
  return (
    <div className="no-print mx-auto w-full max-w-3xl px-6 mb-8">
      <div className="glass p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="t-section text-white/70">What the report covers</span>
          {busy && <span className="t-caption flex items-center gap-2"><span className="live-dot" />Regenerating…</span>}
        </div>
        <div className="mt-2 space-y-1.5">
          {cands.map((it) => {
            const k = itemSpec(it);
            return (
              <label key={k} className="flex items-start gap-2.5 text-[14px] leading-snug text-white/85 cursor-pointer">
                <input type="checkbox" checked={checks.has(k)} className="mt-[3px] accent-amber-300"
                       onChange={(e) => { toggle(k);   // `checks` is the pre-toggle state; override for this row
                                          onChange(cands.filter((x) => (itemSpec(x) === k ? e.target.checked
                                                                                        : checks.has(itemSpec(x))))); }} />
                <span>
                  {progWord(it.prog)} · {countyName(it.code)}
                  {it.scenarios?.length
                    ? <span className="text-white/50"> · intervention run: {it.scenarios.map(humanScen).join(" + ")}</span>
                    : null}
                </span>
              </label>
            );
          })}
          {!cands.length && <p className="t-caption text-white/50">Nothing picked yet — add a county below.</p>}
        </div>
        <div className="mt-3 flex items-center gap-2.5 flex-wrap">
          <span className="t-caption">County:</span>
          <select value="" onChange={(e) => addCounty(e.target.value)}
                  className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[13px] text-white/85">
            <option value="">add one…</option>
            {addable.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select>
          <Seg small options={PROGS} value={addProg} onChange={setAddProg} />
          <span className="flex-1" />
          <button onClick={() => onGenerate(sel())} disabled={!sel().length || busy}
                  className="rounded-lg bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[12.5px] px-3.5 py-1.5 hover:bg-amber-400/30 disabled:opacity-35">
            {generated ? "Regenerate report" : "Generate report"}
          </button>
        </div>
        <p className="t-micro mt-2 text-white/40">
          Checked items are sent to the generator — the counties you clicked in the story and each intervention run.
          A county added here joins the briefing without a run.
        </p>
      </div>
    </div>
  );
}

function ReportView() {
  const sp = useSearchParams();
  const spec = sp.get("items") ?? "";
  const base = apiBase(sp.get("api"));
  const urlItems = useMemo(() => {
    const seen = new Set<string>();
    return parseItems(spec).filter((it) => { const k = itemSpec(it); if (seen.has(k)) return false; seen.add(k); return true; });
  }, [spec]);
  const [view, setView] = useState<View>(sp.get("view") === "slides" ? "slides" : "briefing");
  const wantImage = sp.get("image") === "1";                                  // ask the backend for the cover illustration too
  const [selItems, setSelItems] = useState<ReportItem[]>(urlItems);           // checked items, for the header pills
  const [counties, setCounties] = useState<{ code: string; name: string }[]>([]);
  const [gen, setGen] = useState<ReportItem[] | null>(null);                  // items the report is generated with
  const [res, setRes] = useState<{ key: string; data?: ReportResponse; err?: string } | null>(null);
  const [cover, setCover] = useState<{ base: string; c: Cover | null; err?: string } | null>(null);
  const [scenes, setScenes] = useState<Record<string, Cover | null>>({});

  useEffect(() => {
    let live = true;
    getCounties(base).then((cs) => live && setCounties(cs)).catch(() => null);
    return () => { live = false; };
  }, [base]);

  const genSpec = (gen ?? []).map(itemSpec).join(",");
  const key = `${base}|${genSpec}`;

  useEffect(() => {
    if (!gen?.length) return;
    let live = true;
    postReport(gen, base, wantImage)
      .then((data) => live && setRes({ key, data }))
      .catch((e) => live && setRes({ key, err: String(e instanceof Error ? e.message : e) }));
    return () => { live = false; };
  }, [key, gen, base, wantImage]);

  useEffect(() => {
    if (!gen?.length) return;
    let live = true;
    getCover(base)
      .then((c) => live && setCover({ base, c }))
      .catch((e) => live && setCover({ base, c: null, err: String(e instanceof Error ? e.message : e) }));
    return () => { live = false; };
  }, [base, gen]);

  const exit = useCallback(() => setView("briefing"), []);
  const cur = res?.key === key ? res : null;
  const data = cur?.data ?? res?.data ?? null;      // keep the previous report on screen while regenerating
  const busy = !!gen?.length && res?.key !== key;

  // slide backdrops for the 'where' and 'next' kinds — lazily, after the deck can already render
  useEffect(() => {
    if (!data) return;
    let live = true;
    for (const k of ["where", "next"] as const) {
      getCover(base, k)
        .then((c) => live && setScenes((s) => (s[k] === c ? s : { ...s, [k]: c })))
        .catch(() => live && setScenes((s) => ({ ...s, [k]: null })));
    }
    return () => { live = false; };
  }, [data, base]);
  const c = cur?.data?.image ?? (cover?.base === base ? cover.c : null);
  const names = data ? factsOnly(data.facts) : {};
  const countyName = (code: string) =>
    counties.find((x) => x.code === code)?.name ?? String(names[`c${code}_name`]?.value ?? code);

  const shownItems = gen ?? selItems;   // pills: what is (about to be) generated

  return (
    <main className="min-h-screen w-full">
      <style>{PRINT_CSS}</style>
      <header className="no-print sticky top-0 z-40 border-b border-white/10 bg-[#0b0c10]/90 backdrop-blur px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-[11px] uppercase tracking-wide text-white/40 hover:text-amber-300">← Back to the map</Link>
        <span className="t-panel">Generated report</span>
        <span className="flex gap-1.5 flex-wrap">
          {shownItems.map((it) => (
            <span key={itemSpec(it)} className="pill">
              {progWord(it.prog)} · {countyName(it.code)}
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
        <Picker key={`${base}|${spec}`} urlItems={urlItems} counties={counties} countyName={countyName}
                busy={busy} generated={!!gen?.length}
                onGenerate={setGen} onChange={setSelItems} />

        {!gen?.length && (
          <div className="mx-auto max-w-3xl px-6">
            {urlItems.length ? (
              <p className="t-caption text-white/50">Pick the items above and press Generate — nothing is sent until you do.</p>
            ) : (
              <>
                <div className="tag tag-warn">No items</div>
                <p className="t-body mt-3 text-white/70">Open this page with <code>?items=breast:90,bowel:07</code> (programme:county
                  code; optional scenarios as <code>breast:90:own_language+sms_reminder</code>) — or add a county in the picker above.</p>
              </>
            )}
          </div>
        )}
        {gen?.length && !cur && !data && <Loading label="Gemini is writing the briefing…" />}
        {busy && data && view === "briefing" && <Loading label="Gemini is rewriting the briefing…" />}
        {cur?.err && (
          <div className="mx-auto max-w-3xl px-6">
            <div className="rounded-xl border border-rose-300/40 bg-rose-300/[0.08] p-4">
              <div className="t-section text-rose-300">The briefing could not be generated</div>
              <p className="t-body mt-1 text-rose-200/90 break-words">{cur.err}</p>
              <p className="t-caption mt-2">No text is shown instead: the report is never filled in without the model and the backend facts.</p>
            </div>
          </div>
        )}
        {data && !busy && view === "briefing" && <Briefing data={data} cover={c} />}
        {data && !busy && view === "briefing" && (cover?.err || (c && !c.image)) && (
          <p className="no-print mx-auto max-w-3xl px-6 t-micro">Cover illustration unavailable: {cover?.err ?? c?.error ?? "no image"}</p>
        )}
      </div>
      {data && view === "slides" && <Deck data={data} cover={c} scenes={scenes} onExit={exit} />}
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
