"use client";
// Step 4 visual: per-stage waffle of 100 dots — green = on track, rose = fell out at this stage.
// Numbers come from sourced indicators only (on-track share per stage); each stage is measured on
// its own cohort, so the columns never multiply into one cascade. Cascade-in via CSS delays.
import { useEffect, useState } from "react";

export default function FlowDots({ track, status }: {
  track: number | null;                    // 0-100 on-track share, null = no public data
  status: "worse" | "better" | "close" | "gap";
}) {
  // parent remounts this component via key={seedKey}, so the cascade replays per county/programme
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
          const col = i % 10, row = Math.floor(i / 10);
          const isGood = i < good;
          const cls = track == null ? "fill-white/10"
                      : isGood ? (status === "worse" ? "fill-emerald-400/70" : "fill-emerald-400/80")
                               : "fill-rose-400/60";
          return (
            <circle key={i} cx={3 + col * 6} cy={3 + row * 3.2} r={1.25} className={cls}
                    style={{ opacity: on ? 1 : 0, transition: `opacity 180ms ease ${i * 6}ms` }} />
          );
        })}
        {track == null && (
          <text x="30" y="20" textAnchor="middle" className="fill-white/30" fontSize="9">?</text>
        )}
      </svg>
    </div>
  );
}
