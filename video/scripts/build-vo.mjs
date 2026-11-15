// Merges the narration script, clip durations, Whisper word timings and the
// placement of each line on the 120 s timeline into:
//   src/data/vo.json        – lines with absolute start / duration (drives <Audio> + ducking)
//   src/data/captions.json  – word-level captions in @remotion/captions `Caption` format
//   VOICEOVER.md            – the human-readable voiceover script with timecodes
import fs from "node:fs";
const script = JSON.parse(fs.readFileSync("tts/script.json", "utf8"));
const durations = JSON.parse(fs.readFileSync("tts/manifest.json", "utf8"));
const whisper = JSON.parse(fs.readFileSync("tts/words.json", "utf8"));
const place = JSON.parse(fs.readFileSync("src/data/vo-placement.json", "utf8"));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const lines = [];
const captions = [];
let prevEnd = -1;
for (const l of script.lines) {
  const start = place[l.id];
  const dur = durations[l.id];
  if (start == null) throw new Error(`no placement for ${l.id}`);
  if (start < prevEnd + 0.05) throw new Error(`${l.id} overlaps the previous line (${start} < ${prevEnd.toFixed(2)})`);
  prevEnd = start + dur;
  // map the display text onto Whisper's timing by cumulative character position
  const ww = whisper[l.id];
  const marks = []; // [charOffset, time]
  let acc = 0;
  for (const w of ww) {
    marks.push([acc, w.start]);
    acc += Math.max(1, norm(w.word).length);
  }
  marks.push([acc, ww.at(-1).end]);
  const total = acc;
  const timeAt = (c) => {
    for (let i = 1; i < marks.length; i++)
      if (c <= marks[i][0]) {
        const [c0, t0] = marks[i - 1], [c1, t1] = marks[i];
        return t0 + ((c - c0) / Math.max(1, c1 - c0)) * (t1 - t0);
      }
    return marks.at(-1)[1];
  };
  const tokens = l.text.split(/\s+/).filter((t) => norm(t).length > 0 || /\S/.test(t));
  // glue stand-alone dashes to the previous token
  const words = [];
  for (const t of tokens) {
    if (!norm(t) && words.length) words[words.length - 1] += " " + t;
    else words.push(t);
  }
  const lens = words.map((w) => Math.max(1, norm(w).length));
  const sum = lens.reduce((a, b) => a + b, 0);
  let c = 0;
  words.forEach((w, i) => {
    const a = timeAt((c / sum) * total);
    c += lens[i];
    const b = timeAt((c / sum) * total);
    captions.push({
      text: (i === 0 ? "" : " ") + w,
      startMs: Math.round((start + a) * 1000),
      endMs: Math.round((start + b) * 1000),
      timestampMs: Math.round((start + (a + b) / 2) * 1000),
      confidence: null,
      ...(i === words.length - 1 ? { pageBreakAfter: true } : {}),
    });
  });
  lines.push({ id: l.id, section: l.section, text: l.text, start, duration: dur });
}
fs.writeFileSync("src/data/vo.json", JSON.stringify({ lines }, null, 2));
fs.writeFileSync("src/data/captions.json", JSON.stringify(captions, null, 1));

const tc = (s) => `${String(Math.floor(s / 60)).padStart(1, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
// optional: "sections": { "<section id>": "0:00–0:12 · Hook & problem", ... } in tts/script.json
const titles = script.sections ?? {};
let md = `# ${script.title ?? "Pitch video"} · voiceover script\n\nVoice: Gemini TTS \`gemini-3.8-flash-tts\`, voice \`${script.voice}\`; word timings from Whisper (small.en). ` +
  `${script.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0)} words, ${lines.reduce((a, l) => a + l.duration, 0).toFixed(1)} s of speech.\n` +
  `Timecodes are the start of each line in the final cut.\n`;
let sec = "";
for (const l of lines) {
  if (l.section !== sec) { sec = l.section; md += `\n## ${titles[sec] ?? sec}\n\n`; }
  md += `- \`${tc(l.start)}\` ${l.text}\n`;
}
fs.writeFileSync("VOICEOVER.md", md);
console.log(`vo.json: ${lines.length} lines · captions.json: ${captions.length} words · last line ends ${prevEnd.toFixed(2)}s`);
