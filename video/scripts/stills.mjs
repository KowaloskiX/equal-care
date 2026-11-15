// dev helper: render frames at given seconds and build contact sheets
//   node scripts/stills.mjs <label> 2.5 3.6 5.8 ...      (COMP=<composition id>, default "Demo")
import { execFileSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import fs from "node:fs";
const [label, ...secs] = process.argv.slice(2);
const frames = secs.map((s) => Math.round(+s * 30));
const dir = `out/stills/${label}`;
fs.rmSync(dir, { recursive: true, force: true });
execFileSync("npx", ["remotion", "render", process.env.COMP ?? "Demo", dir, `--frames=${frames.join(",")}`, "--image-format=jpeg", "--jpeg-quality=90", "--is-production=false", "--log=error", "--concurrency=6"], { stdio: "inherit" });
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpeg") || f.endsWith(".jpg")).sort();
const per = 6;
for (let i = 0; i < files.length; i += per) {
  const chunk = files.slice(i, i + per);
  const args = ["-y", "-loglevel", "error"];
  chunk.forEach((f) => args.push("-i", `${dir}/${f}`));
  const cols = 2;
  const filt = chunk.map((_, k) => `[${k}]scale=960:540[s${k}]`).join(";") + ";" + chunk.map((_, k) => `[s${k}]`).join("") +
    (chunk.length > 1 ? `xstack=inputs=${chunk.length}:layout=${chunk.map((_, k) => `${(k % cols) * 960}_${Math.floor(k / cols) * 540}`).join("|")}:fill=black` : "copy");
  args.push("-filter_complex", filt, "-q:v", "3", `${dir}/sheet-${String(i / per + 1).padStart(2, "0")}.jpg`);
  execFileSync(ffmpeg, args);
}
console.log(files.join(" "));
