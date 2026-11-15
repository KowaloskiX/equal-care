import { Video } from "@remotion/media";
import type React from "react";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import meta from "../footage/meta.json";

export type FootageName = keyof typeof meta;
export const FOOTAGE = meta;

/** One cut of real screen recording: where it sits in the scene, which part of the source, how fast. */
export type Cut = {
  /** scene-local start, seconds */
  readonly at: number;
  /** source in / out, seconds */
  readonly src: readonly [number, number];
  /** playback speed (source seconds per scene second) */
  readonly rate?: number;
};

export const cutLength = (c: Cut) => (c.src[1] - c.src[0]) / (c.rate ?? 1);
export const cutEnd = (c: Cut) => c.at + cutLength(c);
/** scene-local time at which source time `srcT` is on screen within `cut` */
export const sceneTimeOf = (cut: Cut, srcT: number) => cut.at + (srcT - cut.src[0]) / (cut.rate ?? 1);

/**
 * Plays a list of cuts from one recording, back to back, filling its parent.
 * Each cut is its own <Video> so trims and speed ramps stay editable.
 */
export const Footage = ({
  name,
  cuts,
  style,
}: {
  readonly name: FootageName;
  readonly cuts: readonly Cut[];
  readonly style?: React.CSSProperties;
}) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cuts.map((c, i) => {
        const next = cuts[i + 1];
        // hold the last frame until the next cut begins so there is never a gap
        const until = next ? next.at : cutEnd(c);
        return (
          <Sequence
            key={i}
            name={`${name} ${c.src[0].toFixed(1)}–${c.src[1].toFixed(1)}s ×${c.rate ?? 1}`}
            from={Math.round(c.at * fps)}
            durationInFrames={Math.max(1, Math.round((until - c.at) * fps))}
            layout="none"
          >
            <Video
              src={staticFile(meta[name].file)}
              muted
              trimBefore={Math.round(c.src[0] * fps)}
              playbackRate={c.rate ?? 1}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }}
              objectFit="fill"
            />
          </Sequence>
        );
      })}
    </>
  );
};
