import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";

// Same family the Equal Care Finland app ships with (Geist / Geist Mono).
const geist = loadGeist("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });

export const FONT = {
  display: `${geist.fontFamily}, system-ui, sans-serif`,
  sans: `${geist.fontFamily}, system-ui, sans-serif`,
  mono: `${mono.fontFamily}, ui-monospace, monospace`,
};

/** The app's own dark palette (web/src/app/globals.css): rose = gap, sky = simulation, amber = roadmap, emerald = attends. */
export const C = {
  ink: "#090B10",
  panel: "#0D1017",
  slate: "#161B26",
  cream: "#F8FAFC",
  mute: "rgba(248,250,252,0.62)",
  rose: "#FB7185",
  sky: "#38BDF8",
  skySoft: "#7DD3FC",
  emerald: "#34D399",
  amber: "#FBBF24",
  violet: "#A78BFA",
  // aliases used by the shared components
  solar: "#FBBF24",
  tangerine: "#FB7185",
  butter: "#161B26",
};

/** Master timeline, in seconds. Section starts sit on the score's 2 s bar lines. */
export const SECTION = {
  hook: { from: 0, to: 12 },
  solution: { from: 12, to: 22 },
  core: { from: 22, to: 52 },
  trust: { from: 52, to: 71 },
  feature2: { from: 71, to: 89 },
  feature3: { from: 89, to: 106 },
  difference: { from: 106, to: 113.5 },
  ending: { from: 113.5, to: 120 },
} as const;

export const TOTAL_SECONDS = 120;
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
