import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, ramp } from "../anim";
import { C, FONT } from "../theme";

/** A block that is visible between `at` and `out` (scene-local seconds), sliding in and out. */
export const Slot = ({
  at,
  out,
  children,
  style,
}: {
  readonly at: number;
  readonly out: number;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < at - 0.05 || t > out + 0.05) return null;
  const p = ramp(t, at, 0.5, EASE.out);
  const q = ramp(t, out - 0.3, 0.3, EASE.in);
  return (
    <div style={{ position: "absolute", opacity: Math.min(1, p * 1.5) * (1 - q), translate: `${(1 - p) * 70 - q * 50}px 0px`, ...style }}>
      {children}
    </div>
  );
};

/** Supporting sentence under a callout headline. */
export const Sub = ({ children, color = "rgba(28,25,23,0.66)", style }: { readonly children: React.ReactNode; readonly color?: string; readonly style?: React.CSSProperties }) => (
  <div style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 44, lineHeight: 1.25, letterSpacing: "-0.02em", color, ...style }}>{children}</div>
);

/** Small honest label for anything sped-up or simulated. */
export const Disclosure = ({ children, dark = false, style }: { readonly children: React.ReactNode; readonly dark?: boolean; readonly style?: React.CSSProperties }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      padding: "9px 20px",
      borderRadius: 999,
      border: `2px solid ${dark ? "rgba(253,248,238,0.22)" : "rgba(28,25,23,0.16)"}`,
      fontFamily: FONT.sans,
      fontWeight: 700,
      fontSize: 24,
      letterSpacing: "0.02em",
      color: dark ? "rgba(253,248,238,0.7)" : "rgba(28,25,23,0.58)",
      whiteSpace: "nowrap",
      backgroundColor: dark ? "rgba(9,11,16,0.88)" : undefined,
      ...style,
    }}
  >
    <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: dark ? C.solar : C.tangerine }} />
    {children}
  </div>
);
