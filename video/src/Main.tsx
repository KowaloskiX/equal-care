import { Sequence, useVideoConfig } from "remotion";
import { Music, Narration, Sfx } from "./components/Soundtrack";
import { Subtitles } from "./components/Subtitles";
import { Wipe } from "./components/Wipe";
import { Core, Trust } from "./scenes/Core";
import { Feature2, Feature3 } from "./scenes/Features";
import { Hook, Solution } from "./scenes/Intro";
import { Difference, Ending } from "./scenes/Outro";
import { C, SECTION } from "./theme";

/** Equal Care Finland — 120-second pitch + product demo. */
export const Main = () => {
  const { fps } = useVideoConfig();
  const span = (s: { from: number; to: number }) => ({
    from: Math.round(s.from * fps),
    durationInFrames: Math.round((s.to - s.from) * fps),
  });
  const cuts = [SECTION.solution, SECTION.core, SECTION.trust, SECTION.feature2, SECTION.feature3, SECTION.difference, SECTION.ending];
  return (
    <>
      <Sequence name="0:00 Hook — the problem" {...span(SECTION.hook)}><Hook /></Sequence>
      <Sequence name="0:12 Solution — Equal Care Finland" {...span(SECTION.solution)}><Solution /></Sequence>
      <Sequence name="0:22 Core — a simulated population" {...span(SECTION.core)}><Core /></Sequence>
      <Sequence name="0:52 Trust — validation and two engines" {...span(SECTION.trust)}><Trust /></Sequence>
      <Sequence name="1:11 What would help" {...span(SECTION.feature2)}><Feature2 /></Sequence>
      <Sequence name="1:29 The rest of the pathway" {...span(SECTION.feature3)}><Feature3 /></Sequence>
      <Sequence name="1:46 Difference — what is real" {...span(SECTION.difference)}><Difference /></Sequence>
      <Sequence name="1:53 Ending" {...span(SECTION.ending)}><Ending /></Sequence>

      {/* scene-change wipes: the last band to clear matches the next scene's backdrop */}
      <Wipe at={SECTION.solution.from} colors={[C.ink, C.sky, C.rose]} />
      <Wipe at={SECTION.core.from} colors={["#0B2A3D", C.sky, C.cream]} direction={-1} />
      <Wipe at={SECTION.trust.from} colors={[C.ink, C.emerald, C.cream]} />
      <Wipe at={SECTION.feature2.from} colors={["#0A2E24", C.emerald, C.cream]} direction={-1} />
      <Wipe at={SECTION.feature3.from} colors={["#33260A", C.amber, C.cream]} />
      <Wipe at={SECTION.difference.from} colors={[C.ink, C.violet, C.cream]} direction={-1} />
      <Wipe at={SECTION.ending.from} colors={[C.ink, C.rose, C.sky]} />

      <Subtitles />
      <Music />
      <Narration />
      <Sfx cues={cuts.map((s) => ({ at: s.from - 0.42, name: "whoosh-soft", volume: 0.45 }))} />
    </>
  );
};
