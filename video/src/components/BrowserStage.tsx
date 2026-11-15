import type React from "react";
import { C, FONT } from "../theme";

const BAR = 46;

/**
 * A desktop window showing a 16:9 screen recording. `zoom`, `cx`, `cy` are a
 * camera inside the window: zoom ≥ 1 pushes in, keeping (cx, cy) centred and
 * clamped to the recording's edges. The recording is laid out at its zoomed
 * size (not CSS-scaled) so the 2880×1620 source stays sharp.
 */
export const BrowserStage = ({
  x,
  y,
  width,
  zoom = 1,
  cx = 0.5,
  cy = 0.5,
  label,
  dark = true,
  opacity = 1,
  children,
}: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly zoom?: number;
  readonly cx?: number;
  readonly cy?: number;
  readonly label: string;
  readonly dark?: boolean;
  readonly opacity?: number;
  readonly children: React.ReactNode;
}) => {
  const height = (width * 9) / 16;
  const vw = width * zoom;
  const vh = height * zoom;
  const left = Math.min(0, Math.max(width - vw, width / 2 - cx * vw));
  const top = Math.min(0, Math.max(height - vh, height / 2 - cy * vh));
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height: height + BAR,
        borderRadius: 22,
        overflow: "hidden",
        backgroundColor: dark ? "#0D1017" : "#FFFFFF",
        boxShadow: "0 50px 120px -40px rgba(0,0,0,0.65), 0 0 0 1.5px rgba(255,255,255,0.10)",
        opacity,
      }}
    >
      <div
        style={{
          height: BAR,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 18px",
          backgroundColor: dark ? "#131824" : "#F1ECE0",
          borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(28,25,23,0.08)"}`,
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: "50%", backgroundColor: c }} />
        ))}
        <div
          style={{
            marginLeft: 14,
            padding: "5px 16px",
            borderRadius: 999,
            fontFamily: FONT.sans,
            fontWeight: 600,
            fontSize: 17,
            color: dark ? "rgba(255,255,255,0.62)" : "rgba(28,25,23,0.6)",
            backgroundColor: dark ? "rgba(255,255,255,0.07)" : "rgba(28,25,23,0.06)",
          }}
        >
          {label}
        </div>
      </div>
      <div style={{ position: "relative", width, height, overflow: "hidden", backgroundColor: dark ? C.ink : C.cream }}>
        <div style={{ position: "absolute", left, top, width: vw, height: vh }}>{children}</div>
      </div>
    </div>
  );
};
