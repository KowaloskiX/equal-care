import type { Caption } from "@remotion/captions";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import captionsJson from "../data/captions.json";
import { C, FONT } from "../theme";

const MAX_CHARS = 46;

type Page = { readonly startMs: number; readonly endMs: number; readonly words: readonly Caption[] };

/**
 * Word-level captions → single-line pages. Each sentence is split into the
 * fewest pages that fit, balanced in length, breaking at punctuation when one
 * is close to the ideal split point (so no page is left with a lone word).
 */
const paginate = (captions: readonly Caption[]): Page[] => {
  const pages: Page[] = [];
  const push = (words: Caption[]) => {
    if (words.length) pages.push({ startMs: words[0].startMs, endMs: words[words.length - 1].endMs, words });
  };
  let sentence: Caption[] = [];
  const flushSentence = () => {
    const total = sentence.reduce((n, w) => n + w.text.length, 0);
    const count = Math.ceil(total / MAX_CHARS);
    let rest = sentence;
    for (let k = count; k > 1; k--) {
      const restLen = rest.reduce((n, w) => n + w.text.length, 0);
      const target = restLen / k;
      let best = 1;
      let bestScore = Infinity;
      let len = 0;
      for (let i = 0; i < rest.length - 1; i++) {
        len += rest[i].text.length;
        if (len > MAX_CHARS) break;
        const punct = /[,:;—?.!]$/.test(rest[i].text.trim()) ? -7 : 0;
        const score = Math.abs(len - target) + punct;
        if (score < bestScore) {
          bestScore = score;
          best = i + 1;
        }
      }
      push(rest.slice(0, best));
      rest = rest.slice(best);
    }
    push(rest);
    sentence = [];
  };
  for (const c of captions) {
    sentence.push(c);
    if (c.pageBreakAfter) flushSentence();
  }
  flushSentence();
  return pages;
};

const PAGES = paginate(captionsJson as Caption[]);

/** Burned-in subtitles, synchronised to the narration word by word. */
export const Subtitles = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const idx = PAGES.findIndex((p, i) => {
    const next = PAGES[i + 1];
    const hold = Math.min(p.endMs + 450, next ? next.startMs : Infinity);
    return ms >= p.startMs - 80 && ms < hold;
  });
  if (idx < 0) return null;
  const page = PAGES[idx];
  const appear = Math.min(1, Math.max(0, (ms - (page.startMs - 80)) / 140));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 38 }}>
      <div
        style={{
          padding: "13px 30px 15px",
          borderRadius: 20,
          backgroundColor: "rgba(9,11,16,0.92)",
          boxShadow: "0 12px 40px -12px rgba(0,0,0,0.5)",
          fontFamily: FONT.sans,
          fontWeight: 700,
          fontSize: 40,
          lineHeight: 1.2,
          letterSpacing: "-0.012em",
          whiteSpace: "pre",
          opacity: appear,
          translate: `0px ${(1 - appear) * 10}px`,
        }}
      >
        {page.words.map((w, i) => {
          const active = ms >= w.startMs && ms < w.endMs;
          const spoken = ms >= w.endMs;
          return (
            <span key={i} style={{ color: active ? C.solar : spoken ? C.cream : "rgba(253,248,238,0.5)" }}>
              {i === 0 ? w.text.trimStart() : w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
