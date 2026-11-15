import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ramp, track } from "../anim";
import { Backdrop } from "../components/Backdrop";
import { BrowserStage } from "../components/BrowserStage";
import { Disclosure, Slot, Sub } from "../components/Callout";
import { Stat, WIN } from "../components/FeatureScene";
import { FeatureTitle } from "../components/FeatureTitle";
import { type Cut, FOOTAGE, Footage, sceneTimeOf } from "../components/Footage";
import { Chip, KineticLine, Pop } from "../components/Kinetic";
import { Sfx } from "../components/Soundtrack";
import { Wipe } from "../components/Wipe";
import { C, FONT } from "../theme";
import { said } from "../vo";

const E = FOOTAGE.journey.events;
const BUILD = 4.2; // title → how the population is built
const DEMO = 15.4; // → the real app
const ASK: Cut = { at: DEMO, src: [22.5, 30.3], rate: 1.1 }; // ask the residents → dots rain in
const GROUPS: Cut = { at: 22.5, src: [30.3, 34.2], rate: 1.7 }; // who skips + barriers
const DOT: Cut = { at: 24.8, src: [34.2, 40.9], rate: 1.5 }; // one resident, the exact prompt

// Four of Helsinki's 771 resident types, as returned by the app's /api/residents/breast/90.
const TYPES = [
  { who: "Woman 65–69 · Finnish · retired", n: "3 933", p: 92, why: "habit" },
  { who: "Woman 55–59 · Finnish · employed", n: "3 714", p: 93, why: "habit" },
  { who: "Woman 65–69 · another language · retired", n: "563", p: 47, why: "language" },
  { who: "Woman 55–59 · another language · employed", n: "531", p: 71, why: "language" },
];

const TypeCard = ({ who, n, p, why, answered }: (typeof TYPES)[number] & { readonly answered: number }) => (
  <div style={{ width: 800, padding: "20px 28px", borderRadius: 22, backgroundColor: "rgba(13,16,23,0.94)", border: "2px solid rgba(255,255,255,0.12)" }}>
    <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 36, letterSpacing: "-0.02em", color: C.cream }}>{who}</div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
      <div style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 28, color: C.mute }}>{n} women like her in Helsinki</div>
      <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 30, color: p < 80 ? C.rose : C.emerald, opacity: answered }}>
        {p} % attend · {why}
      </div>
    </div>
  </div>
);

