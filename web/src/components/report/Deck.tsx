"use client";
// Full-screen 16:9 slide deck of a generated report. ←/→/space navigate, N toggles speaker notes, Esc leaves.
// Sizes use container query units (cqw) so the slide scales with the stage.
import { useEffect, useRef, useState } from "react";
import { EvidenceChips } from "@/components/report/Evidence";
import { HeroStats, MinFs, SlideVisual } from "@/components/report/Visuals";
import { Tag } from "@/components/ui";
import { visualFor, type Cover, type ReportResponse, type Slide } from "@/lib/report";

const KICKER: Record<Slide["kind"], string> = {
  title: "Briefing", where: "Where", why: "Why", who: "Who", what: "What to do", pathway: "Further down the pathway",
  limits: "What the data cannot show", next: "Next steps",
};

export function Deck({ data, cover, scenes, onExit }: { data: ReportResponse; cover: Cover | null;
                       scenes?: Record<string, Cover | null>; onExit: () => void }) {
  const slides = data.report.slides;
  const N = slides.length;
  const [i, setI] = useState(0);
  const [notes, setNotes] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) { e.preventDefault(); setI((x) => Math.min(N - 1, x + 1)); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(N - 1);
      else if (e.key === "n" || e.key === "N") setNotes((v) => !v);
      else if (e.key === "Escape" && !document.fullscreenElement) onExit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [N, onExit]);

  const s = slides[Math.min(i, N - 1)];
  if (!s) return null;
  const isTitle = s.kind === "title" || i === 0;
  const flagged = data.flags.filter((f) => f.path.startsWith(`slides[${i}]`));
  const vis = visualFor(data, s);
  const backdrop = isTitle ? cover?.image
    : (s.kind === "where" || s.kind === "next") ? scenes?.[s.kind]?.image : null;

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.current?.requestFullscreen?.();
  };

  return (
    <div ref={root} className="report-deck fixed inset-0 z-50 bg-[#0b0c10] flex flex-col items-center justify-center select-none">
      <div className="relative overflow-hidden rounded-[1.2vmin] border border-white/10 bg-[#10121a] shrink-0"
           style={{ width: `min(96vw, calc(${notes ? 62 : 88}vh * 16 / 9))`, aspectRatio: "16 / 9", containerType: "inline-size" }}
           onClick={() => setI((x) => Math.min(N - 1, x + 1))}>
        {backdrop && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the API */}
            <img src={backdrop} alt="" className={`absolute inset-0 w-full h-full object-cover ${isTitle ? "opacity-55" : "opacity-[0.22]"}`} />
            <div className="absolute inset-0"
                 style={{ background: "linear-gradient(90deg, #0b0c10 0%, rgba(11,12,16,0.82) 45%, rgba(11,12,16,0.15) 100%)" }} />
          </>
        )}
        <MinFs.Provider value={1.25}>
        <div key={i} className="slide absolute inset-0 flex flex-col" style={{ padding: "5.5cqw 6.5cqw 4.5cqw" }}>
          <div className="uppercase text-white/45" style={{ fontSize: "1.15cqw", letterSpacing: "0.22em" }}>
            {isTitle ? "Equal Care Across Finland · generated briefing" : KICKER[s.kind] ?? s.kind}
          </div>
          {isTitle ? (
            <div className="flex-1 flex flex-col justify-center max-w-[68%]">
              <h1 className="font-semibold leading-[1.1]" style={{ fontSize: "4.2cqw" }}>{data.report.title}</h1>
              <p className="text-white/65 mt-[1.6cqw]" style={{ fontSize: "1.75cqw" }}>{data.report.subtitle}</p>
              {s.headline && s.headline !== data.report.title && (
                <p className="text-amber-300/90 mt-[2.4cqw]" style={{ fontSize: "1.6cqw" }}>{s.headline}</p>
              )}
              <HeroStats data={data} />
              {s.bullets.length > 0 && (
                <ul className="mt-[1.6cqw] space-y-[0.7cqw] text-white/70" style={{ fontSize: "1.4cqw" }}>
                  {s.bullets.slice(0, 3).map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              )}
            </div>
          ) : vis ? (
            <div className="flex-1 flex items-center gap-[3cqw] min-h-0">
              {/* the visual keeps >= 58 % of the slide width; the text column takes the rest */}
              <div className="flex-1 min-w-0 h-full flex flex-col justify-center" style={{ minWidth: "58cqw", containerType: "inline-size" }}>
                <SlideVisual slide={s} v={vis} minFs={1.25} />
              </div>
              <div className="w-[28%] shrink-0">
                <h2 className="font-semibold leading-[1.15]" style={{ fontSize: "3cqw" }}>{s.headline}</h2>
                <ul className="mt-[1.8cqw] space-y-[1cqw]">
                  {s.bullets.slice(0, 3).map((b, j) => (
                    <li key={j} className="flex gap-[0.8cqw] text-white/80 leading-snug" style={{ fontSize: "1.4cqw" }}>
                      <span className="text-amber-300/80 shrink-0">—</span><span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center">
              <h2 className="font-semibold leading-[1.15] max-w-[88%]" style={{ fontSize: "3.1cqw" }}>{s.headline}</h2>
              <ul className="mt-[2.6cqw] space-y-[1.3cqw] max-w-[82%]">
                {s.bullets.slice(0, 3).map((b, j) => (
                  <li key={j} className="flex gap-[1.2cqw] text-white/85 leading-snug" style={{ fontSize: "1.75cqw" }}>
                    <span className="text-amber-300/80 shrink-0">—</span><span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-end justify-between gap-4" style={{ fontSize: "1.1cqw" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <EvidenceChips kinds={s.evidence} big />
              {flagged.length > 0 && <Tag v="warn">{flagged.length} grounding flag{flagged.length > 1 ? "s" : ""}</Tag>}
            </div>
            <div className="text-white/40 tabular-nums">{i + 1} / {N}</div>
          </div>
        </div>
        </MinFs.Provider>
      </div>
      {notes && (
        <div className="mt-2 shrink-0 max-h-[24vh] overflow-y-auto rounded-lg bg-black/85 border border-white/15 text-white/80 text-[13px] leading-snug px-4 py-2.5"
             style={{ width: "min(96vw, calc(62vh * 16 / 9))" }}
             onClick={(e) => e.stopPropagation()}>
          <div className="uppercase text-white/40 mb-1 text-[10px]" style={{ letterSpacing: "0.18em" }}>Speaker notes</div>
          {s.speaker_notes || "—"}
        </div>
      )}
      <div className="absolute top-3 right-4 flex items-center gap-2 text-[11px]">
        <button onClick={() => setNotes((v) => !v)} className="chip chip-ghost">{notes ? "Hide notes" : "Notes"} (N)</button>
        <button onClick={fullscreen} className="chip chip-ghost">Full screen</button>
        <button onClick={onExit} className="chip chip-ghost">Briefing (Esc)</button>
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        <button onClick={() => setI((x) => Math.max(0, x - 1))} aria-label="previous slide" className="chip chip-ghost">←</button>
        {slides.map((_, k) => (
          <button key={k} onClick={() => setI(k)} aria-label={`slide ${k + 1}`}
                  className={`w-2 h-2 rounded-full ${k === i ? "bg-white" : "bg-white/25 hover:bg-white/50"}`} />
        ))}
        <button onClick={() => setI((x) => Math.min(N - 1, x + 1))} aria-label="next slide" className="chip chip-ghost">→</button>
      </div>
    </div>
  );
}
