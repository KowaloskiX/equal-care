import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, ramp } from "../anim";
import { C, FONT } from "../theme";

export type KWord = {
  readonly text: string;
  /** scene-local second at which the word lands */
  readonly at: number;
  readonly color?: string;
  readonly italic?: boolean;
  /** start a new line before this word */
  readonly br?: boolean;
};

/** Words that rise into place one by one — timed to the narration. */
export const KineticLine = ({
  words,
  size = 96,
  color = C.ink,
  font = FONT.display,
  weight = 600,
  align = "left",
  lineHeight = 1.06,
  out,
  style,
}: {
  readonly words: readonly KWord[];
  readonly size?: number;
  readonly color?: string;
  readonly font?: string;
  readonly weight?: number;
  readonly align?: "left" | "center";
  readonly lineHeight?: number;
  /** scene-local second at which the whole line leaves */
  readonly out?: number;
  readonly style?: React.CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const leave = out == null ? 0 : ramp(t, out - 0.3, 0.3, EASE.in);
  const lines: KWord[][] = [[]];
  for (const w of words) {
    if (w.br) lines.push([]);
    lines[lines.length - 1].push(w);
  }
  return (
    <div
      style={{
        fontFamily: font,
        fontWeight: weight,
        fontSize: size,
        lineHeight,
        letterSpacing: font === FONT.display ? "-0.022em" : "-0.03em",
        color,
        textAlign: align,
        opacity: 1 - leave,
        translate: `0px ${-leave * 40}px`,
        ...style,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", columnGap: "0.26em" }}>
          {line.map((w, i) => {
            const p = ramp(t, w.at - 0.08, 0.5);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: Math.min(1, p * 1.6),
                  translate: `0px ${(1 - p) * size * 0.55}px`,
                  rotate: `${(1 - p) * 4}deg`,
                  filter: p < 0.98 ? `blur(${(1 - p) * 10}px)` : undefined,
                  color: w.color,
                  fontStyle: w.italic ? "italic" : undefined,
                  whiteSpace: "pre",
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Small uppercase label chip. */
export const Chip = ({
  children,
  bg = C.ink,
  fg = C.cream,
  size = 24,
  style,
}: {
  readonly children: React.ReactNode;
  readonly bg?: string;
  readonly fg?: string;
  readonly size?: number;
  readonly style?: React.CSSProperties;
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.42,
      padding: `${size * 0.42}px ${size * 0.85}px`,
      borderRadius: 999,
      backgroundColor: bg,
      color: fg,
      fontFamily: FONT.sans,
      fontWeight: 800,
      fontSize: size,
      letterSpacing: "0.09em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Pops a block in (scale + rise) at `at`, and optionally out at `out`. */
export const Pop = ({
  at,
  out,
  from = "bottom",
  distance = 46,
  children,
  style,
}: {
  readonly at: number;
  readonly out?: number;
  readonly from?: "bottom" | "left" | "right" | "top";
  readonly distance?: number;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const p = ramp(t, at, 0.55, EASE.out);
  const q = out == null ? 0 : ramp(t, out - 0.28, 0.28, EASE.in);
  const d = (1 - p) * distance + q * -distance * 0.5;
  const tx = from === "left" ? -d : from === "right" ? d : 0;
  const ty = from === "bottom" ? d : from === "top" ? -d : 0;
  if (t < at - 0.05 || (out != null && t > out + 0.05)) return null;
  return (
    <div
      style={{
        opacity: Math.min(1, p * 1.5) * (1 - q),
        translate: `${tx}px ${ty}px`,
        scale: String(0.94 + 0.06 * p),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** A tactile "sticker" card in the app's own style (flat block + chunky bottom edge). */
export const Card = ({
  children,
  bg = C.butter,
  style,
}: {
  readonly children: React.ReactNode;
  readonly bg?: string;
  readonly style?: React.CSSProperties;
}) => (
  <div
    style={{
      backgroundColor: bg,
      borderRadius: 34,
      borderBottom: "7px solid rgba(28,25,23,0.12)",
      padding: "30px 36px",
      ...style,
    }}
  >
    {children}
  </div>
);
