"use client";
// A tiny bubble tour — no dependency. Elements opt in with data-tour="name"; the step's bubble
// sits next to the highlighted element, the rest of the screen is dimmed behind a spotlight.
import { useCallback, useEffect, useState } from "react";

export type TourStep = { target?: string; title: string; body: string };

export default function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [n, setN] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const st = steps[n];

  const measure = useCallback(() => {
    const el = st.target ? document.querySelector(`[data-tour="${st.target}"]`) : null;
    const r = el?.getBoundingClientRect();
    setRect(r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null);
  }, [st]);

  useEffect(() => {
    const raf = requestAnimationFrame(measure);                    // async: state may not be set sync in an effect
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, [measure]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight" && n < steps.length - 1) setN((x) => x + 1);
      if (e.key === "ArrowLeft" && n > 0) setN((x) => x - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [n, steps.length, onDone]);

  const pad = 8;
  const spot = rect && { left: rect.x - pad, top: rect.y - pad, width: rect.w + 2 * pad, height: rect.h + 2 * pad };
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const bubbleW = 300;
  let bubble: { left: number; top: number } = { left: (vw - bubbleW) / 2, top: vh / 3 };
  if (spot) {
    const below = spot.top + spot.height + 12;
    bubble = {
      left: Math.max(12, Math.min(vw - bubbleW - 12, spot.left + spot.width / 2 - bubbleW / 2)),
      top: below + 150 < vh ? below : Math.max(12, spot.top - 12 - 150),
    };
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/55" />
      {spot && (
        <div className="absolute rounded-xl border border-sky-300/50"
             style={{ ...spot, boxShadow: "0 0 0 9999px rgba(3,4,8,0.55)" }} />
      )}
      <div className="absolute glass p-4 w-[300px] shadow-2xl" style={bubble}>
        <div className="flex items-baseline justify-between gap-2">
          <div className="t-section">{st.title}</div>
          <span className="t-micro whitespace-nowrap">{n + 1} / {steps.length}</span>
        </div>
        <p className="t-body text-white/65 mt-1.5 leading-snug">{st.body}</p>
        <div className="flex items-center justify-between mt-3">
          <button onClick={onDone} className="t-caption text-white/50 hover:text-white/80">Skip</button>
          <div className="flex gap-2">
            {n > 0 && <button onClick={() => setN(n - 1)} className="t-caption text-white/60 hover:text-white">Back</button>}
            <button onClick={() => (n < steps.length - 1 ? setN(n + 1) : onDone())}
                    className="rounded-lg bg-sky-400/20 border border-sky-300/40 text-sky-200 text-[12px] px-3 py-1 hover:bg-sky-400/30">
              {n < steps.length - 1 ? "Next" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
