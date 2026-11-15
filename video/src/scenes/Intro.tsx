import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ramp, track } from "../anim";
import { Backdrop } from "../components/Backdrop";
import { BrowserStage } from "../components/BrowserStage";
import { Disclosure, Slot, Sub } from "../components/Callout";
import { type Cut, FOOTAGE, Footage, sceneTimeOf } from "../components/Footage";
import { Chip, KineticLine, Pop } from "../components/Kinetic";
import { Sfx } from "../components/Soundtrack";
import { C, FONT } from "../theme";
import { said } from "../vo";

/** 0–12 s · the problem, one cited figure. */
export const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const A_OUT = 6.5;
  const helsinki = said("hook-2", 9);
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} bloomA="rgba(251,113,133,0.20)" bloomB="rgba(56,189,248,0.14)" drift={t / 12} grain="screen" />
      <div style={{ position: "absolute", left: 150, top: 200, width: 1100 }}>
        <KineticLine
          size={104}
          color={C.cream}
          out={A_OUT}
          words={[
            { text: "Finland", at: said("hook-1", 0) },
            { text: "invites", at: said("hook-1", 1) },
            { text: "every", at: said("hook-1", 2), br: true },
            { text: "woman", at: said("hook-1", 3) },
            { text: "to", at: said("hook-1", 4) },
            { text: "free", at: said("hook-1", 5), br: true },
            { text: "breast", at: said("hook-1", 6) },
            { text: "screening.", at: said("hook-1", 7) },
          ]}
        />
      </div>
      <Pop at={said("hook-1", 11)} out={A_OUT} style={{ position: "absolute", left: 1270, top: 250 }}>
        <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 250, lineHeight: 1, letterSpacing: "-0.04em", color: C.amber }}>80 %</div>
        <Sub color={C.mute} style={{ marginTop: 8 }}>attendance target</Sub>
      </Pop>

      <div style={{ position: "absolute", left: 150, top: 200, width: 1100 }}>
        <KineticLine
          size={104}
          color={C.cream}
          words={[
            { text: "The", at: said("hook-2", 0) },
            { text: "county", at: said("hook-2", 1) },
            { text: "furthest", at: said("hook-2", 2), br: true },
            { text: "behind", at: said("hook-2", 3) },
            { text: "is", at: said("hook-2", 4) },
            { text: "not", at: said("hook-2", 5), br: true },
            { text: "rural.", at: said("hook-2", 6) },
            { text: "It", at: said("hook-2", 7), br: true, color: C.rose },
            { text: "is", at: said("hook-2", 8), color: C.rose },
            { text: "Helsinki.", at: helsinki, color: C.rose },
          ]}
        />
      </div>
      <Pop at={helsinki + 0.15} style={{ position: "absolute", left: 1210, top: 250 }}>
        <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 200, lineHeight: 1, letterSpacing: "-0.04em", color: C.rose }}>74.3 %</div>
        <Sub color={C.mute} style={{ marginTop: 10, width: 600 }}>attend · about 2 201 women a year short</Sub>
      </Pop>
      <Slot at={helsinki + 0.3} out={12.5} style={{ left: 150, top: 880 }}>
        <Disclosure dark>Source: THL Sotkanet indicator 3621, breast screening attendance 2024</Disclosure>
      </Slot>
      <Sfx
        cues={[
          { at: said("hook-1", 11), name: "pop", volume: 0.45 },
          { at: A_OUT - 0.2, name: "swish", volume: 0.3 },
          { at: helsinki + 0.1, name: "thud", volume: 0.5 },
        ]}
      />
    </AbsoluteFill>
  );
};

const LOOK: Cut = { at: 2.0, src: [0.6, 13.6], rate: 2.6 }; // journey: ranking rows + map tooltips
const TOUR: Cut = { at: 7.0, src: [4.7, 13.5], rate: 3.0 }; // tour: the built-in walkthrough

/** 12–26 s · name, promise, first look at the real product. */
export const Solution = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const enter = ramp(t, LOOK.at - 0.3, 0.8);
  const winW = 1300;
  const winX = 1920 - winW - 50 + (1 - enter) * 500;
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} bloomA="rgba(56,189,248,0.18)" bloomB="rgba(52,211,153,0.12)" drift={t / 14} grain="screen" />
      <div style={{ position: "absolute", left: 60, top: 150, width: 520 }}>
        <KineticLine
          size={96}
          color={C.cream}
          words={[
            { text: "Equal", at: said("sol-1", 0) },
            { text: "Care", at: said("sol-1", 1), br: true },
            { text: "Finland", at: said("sol-1", 2), br: true, color: C.rose },
          ]}
        />
      </div>
      {[
        { text: "Where", at: said("sol-1", 4), bg: C.rose },
        { text: "Why", at: said("sol-1", 9), bg: C.sky },
        { text: "What to do", at: said("sol-1", 11), bg: C.amber },
      ].map((c, i) => (
        <Pop key={c.text} at={c.at} from="left" style={{ position: "absolute", left: 60, top: 520 + i * 92 }}>
          <Chip bg={c.bg} fg={C.ink} size={38}>{c.text}</Chip>
        </Pop>
      ))}
      <BrowserStage
        x={winX}
        y={90}
        width={winW}
        label="Equal Care Finland"
        opacity={enter}
        zoom={track(t, [[2.5, 1.0], [3.3, 1.7], [5.2, 1.7], [6.0, 1.0]])}
        cx={track(t, [[2.5, 0.5], [3.3, 0.2], [5.2, 0.2], [6.0, 0.5]])}
        cy={track(t, [[2.5, 0.5], [3.3, 0.32], [5.2, 0.32], [6.0, 0.5]])}
      >
        {t < TOUR.at ? <Footage name="journey" cuts={[LOOK]} /> : <Footage name="tour" cuts={[TOUR]} />}
      </BrowserStage>
      <Slot at={2.6} out={TOUR.at - 0.05} style={{ right: 72, top: 152 }}>
        <Chip bg={C.cream} fg={C.ink} size={27}>Public data · every number sourced</Chip>
      </Slot>
      <Slot at={TOUR.at + 0.1} out={14.5} style={{ right: 72, top: 152 }}>
        <Chip bg={C.sky} fg={C.ink} size={27}>Built-in guided tour</Chip>
      </Slot>
      <Slot at={TOUR.at + 0.3} out={14.5} style={{ left: 60, top: 872 }}>
        <Disclosure dark>Real recording · sped up ×3</Disclosure>
      </Slot>
      <Sfx
        cues={[
          { at: LOOK.at - 0.3, name: "whoosh-soft", volume: 0.3 },
          { at: said("sol-1", 4), name: "pop", volume: 0.3 },
          { at: said("sol-1", 9), name: "pop", volume: 0.3 },
          { at: said("sol-1", 11), name: "pop", volume: 0.3 },
          { at: sceneTimeOf(TOUR, FOOTAGE.tour.events["tour-open"]), name: "mouse-click", volume: 0.45 },
        ]}
      />
    </AbsoluteFill>
  );
};
