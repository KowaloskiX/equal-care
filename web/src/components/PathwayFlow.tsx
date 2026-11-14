"use client";
// Step 4 visuals: per-stage waffle of 100 dots — green = on track, rose = fell out at this stage —
// plus a count-up for the hero number. Numbers come from sourced indicators only; each stage is
// measured on its own cohort, so the columns never multiply into one cascade.
import { useEffect, useRef, useState } from "react";

export function CountUp({ v }: { v: number }) {
  const [n, setN] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current; prev.current = v;
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const x = Math.min(1, (t - t0) / 750);
      setN(from + (v - from) * (1 - Math.pow(1 - x, 3)));
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <>{Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-US").replace(/,/g, " ") : n.toFixed(1)}</>;
}

export default function FlowDots({ track, status, col }: {
  track: number | null;                    // 0-100 on-track share, null = no public data
  status: "worse" | "better" | "close" | "gap";
  col: number;                             // stage index — columns fill left→right like a pathway
}) {
  // parent remounts this component via key, so the cascade replays per county/programme
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 30); return () => clearTimeout(t); }, []);

  const good = track == null ? 0 : Math.round(track);
  const dots = Array.from({ length: 100 }, (_, i) => i);
  return (
    <div className="w-full max-w-[64px] mx-auto mt-1" role="img"
         aria-label={track == null ? "no public data for this stage"
                                    : `${good} of 100 people on track at this stage`}
         title={track == null ? "no public data for this stage"
                              : `${good} of 100 on track — ${status}`}>
      <svg viewBox="0 0 60 34" className="w-full block">
        {dots.map((i) => {
          const c = i % 10, row = Math.floor(i / 10);
          const isGood = i < good;
          const cls = track == null ? "fill-white/10"
                      : isGood ? "fill-emerald-400/80" : "fill-rose-400/60";
          const delay = col * 480 + c * 38 + row * 4;   // column starts after the previous one ends
          return (
            <circle key={i} cx={3 + c * 6} cy={3 + row * 3.2} r={1.25} className={cls}
                    style={{ opacity: on ? 1 : 0, transform: on ? "scale(1)" : "scale(0.3)",
                             transformBox: "fill-box", transformOrigin: "center",
                             transition: `opacity 200ms ease ${delay}ms, transform 200ms ease ${delay}ms` }} />
          );
        })}
        {track == null && (
          <text x="30" y="20" textAnchor="middle" className="fill-white/30" fontSize="9"
                style={{ opacity: on ? 1 : 0, transition: `opacity 300ms ease ${col * 480}ms` }}>?</text>
        )}
      </svg>
    </div>
  );
}