/** 22–52 s · the core: how the simulated population is built, asked and read. */
export const Core = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const enter = ramp(t, DEMO - 0.1, 0.7);
  const traits = [
    { text: "Age", at: said("c-2", 12), bg: C.cream },
    { text: "Language", at: said("c-2", 13), bg: C.rose },
    { text: "Education", at: said("c-2", 14), bg: C.amber },
    { text: "Work", at: said("c-2", 15), bg: C.emerald },
  ];
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} bloomA="rgba(56,189,248,0.18)" bloomB="rgba(251,113,133,0.12)" drift={t / 30} grain="screen" />

      {t >= BUILD - 0.2 && t < DEMO + 0.7 ? (
        <AbsoluteFill style={{ opacity: t < DEMO ? 1 : 0 }}>
          <div style={{ position: "absolute", left: 90, top: 110, width: 800 }}>
            <Pop at={said("c-2", 9)}>
              <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 260, lineHeight: 0.95, letterSpacing: "-0.05em", color: C.sky }}>771</div>
            </Pop>
            <KineticLine size={88} color={C.cream} words={[{ text: "resident", at: said("c-2", 10) }, { text: "types", at: said("c-2", 11) }]} />
            <Pop at={said("c-2", 1)} style={{ marginTop: 22 }}>
              <Sub color={C.mute}>rebuilt from Statistics Finland tables — 75 625 Helsinki women aged 50–69</Sub>
            </Pop>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 34 }}>
              {traits.map((c) => (
                <Pop key={c.text} at={c.at}><Chip bg={c.bg} fg={C.ink} size={34}>{c.text}</Chip></Pop>
              ))}
            </div>
          </div>
          <div style={{ position: "absolute", left: 1030, top: 150 }}>
            {TYPES.map((x, i) => (
              <Pop key={x.who} at={said("c-2", 5) + i * 0.45} from="right" style={{ marginBottom: 22 }}>
                <TypeCard {...x} answered={0} />
              </Pop>
            ))}
          </div>
          <Slot at={BUILD + 0.8} out={DEMO} style={{ left: 90, top: 872 }}>
            <Disclosure dark>Four of the 771 types, from the app's own data · one answer is shared by everyone of that type</Disclosure>
          </Slot>
        </AbsoluteFill>
      ) : null}

      {t >= DEMO - 0.2 ? (
        <>
          <BrowserStage
            x={WIN.x}
            y={WIN.y + (1 - enter) * 90}
            width={WIN.w}
            label="Equal Care Finland"
            opacity={enter}
            zoom={track(t, [[DEMO, 1.25], [GROUPS.at - 0.01, 1.25], [GROUPS.at + 0.7, 2.0], [DOT.at - 0.01, 2.0], [DOT.at + 0.8, 1.9]])}
            cx={track(t, [[DEMO, 0.0], [GROUPS.at - 0.01, 0.0], [GROUPS.at + 0.7, 0.2], [DOT.at - 0.01, 0.2], [DOT.at + 0.8, 0.7]])}
            cy={track(t, [[DEMO, 0.5], [GROUPS.at - 0.01, 0.5], [GROUPS.at + 0.7, 0.74], [30, 0.74]])}
          >
            <Footage name="journey" cuts={[ASK, GROUPS, DOT]} />
          </BrowserStage>
          <Slot at={DEMO + 0.2} out={GROUPS.at - 0.05} style={{ right: 1920 - (WIN.x + WIN.w) + 22, top: WIN.y + 62 }}>
            <Chip bg={C.sky} fg={C.ink} size={27}>Gemini Decisions API · one call per type</Chip>
          </Slot>
          <Slot at={GROUPS.at + 0.1} out={DOT.at - 0.05} style={{ right: 1920 - (WIN.x + WIN.w) + 22, top: WIN.y + 62 }}>
            <Chip bg={C.sky} fg={C.ink} size={27}>A probability and a barrier</Chip>
          </Slot>
          <Slot at={DOT.at + 0.1} out={31} style={{ right: 1920 - (WIN.x + WIN.w) + 22, top: WIN.y + 62 }}>
            <Chip bg={C.cream} fg={C.ink} size={27}>The exact question, per resident</Chip>
          </Slot>
          <Slot at={said("c-3", 6) - 0.2} out={GROUPS.at - 0.1} style={{ left: 290, top: 190 }}>
            <Stat value="Will she attend?" label="What stops her?" color={C.sky} note="asked once per resident type" />
          </Slot>
          <Slot at={DEMO + 0.6} out={31} style={{ left: 60, top: 872 }}>
            <Disclosure dark>Simulation · replayed from recorded Gemini Decisions answers · 1 dot ≈ 100 women</Disclosure>
          </Slot>
        </>
      ) : null}

      {t < BUILD + 0.7 ? (
        <AbsoluteFill style={{ opacity: t < BUILD ? 1 : 0 }}>
          <FeatureTitle
            number="01"
            label="The core"
            bg="#0B2A3D"
            fg={C.cream}
            accent={C.sky}
            numberAt={0.4}
            words={[
              { text: "A", at: said("c-1", 3) },
              { text: "simulated", at: said("c-1", 4), br: true },
              { text: "population.", at: said("c-1", 5), italic: true },
            ]}
          />
        </AbsoluteFill>
      ) : null}
      <Wipe at={BUILD} colors={[C.ink, C.sky, C.cream]} />
      <Wipe at={DEMO} colors={[C.ink, C.sky, C.cream]} direction={-1} />
      <Sfx
        cues={[
          { at: 0.4, name: "thud", volume: 0.4 },
          { at: BUILD - 0.4, name: "whoosh-soft", volume: 0.35 },
          { at: said("c-2", 9), name: "pop", volume: 0.4 },
          ...traits.map((c) => ({ at: c.at, name: "tick", volume: 0.3 })),
          { at: DEMO - 0.4, name: "whoosh-soft", volume: 0.35 },
          { at: sceneTimeOf(ASK, E.ask) + 0.3, name: "sparkle", volume: 0.25 },
          { at: sceneTimeOf(DOT, E.dot), name: "mouse-click", volume: 0.5 },
          { at: sceneTimeOf(DOT, E.asked), name: "mouse-click", volume: 0.5 },
        ]}
      />
    </AbsoluteFill>
  );
};

const TABLE: Cut = { at: 8.9, src: [5.2, 12.4], rate: 1.6 }; // registry vs simulated, in the app
const ENG = 12.9;

