import { Disclosure, Slot } from "../components/Callout";
import { FeatureScene, Stat } from "../components/FeatureScene";
import { type Cut, FOOTAGE, Footage, sceneTimeOf } from "../components/Footage";
import { C } from "../theme";
import { lineEnd, said } from "../vo";

const E = FOOTAGE.journey.events;
const CALL = { left: 1196, top: 230 }; // callout column over the quiet (map) side of the window

/* ───────── 52–74 s · Feature 2 — what would help ───────── */
const D2 = 2.3;
const PICK: Cut = { at: D2, src: [43.4, 48.4], rate: 2.0 }; // choose "Own language"
const RUN: Cut = { at: 4.8, src: [48.4, 56.0], rate: 2.4 }; // residents answer again, dots flip
const RESULT: Cut = { at: 8.0, src: [56.0, 59.6], rate: 1.0 }; // the range across two models
const ROADMAP: Cut = { at: 11.6, src: [59.6, 64.3], rate: 0.8 }; // cited roadmap action

export const Feature2 = () => (
  <FeatureScene
    number="02"
    label="What would help"
    titleBg="#0A2E24"
    accent={C.emerald}
    demo={D2}
    numberAt={0.5}
    titleWords={[
      { text: "What", at: said("f2-1", 1) },
      { text: "would", at: said("f2-1", 2), br: true },
      { text: "help.", at: said("f2-1", 3), italic: true },
    ]}
    bloomA="rgba(52,211,153,0.16)"
    bloomB="rgba(251,191,36,0.12)"
    footage={<Footage name="journey" cuts={[PICK, RUN, RESULT, ROADMAP]} />}
    zoom={[[D2 + 0.3, 1.0], [D2 + 1.2, 1.9], [RUN.at - 0.01, 1.9], [RUN.at + 0.8, 1.3], [RESULT.at - 0.01, 1.3], [RESULT.at + 0.8, 2.1], [ROADMAP.at - 0.01, 2.1], [ROADMAP.at + 0.8, 2.4]]}
    cx={[[D2 + 0.3, 0.5], [D2 + 1.2, 0.2], [RUN.at - 0.01, 0.2], [RUN.at + 0.8, 0.0], [RESULT.at - 0.01, 0.0], [RESULT.at + 0.8, 0.2], [22, 0.2]]}
    cy={[[D2 + 0.3, 0.5], [D2 + 1.2, 0.3], [RUN.at - 0.01, 0.3], [RUN.at + 0.8, 0.5], [RESULT.at - 0.01, 0.5], [RESULT.at + 0.8, 0.44], [ROADMAP.at - 0.01, 0.44], [ROADMAP.at + 0.8, 0.6]]}
    steps={[
      { at: D2 + 0.3, out: RUN.at - 0.05, text: "Pick an intervention", bg: C.cream },
      { at: RUN.at + 0.1, out: RESULT.at - 0.05, text: "Same residents, new answers", bg: C.emerald },
      { at: RESULT.at + 0.1, out: ROADMAP.at - 0.05, text: "A range, not one number", bg: C.emerald },
      { at: ROADMAP.at + 0.1, out: 22.5, text: "Cited roadmap action", bg: C.amber },
    ]}
    sfx={[
      { at: sceneTimeOf(PICK, E.pick), name: "switch", volume: 0.5 },
      { at: sceneTimeOf(RUN, E.run), name: "mouse-click", volume: 0.5 },
      { at: sceneTimeOf(RUN, E.result), name: "chime", volume: 0.35 },
    ]}
  >
    <Slot at={said("f2-3", 14) - 0.3} out={ROADMAP.at - 0.1} style={CALL}>
      <Stat value="45–95 %" label="of Helsinki's gap" color={C.emerald} note="Jev +992 · Gemini Decisions +2 093" />
    </Slot>
    <Slot at={said("f2-4", 5) - 0.2} out={22.5} style={CALL}>
      <Stat value="1.3.1" label="roadmap action, page 33" color={C.amber} note="matched to the roadmap text by Gemini" />
    </Slot>
    <Slot at={RUN.at + 0.4} out={22.5} style={{ left: 60, top: 872 }}>
      <Disclosure dark>Simulated upper bound, not a forecast · replayed from recorded answers</Disclosure>
    </Slot>
  </FeatureScene>
);

/* ───────── 74–98 s · Feature 3 — the rest of the pathway (Goal 3) ───────── */
const D3 = 3.7;
const PATH: Cut = { at: D3, src: [70.5, 74.4], rate: 3.0 }; // five stages + Gemini's pick
const SATA: Cut = { at: 5.0, src: [74.4, 82.2], rate: 2.6 }; // Satakunta → Treatment
const PLAY: Cut = { at: 8.0, src: [82.2, 95.8], rate: 3.2 }; // monthly queues on the map
const HERO: Cut = { at: 12.25, src: [95.8, 99.1], rate: 0.75 }; // n = 8 · small numbers

export const Feature3 = () => (
  <FeatureScene
    number="03"
    label="Goal 3"
    titleBg="#33260A"
    accent={C.amber}
    demo={D3}
    numberAt={0.5}
    titleWords={[
      { text: "The", at: said("f3-1", 3) },
      { text: "rest", at: said("f3-1", 4) },
      { text: "of", at: said("f3-1", 5), br: true },
      { text: "the", at: said("f3-1", 6) },
      { text: "pathway.", at: said("f3-1", 7), italic: true },
    ]}
    bloomA="rgba(251,191,36,0.14)"
    bloomB="rgba(56,189,248,0.12)"
    footage={<Footage name="journey" cuts={[PATH, SATA, PLAY, HERO]} />}
    zoom={[[D3 + 0.3, 1.0], [SATA.at + 0.6, 1.25], [HERO.at - 0.01, 1.25], [HERO.at + 0.8, 2.3]]}
    cx={[[D3 + 0.3, 0.5], [SATA.at + 0.6, 0.0], [HERO.at - 0.01, 0.0], [HERO.at + 0.8, 0.2]]}
    cy={[[D3, 0.5], [20, 0.5]]}
    steps={[
      { at: D3 + 0.3, out: SATA.at - 0.05, text: "Strategy Goal 3 · the pathway", bg: C.amber },
      { at: SATA.at + 0.1, out: PLAY.at - 0.05, text: "Satakunta · oncology queue", bg: C.rose },
      { at: PLAY.at + 0.1, out: HERO.at - 0.05, text: "Month by month · THL data", bg: C.cream },
      { at: HERO.at + 0.1, out: 24.5, text: "Small numbers, flagged", bg: C.amber },
    ]}
    sfx={[
      { at: sceneTimeOf(SATA, E.satakunta), name: "mouse-click", volume: 0.5 },
      { at: sceneTimeOf(SATA, E.treatment), name: "mouse-click", volume: 0.5 },
      { at: sceneTimeOf(PLAY, E.play), name: "mouse-click", volume: 0.5 },
    ]}
  >
    <Slot at={said("f3-4", 2) - 0.3} out={24.5} style={CALL}>
      <Stat value="n = 8" label="patients behind the 37.5 %" color={C.amber} note="Finland: 3.5 % wait over 90 days" />
    </Slot>
    <Slot at={SATA.at + 0.4} out={lineEnd("f3-4") + 1.2} style={{ left: 60, top: 872 }}>
      <Disclosure dark>Source: THL care-access data (Hoitoon pääsy), oncology, 09/2026 · queue playback sped up ×3</Disclosure>
    </Slot>
  </FeatureScene>
);
