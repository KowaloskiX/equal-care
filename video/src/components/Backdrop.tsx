import type React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/></svg>\")";

/** Papery backdrop with two soft colour blooms — the app's own warm-paper look. */
export const Backdrop = ({
  color = C.cream,
  bloomA = "rgba(255,206,50,0.34)",
  bloomB = "rgba(255,107,43,0.16)",
  drift = 0,
  grain = "multiply",
  children,
}: {
  readonly color?: string;
  readonly bloomA?: string;
  readonly bloomB?: string;
  /** 0–1, slowly moves the blooms */
  readonly drift?: number;
  readonly grain?: "multiply" | "screen";
  readonly children?: React.ReactNode;
}) => (
  <AbsoluteFill style={{ backgroundColor: color, overflow: "hidden" }}>
    <div
      style={{
        position: "absolute",
        width: 1300,
        height: 1300,
        borderRadius: "50%",
        left: -380 + drift * 140,
        top: -520 + drift * 60,
        background: `radial-gradient(circle, ${bloomA} 0%, transparent 62%)`,
      }}
    />
    <div
      style={{
        position: "absolute",
        width: 1200,
        height: 1200,
        borderRadius: "50%",
        right: -360 + drift * 120,
        bottom: -560 - drift * 50,
        background: `radial-gradient(circle, ${bloomB} 0%, transparent 62%)`,
      }}
    />
    <AbsoluteFill style={{ backgroundImage: GRAIN, mixBlendMode: grain, opacity: grain === "screen" ? 0.5 : 1 }} />
    {children}
  </AbsoluteFill>
);
