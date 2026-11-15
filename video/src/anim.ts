import { Easing, interpolate } from "remotion";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const EASE = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  back: Easing.bezier(0.34, 1.56, 0.64, 1),
};

/** 0→1 over [start, start+dur] seconds. */
export const ramp = (t: number, start: number, dur: number, easing = EASE.out) =>
  interpolate(t, [start, start + dur], [0, 1], { ...clamp, easing });

/** in (0→1) at `start`, out (1→0) ending at `end`. */
export const inOut = (t: number, start: number, end: number, fadeIn = 0.4, fadeOut = 0.3) =>
  Math.min(ramp(t, start, fadeIn), 1 - ramp(t, end - fadeOut, fadeOut, EASE.in));

/**
 * Keyframe track with eased moves and holds: [[time, value], ...].
 * Repeat a value to hold it; every segment between different values is eased.
 */
export const track = (t: number, keys: [number, number][], easing = EASE.inOut) =>
  keys.length === 1
    ? keys[0][1]
    : interpolate(t, keys.map((k) => k[0]), keys.map((k) => k[1]), { ...clamp, easing });

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