/** 52–71 s · can you trust it: validation, where it is wrong, and the second engine. */
export const Trust = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const A_OUT = TABLE.at - 0.1;
  const enter = ramp(t, TABLE.at - 0.1, 0.6);
  const leave = ramp(t, ENG - 0.3, 0.4);
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} bloomA="rgba(52,211,153,0.16)" bloomB="rgba(56,189,248,0.14)" drift={t / 19} grain="screen" />
      <div style={{ position: "absolute", left: 120, top: 170, width: 900 }}>
        <KineticLine
          size={140}
          color={C.cream}
          out={A_OUT}
          words={[
            { text: "Can", at: said("t-1", 0) },
            { text: "you", at: said("t-1", 1) },
            { text: "trust", at: said("t-1", 2), br: true, color: C.emerald, italic: true },
            { text: "it?", at: said("t-1", 3), color: C.emerald, italic: true },
          ]}
        />
      </div>
      <Pop at={said("t-2", 9)} out={A_OUT} style={{ position: "absolute", left: 1040, top: 170 }}>
        <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 230, lineHeight: 1, letterSpacing: "-0.04em", color: C.emerald }}>r = 0.84</div>
        <Sub color={C.mute} style={{ marginTop: 14, width: 760 }}>simulated vs real breast-screening attendance, 22 counties, 2024</Sub>
      </Pop>
      <Slot at={said("t-2", 9) + 0.4} out={A_OUT} style={{ left: 120, top: 872 }}>
        <Disclosure dark>Weighted correlation by county · real rates: THL Sotkanet 2024 · the model never saw them</Disclosure>
      </Slot>

      {t >= TABLE.at - 0.2 && t < ENG + 0.2 ? (
        <>
          <BrowserStage x={WIN.x} y={WIN.y + (1 - enter) * 80} width={WIN.w} label="Equal Care Finland" opacity={enter * (1 - leave)} zoom={2.5} cx={0.2} cy={0.86}>
            <Footage name="valid" cuts={[TABLE]} />
          </BrowserStage>
          <Slot at={TABLE.at + 0.3} out={ENG - 0.2} style={{ left: 1196, top: 230 }}>
            <Stat value="60.8 → 48 %" label="registry vs simulated, other languages" color={C.rose} note="the model overstates the gap" />
          </Slot>
          <Slot at={TABLE.at + 0.3} out={ENG - 0.2} style={{ left: 60, top: 872 }}>
            <Disclosure dark>Real recording · Finnish Cancer Registry 2024 group rates next to the simulation</Disclosure>
          </Slot>
        </>
      ) : null}

      {t >= ENG - 0.1 ? (
        <>
          <div style={{ position: "absolute", left: 120, top: 150, width: 1000 }}>
            <KineticLine
              size={110}
              color={C.cream}
              words={[
                { text: "Two", at: said("t-4", 1) - 0.3 },
                { text: "engines,", at: said("t-4", 1) },
                { text: "same", at: said("t-4", 6), br: true },
                { text: "questions.", at: said("t-4", 7) },
              ]}
            />
          </div>
          {[
            { name: "Gemini Decisions", v: "+2 093", c: C.sky, at: said("t-4", 1) },
            { name: "Jev", v: "+992", c: C.violet, at: said("t-4", 3) },
          ].map((e, i) => (
            <Pop key={e.name} at={e.at} from="right" style={{ position: "absolute", left: 1130, top: 150 + i * 300 }}>
              <Stat value={e.v} label={e.name} color={e.c} note="women a year, own-language invitations" />
            </Pop>
          ))}
          <Pop at={said("t-4", 11)} style={{ position: "absolute", left: 120, top: 520 }}>
            <Chip bg={C.emerald} fg={C.ink} size={44}>Effects shown as a range</Chip>
          </Pop>
          <Slot at={ENG + 0.6} out={20} style={{ left: 120, top: 872 }}>
            <Disclosure dark>Simulated upper bounds for Helsinki, from the app · both engines' answers are cached in the repo</Disclosure>
          </Slot>
        </>
      ) : null}
      <Sfx
        cues={[
          { at: said("t-2", 9), name: "thud", volume: 0.45 },
          { at: TABLE.at - 0.3, name: "whoosh-soft", volume: 0.3 },
          { at: ENG - 0.3, name: "swish", volume: 0.3 },
          { at: said("t-4", 1), name: "pop", volume: 0.35 },
          { at: said("t-4", 3), name: "pop", volume: 0.35 },
          { at: said("t-4", 11), name: "chime", volume: 0.3 },
        ]}
      />
    </AbsoluteFill>
  );
};
