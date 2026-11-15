import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, ramp } from "../anim";
import { Backdrop } from "../components/Backdrop";
import { BrowserStage } from "../components/BrowserStage";
import { Disclosure, Slot, Sub } from "../components/Callout";
import { type Cut, FOOTAGE, Footage, sceneTimeOf } from "../components/Footage";
import { Chip, KineticLine, Pop } from "../components/Kinetic";
import { Sfx } from "../components/Soundtrack";
import { C, FONT } from "../theme";
import { said } from "../vo";

const R = FOOTAGE.report.events;
const GEN: Cut = { at: 0.15, src: [2.4, 8.7], rate: 3.0 }; // Generate → the briefing
const SLIDES: Cut = { at: 2.25, src: [13.9, 32.6], rate: 3.6 }; // the slide deck
const SPLIT = 3.4;

const ROLES = [
  { text: "Simulated residents", color: C.sky },
  { text: "Roadmap matching", color: C.amber },
  { text: "Stage priority", color: C.sky },
  { text: "Briefing & cover art", color: C.violet },
  { text: "This voice-over", color: C.emerald },
];

/** 98–114 s · what actually exists: the generated briefing, and where Gemini is used. */
export const Difference = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const enter = ramp(t, 0, 0.7);
  const split = ramp(t, SPLIT, 0.8, EASE.inOut);
  const winW = 1400 - split * 340;
  const winX = 260 + split * 550;
  const winY = 26 + split * 120 + (1 - enter) * 60;
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} bloomA="rgba(167,139,250,0.16)" bloomB="rgba(56,189,248,0.12)" drift={t / 16} grain="screen" />
      <BrowserStage x={winX} y={winY} width={winW} label="Equal Care Finland · generated report" opacity={enter}>
        <Footage name="report" cuts={[GEN, SLIDES]} />
      </BrowserStage>
      <Slot at={0.5} out={SLIDES.at - 0.05} style={{ right: 1920 - (winX + winW) + 22, top: winY + 62 }}>
        <Chip bg={C.violet} fg={C.ink} size={27}>Briefing from your session</Chip>
      </Slot>
      <Slot at={SLIDES.at + 0.1} out={16.5} style={{ right: 1920 - (winX + winW) + 22, top: winY + 62 }}>
        <Chip bg={C.cream} fg={C.ink} size={27}>Slides · numbers inserted by code</Chip>
      </Slot>
      <div style={{ position: "absolute", left: 60, top: 110, width: 720, opacity: split }}>
        <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 30, letterSpacing: "0.16em", textTransform: "uppercase", color: C.skySoft }}>Where Gemini is used</div>
        {ROLES.map((r, i) => (
          <Pop key={r.text} at={SPLIT + 0.3 + i * 0.16} from="left" style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 30 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: r.color, flexShrink: 0 }} />
            <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 56, letterSpacing: "-0.025em", color: C.cream, whiteSpace: "nowrap" }}>{r.text}</div>
          </Pop>
        ))}
        <Pop at={SPLIT + 1.2} style={{ marginTop: 44 }}>
          <Sub color={C.mute}>Every number: computed and checked by code.</Sub>
        </Pop>
      </div>
      <Slot at={0.6} out={16.5} style={{ left: 60, top: 872 }}>
        <Disclosure dark>Real recording, sped up ×3 · report text by Gemini, cached from an earlier run · narration: Gemini TTS</Disclosure>
      </Slot>
      <Sfx
        cues={[
          { at: sceneTimeOf(GEN, R.generate), name: "mouse-click", volume: 0.5 },
          { at: sceneTimeOf(SLIDES, R["slide:title"]), name: "mouse-click", volume: 0.45 },
          { at: sceneTimeOf(SLIDES, R["slide:where"]), name: "page-turn", volume: 0.4 },
          { at: sceneTimeOf(SLIDES, R["slide:why"]), name: "page-turn", volume: 0.4 },
          { at: sceneTimeOf(SLIDES, R["slide:who"]), name: "page-turn", volume: 0.4 },
          { at: sceneTimeOf(SLIDES, R["slide:what"]), name: "page-turn", volume: 0.4 },
          { at: SPLIT, name: "whoosh-soft", volume: 0.3 },
        ]}
      />
    </AbsoluteFill>
  );
};

/** 114–120 s · name, tagline, link. */
export const Ending = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} bloomA="rgba(251,113,133,0.22)" bloomB="rgba(56,189,248,0.18)" drift={t / 6} grain="screen" />
      <AbsoluteFill style={{ alignItems: "center", top: 200 }}>
        <KineticLine
          size={150}
          color={C.cream}
          align="center"
          words={[
            { text: "Equal", at: said("end-1", 0) },
            { text: "Care", at: said("end-1", 1) },
            { text: "Finland", at: said("end-1", 2), color: C.rose },
          ]}
        />
        <div style={{ display: "flex", gap: 26, marginTop: 56 }}>
          {[
            { text: "Where the gap is", at: said("end-1", 3), bg: C.rose },
            { text: "Why", at: said("end-1", 7), bg: C.sky },
            { text: "What to do next", at: said("end-1", 9), bg: C.amber },
          ].map((c) => (
            <Pop key={c.text} at={c.at}>
              <Chip bg={c.bg} fg={C.ink} size={40}>{c.text}</Chip>
            </Pop>
          ))}
        </div>
        <Pop at={0.9} style={{ marginTop: 70, textAlign: "center" }}>
          <div style={{ fontFamily: FONT.mono, fontWeight: 600, fontSize: 46, color: C.cream }}>github.com/KowaloskiX/equal-care</div>
          <Sub color={C.mute} style={{ marginTop: 18 }}>Junction 2026 · AstraZeneca · Equal Care Across Finland</Sub>
        </Pop>
      </AbsoluteFill>
      <Sfx cues={[{ at: said("end-1", 0), name: "thud", volume: 0.45 }, { at: 0.9, name: "sparkle", volume: 0.3 }]} />
    </AbsoluteFill>
  );
};
