"use client";
// Spotlight walkthrough — no dependency. Elements opt in with data-tour="name"; the card sits
// bottom-right, the rest of the screen dims behind an SVG mask, the target gets a ring.
// Each step says what you're looking at, what to try, and the one thing to remember.
import { useCallback, useEffect, useId, useState } from "react";

export type TourStep = {
  target?: string;      // data-tour name; undefined = welcome card, no spotlight
  location?: string;    // "Map · Finland" — where on screen this is
  title: string;
  where: string;        // what you're seeing
  action: string;       // what to try
  takeaway: string;     // what to remember
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const maskId = useId();
  const [n, setN] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const st = steps[n];

  const measure = useCallback(() => {
    const el = st.target ? document.querySelector(`[data-tour="${st.target}"]`) : null;
    const r = el?.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!r || r.width < 8 || r.height < 8) { setRect(null); return; }
    const pad = 8;
    setRect({ x: clamp(r.x - pad, 6, vw - 6), y: clamp(r.y - pad, 6, vh - 6),
              w: clamp(r.width + 2 * pad, 0, vw - 12), h: clamp(r.height + 2 * pad, 0, vh - 12) });
  }, [st]);

  useEffect(() => {
    const raf = requestAnimationFrame(measure);                    // state may not be set sync in an effect
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure);
                   window.removeEventListener("scroll", measure, true); };
  }, [measure]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") onDone();
      if (!editable && e.key === "ArrowRight" && n < steps.length - 1) setN((x) => x + 1);
      if (!editable && e.key === "ArrowLeft" && n > 0) setN((x) => x - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [n, steps.length, onDone]);

  const last = n >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* dim everything, cut a hole over the target */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="14" ry="14" fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(4,6,12,0.62)" mask={`url(#${maskId})`} />
        {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="14" ry="14"
                       fill="none" stroke="rgba(125,211,252,0.75)" strokeWidth="1.5" />}
      </svg>

      <div className="absolute bottom-5 right-5 w-[360px] max-w-[calc(100vw-40px)] rounded-2xl border border-white/10
                      bg-[#0d1017]/95 backdrop-blur p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 rounded-full bg-sky-400/15 border border-sky-300/30 px-2 py-0.5
                             font-mono text-[10px] text-sky-300 tabular-nums">
              {String(n + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
            </span>
            {st.location && <span className="truncate t-micro uppercase tracking-wider">{st.location}</span>}
          </div>
          <button onClick={onDone} aria-label="Close" className="text-white/45 hover:text-white/80 leading-none px-1">×</button>
        </div>

        <div className="t-section mt-2">{st.title}</div>
        <div className="mt-2 space-y-1.5">
          <div className="flex gap-2"><span className="w-14 shrink-0 t-micro uppercase tracking-wider pt-px">See</span>
            <p className="text-[12px] text-white/65 leading-snug">{st.where}</p></div>
          <div className="flex gap-2"><span className="w-14 shrink-0 t-micro uppercase tracking-wider pt-px text-sky-300/70">Try</span>
            <p className="text-[12px] text-white/65 leading-snug">{st.action}</p></div>
          <div className="flex gap-2"><span className="w-14 shrink-0 t-micro uppercase tracking-wider pt-px text-emerald-300/70">Keep</span>
            <p className="text-[12px] text-white/65 leading-snug">{st.takeaway}</p></div>
        </div>

        <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-white/10">
          <div className="flex items-center gap-1" role="tablist" aria-label="Steps">
            {steps.map((_, i) => (
              <button key={i} role="tab" aria-selected={i === n} aria-label={`Step ${i + 1}`} onClick={() => setN(i)}
                      className={`h-1.5 rounded-full transition-all ${i === n ? "w-4 bg-sky-300" : "w-1.5 bg-white/20 hover:bg-white/35"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={onDone} className="t-caption text-white/50 hover:text-white/80">Skip</button>
            {n > 0 && <button onClick={() => setN(n - 1)} className="t-caption text-white/60 hover:text-white">Back</button>}
            <button onClick={() => (last ? onDone() : setN(n + 1))}
                    className="rounded-lg bg-sky-400/20 border border-sky-300/40 text-sky-200 text-[12px] px-3 py-1 hover:bg-sky-400/30">
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
