import { Composition } from "remotion";
import { Main } from "./Main";
import { Core, Trust } from "./scenes/Core";
import { Feature2, Feature3 } from "./scenes/Features";
import { Hook, Solution } from "./scenes/Intro";
import { Difference, Ending } from "./scenes/Outro";
import { FPS, HEIGHT, SECTION, TOTAL_SECONDS, WIDTH } from "./theme";

const scenes = { Hook, Solution, Core, Trust, Feature2, Feature3, Difference, Ending };
const keys = { Hook: "hook", Solution: "solution", Core: "core", Trust: "trust", Feature2: "feature2", Feature3: "feature3", Difference: "difference", Ending: "ending" } as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Demo" component={Main} durationInFrames={TOTAL_SECONDS * FPS} fps={FPS} width={WIDTH} height={HEIGHT} />
    {(Object.keys(scenes) as (keyof typeof scenes)[]).map((id) => {
      const s = SECTION[keys[id]];
      return <Composition key={id} id={id} component={scenes[id]} durationInFrames={Math.round((s.to - s.from) * FPS)} fps={FPS} width={WIDTH} height={HEIGHT} />;
    })}
  </>
);
