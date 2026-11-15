import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, ramp } from "../anim";
import { FONT } from "../theme";
import { KineticLine, type KWord } from "./Kinetic";

/** Full-screen chapter card that opens each of the three feature demos. */
export const FeatureTitle = ({
  number,
  words,
  bg,
  fg,
  accent,
  numberAt,
  label,
}: {
  readonly number: string;
  readonly words: readonly KWord[];
  readonly bg: string;
  readonly fg: string;
  readonly accent: string;
  /** scene-local second at which the numeral lands */
  readonly numberAt: number;
  readonly label?: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const n = ramp(t, numberAt - 0.1, 0.6, EASE.out);
  return (
    <AbsoluteFill style={{ backgroundColor: bg, overflow: "hidden" }}>
      {/* giant outlined numeral drifting behind the title */}
      <div
        style={{
          position: "absolute",
          right: -40 + t * 26,
          top: -150,
          fontFamily: FONT.display,
          fontWeight: 700,
          fontSize: 1150,
          lineHeight: 1,
          letterSpacing: "-0.06em",
          color: "transparent",
          WebkitTextStroke: `5px ${accent}`,
          opacity: 0.34 * n,
        }}
      >
        {number}
      </div>
      <div style={{ position: "absolute", left: 150, top: 300, width: 1500 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 20,
            fontFamily: FONT.sans,
            fontWeight: 800,
            fontSize: 40,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: accent,
            opacity: n,
            translate: `${(1 - n) * -60}px 0px`,
          }}
        >
          <div style={{ width: 90 * n, height: 6, borderRadius: 3, backgroundColor: accent }} />
          {label ?? `Feature ${number}`}
        </div>
        <KineticLine size={172} color={fg} words={words} style={{ marginTop: 26 }} lineHeight={1.0} />
      </div>
    </AbsoluteFill>
  );
};
