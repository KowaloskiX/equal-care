import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, ramp } from "../anim";

/**
 * Scene-change wipe: three slanted colour bands sweep across the frame and
 * fully cover it at `at` (seconds), then clear — so the cut underneath is hidden.
 */
export const Wipe = ({
  at,
  colors,
  direction = 1,
}: {
  readonly at: number;
  readonly colors: readonly [string, string, string];
  readonly direction?: 1 | -1;
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;
  if (t < at - 0.5 || t > at + 0.62) return null;
  const span = width * 1.5;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {colors.map((c, i) => {
        const lag = i * 0.055;
        const cover = ramp(t, at - 0.42 + lag, 0.4, EASE.inOut);
        const clear = ramp(t, at + 0.06 + (2 - i) * 0.055, 0.42, EASE.inOut);
        const x = direction * (-span + cover * span + clear * span);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: -80,
              bottom: -80,
              left: -width * 0.25,
              width: span,
              backgroundColor: c,
              translate: `${x}px 0px`,
              transform: "skewX(-12deg)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
