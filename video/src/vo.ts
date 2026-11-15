import vo from "./data/vo.json";
import words from "./data/words.json";
import { SECTION } from "./theme";

type Id = keyof typeof words;
/** Scene-local second at which word `i` of narration line `id` is spoken. */
export const said = (id: Id, i: number) => {
  const line = vo.lines.find((l) => l.id === id)!;
  const sec = SECTION[line.section as keyof typeof SECTION];
  return line.start - sec.from + words[id][Math.min(i, words[id].length - 1)].start;
};
/** Scene-local second at which line `id` ends. */
export const lineEnd = (id: Id) => {
  const line = vo.lines.find((l) => l.id === id)!;
  return line.start + line.duration - SECTION[line.section as keyof typeof SECTION].from;
};
