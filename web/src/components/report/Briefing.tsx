"use client";
// Readable briefing document (print-friendly: Cmd+P -> PDF). All text and numbers come rendered from /api/report.
import { Tag } from "@/components/ui";
import { ActionChip, EvidenceChips } from "@/components/report/Evidence";
import { HeroStats, SlideVisual } from "@/components/report/Visuals";
import {
  factsOnly, KIND_WORDS, limitations, sourcesOf, visualFor, type Cover, type ReportResponse, type Slide,
} from "@/lib/report";

const KIND_TITLE: Record<Slide["kind"], string> = {
  title: "Overview", where: "Where", why: "Why", who: "Who", what: "What to do", pathway: "Further down the pathway",
  limits: "What the data cannot show", next: "Next steps",
};

export function Briefing({ data, cover }: { data: ReportResponse; cover: Cover | null }) {
  const r = data.report;
  const facts = factsOnly(data.facts);
  const lims = limitations(data.facts);
  const sources = sourcesOf(facts);
  const u = data.usage;

  return (
    <article className="report-doc mx-auto w-full max-w-3xl px-6 pb-20">
      {cover?.image && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL from the API, not an optimisable asset
        <img src={cover.image} alt="" className="report-cover w-full aspect-[16/7] object-cover rounded-2xl border border-white/10 mb-7" />
      )}
      <div className="t-caption uppercase tracking-[0.18em] mb-2">Equal Care Across Finland · generated briefing</div>
      <h1 className="text-[30px] font-semibold leading-tight">{r.title}</h1>
      <p className="text-[16px] text-white/60 mt-2">{r.subtitle}</p>
      <div className="mt-3" style={{ containerType: "inline-size" }}><HeroStats data={data} /></div>

      {data.flags.length > 0 && (
        <div className="report-flags mt-6 rounded-xl border border-amber-400/40 bg-amber-400/[0.08] p-4">
          <div className="t-section text-amber-300">Grounding flags ({data.flags.length}) — shown as written, not corrected</div>
          <ul className="mt-2 space-y-1.5 text-[12.5px] text-amber-200/90">
            {data.flags.map((f, i) => (
              <li key={i}><code className="text-amber-300/80">{f.path}</code> — {f.issue}{f.text ? <span className="text-amber-100/60"> · “{f.text}”</span> : null}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="glass mt-7 p-6">
        <div className="t-section text-white/70 mb-2">Executive summary</div>
        <p className="text-[15.5px] leading-relaxed text-white/90 whitespace-pre-line">{r.executive_summary}</p>
      </section>

      {r.slides.map((s, i) => (
        <section key={i} className="mt-8">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="t-caption uppercase tracking-[0.16em]">{KIND_TITLE[s.kind] ?? s.kind}</span>
            <EvidenceChips kinds={s.evidence} />
          </div>
          <h2 className="t-title mt-1.5 text-[20px]">{s.headline}</h2>
          {s.kind !== "title" && (
            <div className="glass mt-3 px-4 py-3 w-full" style={{ aspectRatio: "16 / 7", containerType: "inline-size" }}>
              <SlideVisual slide={s} v={visualFor(data, s)} />
            </div>
          )}
          {s.bullets.length > 0 && (
            <ul className="mt-3 space-y-2 list-disc pl-5 text-[14.5px] leading-relaxed text-white/80">
              {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
            </ul>
          )}
          {s.speaker_notes && <p className="mt-3 text-[13px] leading-relaxed text-white/50">{s.speaker_notes}</p>}
        </section>
      ))}

      <section className="mt-10">
        <h2 className="t-title text-[20px]">Recommendations</h2>
        <p className="t-caption mt-1">Each one cites a numbered action of the national roadmap.</p>
        <ol className="mt-4 space-y-3">
          {r.recommendations.map((x, i) => (
            <li key={i} className="glass p-4 flex gap-4 items-start">
              <span className="stepno mt-0.5 shrink-0">{i + 1}</span>
              <div className="flex-1">
                <p className="text-[14.5px] leading-relaxed text-white/90">{x.text}</p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <ActionChip a={x.action} />
                  {x.action?.title && <span className="t-caption">{x.action.title}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="t-title text-[20px]">Limitations</h2>
        <ul className="mt-3 space-y-1.5 list-disc pl-5 text-[13.5px] leading-relaxed text-white/70">
          {lims.map((l) => <li key={l}>{l}</li>)}
        </ul>
        {data.notes && data.notes.length > 0 && (
          <ul className="mt-3 space-y-1 text-[12.5px] text-white/50">
            {data.notes.map((n) => <li key={n}><Tag v="note">note</Tag> {n}</li>)}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="t-title text-[20px]">Sources</h2>
        <p className="t-caption mt-1">Every number above is a FACTS value from the Equal Care Finland backend; these are the sources behind them.</p>
        <ul className="mt-3 space-y-2 text-[13px]">
          {sources.map((x, i) => (
            <li key={i} className="flex gap-3 items-baseline">
              <span className="shrink-0 w-24"><EvidenceChips kinds={x.kinds} /></span>
              <span className="text-white/75">
                {x.s.url ? <a href={x.s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-amber-300">{x.s.title ?? x.s.url}</a> : x.s.title}
                {x.s.org && <span className="text-white/45"> · {x.s.org}</span>}
                {(x.s.period ?? x.s.year) != null && <span className="text-white/45"> · {x.s.period ?? x.s.year}</span>}
                {x.s.indicator != null && <span className="text-white/45"> · Sotkanet #{x.s.indicator}</span>}
                {x.pages && <span className="text-white/45"> · pages {x.pages.join(", ")}</span>}
                {x.s.note && <span className="text-white/45"> · {x.s.note}</span>}
                {x.s.method && <span className="block text-white/40 text-[12px]">{x.s.method}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 border-t border-white/10 pt-4 t-caption">
        Prose written by {data.model}{data.model_note ? ` (${data.model_note})` : ""}; numbers inserted by the backend from FACTS.
        Evidence words: {Object.values(KIND_WORDS).join(" · ")}.
        {u?.total_token_count != null && <> Tokens: {u.prompt_token_count} in · {u.candidates_token_count} out{u.thoughts_token_count ? ` · ${u.thoughts_token_count} thinking` : ""}.</>}
        {data.latency_s != null && <> Generated in {data.latency_s} s{data.cached ? " (cached)" : ""}.</>}
        {cover?.model && cover.image && <> Cover illustration: {cover.model}.</>}
      </footer>
    </article>
  );
}
