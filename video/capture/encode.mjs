// Encodes capture/raw/<name> screencast frames → public/footage/<name>.mp4
// (constant 30 fps, timing rebuilt from the frame timestamps) and writes
// src/footage/meta.json with durations + the named moments marked while recording.
import { execFileSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import fs from "node:fs";
import path from "node:path";
import { ROOT, RAW } from "./lib.mjs";

const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(RAW).filter((d) => fs.existsSync(path.join(RAW, d, "meta.json")));
const outDir = path.join(ROOT, "public", "footage");
fs.mkdirSync(outDir, { recursive: true });
const metaPath = path.join(ROOT, "src", "footage", "meta.json");
fs.mkdirSync(path.dirname(metaPath), { recursive: true });
const all = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};

for (const name of names) {
  const dir = path.join(RAW, name);
  const m = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const lines = ["ffconcat version 1.0"];
  m.frames.forEach((f, i) => {
    const start = i === 0 ? m.t0 : f.t;
    const end = i + 1 < m.frames.length ? m.frames[i + 1].t : Math.max(m.tEnd, f.t + 1 / 30);
    lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, end - start).toFixed(4)}`);
  });
  lines.push(`file '${m.frames.at(-1).file}'`);
  fs.writeFileSync(path.join(dir, "list.ffconcat"), lines.join("\n"));
  const out = path.join(outDir, `${name}.mp4`);
  console.log(`encoding ${name} (${m.frames.length} frames, ${m.duration}s, ${m.width}x${m.height})`);
  execFileSync(
    ffmpeg,
    [
      "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.ffconcat",
      "-vf", "fps=30,scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-g", "15", "-bf", "2",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
      "-movflags", "+faststart", "-an", out,
    ],
    { cwd: dir, stdio: "inherit" }
  );
  all[name] = {
    file: `footage/${name}.mp4`,
    width: m.width, height: m.height, duration: m.duration, t0: m.t0,
    viewport: m.viewport,
    events: Object.fromEntries(m.events.map((e) => [e.label, e.t])),
  };
  fs.writeFileSync(metaPath, JSON.stringify(all, null, 2));
  console.log(`  → ${path.relative(ROOT, out)} ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}
