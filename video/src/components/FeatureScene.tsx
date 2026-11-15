import type React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ramp, track } from "../anim";
import { C, FONT } from "../theme";
import { Backdrop } from "./Backdrop";
import { BrowserStage } from "./BrowserStage";
import { Slot } from "./Callout";
import { FeatureTitle } from "./FeatureTitle";
import { Chip, type KWord } from "./Kinetic";
import { Sfx, type SfxCue } from "./Soundtrack";
import { Wipe } from "./Wipe";

export type Step = { readonly at: number; readonly out: number; readonly text: string; readonly bg: string; readonly fg?: string };
type Keys = [number, number][];

export const WIN = { x: 260, y: 26, w: 1400 };

/** Chapter card → the real recording in a browser window with a keyframed camera and step labels. */
export const FeatureScene = ({
  number, label, titleWords, titleBg, accent, demo, numberAt, footage, zoom, cx, cy, steps, sfx, bloomA, bloomB, children,
}: {
  readonly number: string;
  readonly label?: string;
  readonly titleWords: readonly KWord[];
  readonly titleBg: string;
  readonly accent: string;
  /** scene-local second at which the title card wipes to the demo */
  readonly demo: number;
  readonly numberAt: number;
  readonly footage: React.ReactNode;
  readonly zoom: Keys;
  readonly cx: Keys;
  readonly cy: Keys;
  readonly steps: readonly Step[];
  readonly sfx: readonly SfxCue[];
  readonly bloomA: string;
  readonly bloomB: string;
  readonly children?: React.ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const enter = ramp(t, demo - 0.1, 0.7);
  const winY = WIN.y + (1 - enter) * 90;
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} bloomA={bloomA} bloomB={bloomB} drift={t / 24} grain="screen" />
      {t >= demo - 0.2 ? (
        <>
          <BrowserStage x={WIN.x} y={winY} width={WIN.w} label="Equal Care Finland" opacity={enter} zoom={track(t, zoom)} cx={track(t, cx)} cy={track(t, cy)}>
            {footage}
          </BrowserStage>
          {steps.map((s) => (
            <Slot key={s.text} at={s.at} out={s.out} style={{ right: 1920 - (WIN.x + WIN.w) + 22, top: winY + 62 }}>
              <Chip bg={s.bg} fg={s.fg ?? C.ink} size={27} style={{ boxShadow: "0 14px 34px -10px rgba(0,0,0,0.7)" }}>
                {s.text}
              </Chip>
            </Slot>
          ))}
          {children}
        </>
      ) : null}
      {t < demo + 0.7 ? (
        <AbsoluteFill style={{ opacity: t < demo ? 1 : 0 }}>
          <FeatureTitle number={number} label={label} bg={titleBg} fg={C.cream} accent={accent} numberAt={numberAt} words={titleWords} />
        </AbsoluteFill>
      ) : null}
      <Wipe at={demo} colors={[C.ink, accent, C.cream]} />
      <Sfx cues={[{ at: numberAt, name: "thud", volume: 0.4 }, { at: demo - 0.4, name: "whoosh-soft", volume: 0.35 }, ...sfx]} />
    </AbsoluteFill>
  );
};

/** A callout card over the quiet side of the window: one big figure and what it means. */
export const Stat = ({ value, label, color, note }: { readonly value: string; readonly label: string; readonly color: string; readonly note?: string }) => (
  <div
    style={{
      width: 440,
      padding: "26px 32px 28px",
      borderRadius: 26,
      backgroundColor: "rgba(13,16,23,0.94)",
      border: `2px solid ${color}55`,
      boxShadow: "0 30px 70px -24px rgba(0,0,0,0.8)",
    }}
  >
    <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 84, lineHeight: 1, letterSpacing: "-0.03em", color }}>{value}</div>
    <div style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 44, lineHeight: 1.15, letterSpacing: "-0.02em", color: C.cream, marginTop: 12 }}>{label}</div>
    {note ? <div style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 26, color: C.mute, marginTop: 12 }}>{note}</div> : null}
  </div>
);
