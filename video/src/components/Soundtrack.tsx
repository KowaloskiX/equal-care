import { Audio } from "@remotion/media";
import { staticFile, Track, useVideoConfig } from "remotion";
import vo from "../data/vo.json";

/** Original score, pre-ducked under the narration by tts/clean.py (smooth per-sample envelope). */
export const Music = () => <Audio name="Score (original, ducked)" src={staticFile("music/theme-ducked.wav")} volume={1.15} />;

/** Narration — one clip per sentence, placed by src/data/vo-placement.json. */
export const Narration = () => {
  const { fps } = useVideoConfig();
  return (
    <Track name="Narration">
      {vo.lines.map((l) => (
        <Audio key={l.id} name={l.text} from={Math.round(l.start * fps)} src={staticFile(`vo/${l.id}.wav`)} volume={0.95} />
      ))}
    </Track>
  );
};

export type SfxCue = { readonly at: number; readonly name: string; readonly volume?: number };

/** Sound effects for one scene; `at` is scene-local seconds. */
export const Sfx = ({ cues }: { readonly cues: readonly SfxCue[] }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cues.map((c, i) => (
        <Audio
          key={`${c.name}-${i}`}
          name={`sfx · ${c.name}`}
          from={Math.max(0, Math.round(c.at * fps))}
          src={staticFile(`sfx/${c.name}.wav`)}
          volume={(c.volume ?? 0.5) * 0.9}
        />
      ))}
    </>
  );
};
