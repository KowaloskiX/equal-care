"use client";
// Spotlight walkthrough — no dependency. Elements opt in with data-tour="name"; the card sits
// bottom-right, the rest of the screen dims behind an SVG mask, the target gets a ring.
// Each step says what you're looking at, what to try, and the one thing to remember.
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type TourStep = {
  target?: string;      // data-tour name; undefined = welcome card, no spotlight
  location?: string;    // "Map · Finland" — where on screen this is
  title: string;
  where: string;        // what you're seeing
  action: string;       // what to try
  takeaway: string;     // what to remember
  goStep?: number;      // guided step this part belongs to — the tour drives the app there
  act?: string;         // data-tour element the tour clicks for you when the card opens
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function Tour({ steps, onDone, startAt = 0, onActivate }: {
  steps: TourStep[]; onDone: () => void;
  startAt?: number;                           // resume at the section for the step you're on
  onActivate?: (st: TourStep) => void;        // fired per step — the app follows goStep
}) {
  const maskId = useId();
  const [n, setN] = useState(startAt);
  const fired = useRef(new Set<string>());      // each act clicks once — Back/Next never re-fires
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
    // step DOM may mount a beat later — and sim results take ~8s; keep retrying for a while
    const iv = setInterval(measure, 700);
    const stop = setTimeout(() => clearInterval(iv), 12000);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { cancelAnimationFrame(raf); clearInterval(iv); clearTimeout(stop);
                   window.removeEventListener("resize", measure);
                   window.removeEventListener("scroll", measure, true); };
  }, [measure]);

  // the app follows the tour: goStep flips the guided step, act clicks the element for you —
  // a beat late so the spotlight lands first and the click reads as the tour doing it
  useEffect(() => {
    onActivate?.(steps[n]);
    const act = steps[n].act;
    if (!act || fired.current.has(act)) return;
    fired.current.add(act);
    const t = setTimeout(() => {
      (document.querySelector(`[data-tour="${act}"]`) as HTMLElement | null)?.click();
    }, 600);
    return () => clearTimeout(t);
  }, [n, steps, onActivate]);

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

      <div className="absolute bottom-5 right-5 w-[380px] max-w-[calc(100vw-40px)] glass p-4 z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 rounded-md bg-sky-400/15 border border-sky-300/35 px-2 py-0.5
                             font-mono text-[10.5px] text-sky-200 tabular-nums font-medium">
              {String(n + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
            </span>
            {st.location && <span className="truncate t-micro uppercase tracking-wider text-white/55">{st.location}</span>}
          </div>
          <button onClick={onDone} aria-label="Close" className="text-white/50 hover:text-white leading-none px-1 text-base">×</button>
        </div>

        <div className="text-[15px] font-semibold text-white mt-2.5 leading-snug">{st.title}</div>
        <div className="mt-2.5 space-y-2">
          <div className="grid grid-cols-[44px_1fr] gap-2 items-baseline">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">See</span>
            <p className="text-[12.5px] text-white/80 leading-snug">{st.where}</p>
          </div>
          <div className="grid grid-cols-[44px_1fr] gap-2 items-baseline">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/85">Try</span>
            <p className="text-[12.5px] text-white/80 leading-snug">{st.action}</p>
          </div>
          <div className="grid grid-cols-[44px_1fr] gap-2 items-baseline">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/85">Keep</span>
            <p className="text-[12.5px] text-white/75 leading-snug">{st.takeaway}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-white/10">
          <div className="flex items-center gap-[3px]" role="tablist" aria-label="Steps">
            {steps.map((_, i) => (
              <button key={i} role="tab" aria-selected={i === n} aria-label={`Step ${i + 1}`} onClick={() => setN(i)}
                      className={`h-1.5 rounded-full transition-all ${i === n ? "w-3 bg-sky-300" : "w-1 bg-white/20 hover:bg-white/45"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onDone} className="t-caption text-white/55 hover:text-white px-1">Skip</button>
            {n > 0 && <button onClick={() => setN(n - 1)} className="nav-btn !h-7 !px-2.5 !text-[11.5px]">Back</button>}
            <button onClick={() => (last ? onDone() : setN(n + 1))}
                    className="rounded-lg bg-sky-400/20 border border-sky-300/45 text-sky-100 font-medium text-[12px] px-3 py-1 hover:bg-sky-400/30">
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
