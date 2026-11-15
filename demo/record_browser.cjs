// Lossless PNG 30fps CFR recorder for Equal Care Finland using Chrome CDP Screencast -> ffmpeg.
// No synthetic FrameTicker is injected (which caused Chromium screencast adaptive-JPEG text shimmer);
// instead, lossless PNG frames update whenever the UI animates and hold rock-steady (0.000 diff) when still.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const pwPath = [
  path.resolve(__dirname, "../shots-v3/node_modules/playwright-core"),
  path.resolve(__dirname, "../web/node_modules/playwright-core"),
  "playwright-core",
].find((p) => { try { require.resolve(p); return true; } catch { return false; } });
const { chromium } = require(pwPath);

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VP = { width: 1420, height: 920 };
const FPS = 30;
const APP_URL = process.env.DEMO_APP_URL || "http://localhost:3011";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickLoc(page, loc, parkMouse = true) {
  await loc.waitFor({ state: "visible", timeout: 8000 });
  const box = await loc.boundingBox();
  const cx = box ? box.x + box.width / 2 : VP.width / 2;
  const cy = box ? box.y + box.height / 2 : VP.height / 2;
  await loc.click();
  if (parkMouse) await page.mouse.move(8, 8);
  return [+(cx / VP.width).toFixed(4), +(cy / VP.height).toFixed(4)];
}

async function clickResidentDot(page) {
  const xs = [940, 915, 965, 890, 990, 930, 955, 875, 1005];
  const ys = [490, 465, 515, 440, 540, 480, 505];
  for (const y of ys) {
    for (const x of xs) {
      await page.mouse.move(x, y);
      await sleep(30);
      const hit = await page.locator("text=/simulation ·/i").isVisible().catch(() => false);
      if (hit) {
        await page.mouse.click(x, y);
        await page.mouse.move(8, 8);
        return [+(x / VP.width).toFixed(4), +(y / VP.height).toFixed(4)];
      }
    }
  }
  await page.mouse.click(935, 490);
  await page.mouse.move(8, 8);
  return [+(935 / VP.width).toFixed(4), +(490 / VP.height).toFixed(4)];
}

async function sweepMapCounties(page) {
  // Gently sweep across two counties on the Finland map so real Sotkanet tooltips & map interactivity shine,
  // then park cursor cleanly so no tooltip lingers.
  const pts = [[930, 560], [965, 650], [900, 725]];
  for (const [x, y] of pts) {
    await page.mouse.move(x, y, { steps: 8 });
    await sleep(420);
  }
  await page.mouse.move(8, 8);
  return null;
}

async function runAction(page, name) {
  switch (name) {
    case "open_tour":
      return clickLoc(page, page.locator('button[title="Show me around"]'));
    case "tour_next":
      return clickLoc(page, page.getByRole("button", { name: /^Next$/ }));
    case "tour_skip":
      return clickLoc(page, page.getByRole("button", { name: /^Skip$/ }));
    case "sweep_map":
      return sweepMapCounties(page);
    case "click_next":
      return clickLoc(page, page.getByRole("button", { name: /^Next:/ }));
    case "click_ask_residents":
      return clickLoc(page, page.locator('[data-tour="s2-ask"]'));
    case "click_resident_dot":
      return clickResidentDot(page);
    case "click_see_asked":
      return clickLoc(page, page.getByRole("button", { name: /See what .* was asked/i }));
    case "close_popover":
      await page.keyboard.press("Escape");
      await page.mouse.move(8, 8);
      return null;
    case "click_own_language":
      return clickLoc(page, page.locator('[data-tour="s3-chip0"]'));
    case "click_run_sim":
      return clickLoc(page, page.locator('[data-tour="s3-run"]'));
    case "click_satakunta":
      return clickLoc(page, page.getByRole("button", { name: /Satakunta/ }));
    case "click_treatment":
      return clickLoc(page, page.locator('[data-tour="s4-node-treatment"]'));
    case "click_play_queue":
      return clickLoc(page, page.locator('[data-tour="s4-play"]'));
    case "click_generate_report_top":
      return clickLoc(page, page.locator("header").getByRole("link", { name: "Generate report" }));
    case "click_generate_submit":
      return clickLoc(page, page.getByRole("button", { name: /^Generate report$/ }));
    case "click_slides_tab":
      return clickLoc(page, page.getByRole("tab", { name: "Slides" }));
    case "click_slide_where": {
      const btn = page.getByRole("button", { name: "slide 2" });
      if (await btn.isVisible().catch(() => false)) return clickLoc(page, btn);
      await page.keyboard.press("ArrowRight");
      return null;
    }
    case "click_slide_what": {
      const btn = page.getByRole("button", { name: "slide 5" });
      if (await btn.isVisible().catch(() => false)) return clickLoc(page, btn);
      await page.keyboard.press("ArrowRight");
      return null;
    }
    default:
      throw new Error(`Unknown demo action: ${name}`);
  }
}

(async () => {
  const planPath = process.argv[2];
  const outDir = path.dirname(planPath);
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const dstMp4 = path.join(outDir, "screen.mp4");
  fs.rmSync(dstMp4, { force: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"],
  });

  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.setItem("ec_tour_done", "1"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", String(e).slice(0, 240)));

  await page.goto(`${APP_URL}/?tour=0`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Step 1 of 4", { timeout: 20000 });
  await page.mouse.move(8, 8);
  await sleep(3200);

  let latestFrame = await page.screenshot({ type: "png" });
  const cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", (ev) => {
    latestFrame = Buffer.from(ev.data, "base64");
    cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "png",
    maxWidth: VP.width,
    maxHeight: VP.height,
    everyNthFrame: 1,
  });
  await sleep(250);

  const ff = spawn("ffmpeg", [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "png",
    "-framerate", String(FPS),
    "-i", "-",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "14",
    "-pix_fmt", "yuv420p",
    dstMp4,
  ], { stdio: ["pipe", "ignore", "pipe"] });

  let ffErr = "";
  ff.stderr.on("data", (d) => { ffErr += d.toString(); });

  const t0 = performance.now();
  let framesWritten = 0;
  let recording = true;
  let draining = false;

  const pump = () => {
    if (!recording) return;
    if (!draining) {
      const targetFrames = Math.floor(((performance.now() - t0) / 1000) * FPS) + 1;
      while (framesWritten < targetFrames) {
        const ok = ff.stdin.write(latestFrame);
        framesWritten++;
        if (!ok) {
          draining = true;
          ff.stdin.once("drain", () => { draining = false; });
          break;
        }
      }
    }
    setTimeout(pump, 10);
  };
  pump();

  const marks = { record_lead: 0.0, segments: {}, taps: [] };
  await sleep(plan.lead_in * 1000);

  for (const seg of plan.segments) {
    const segStart = performance.now();
    marks.segments[seg.id] = +((segStart - t0) / 1000).toFixed(3);
    for (const [off, actName] of seg.actions) {
      const clamped = Math.min(off, Math.max(0.1, seg.dur - 0.45));
      const waitMs = segStart + clamped * 1000 - performance.now();
      if (waitMs > 0) await sleep(waitMs);
      const clickAt = (performance.now() - t0) / 1000;
      try {
        const pt = await runAction(page, actName);
        if (pt) marks.taps.push({ t: +clickAt.toFixed(3), fx: pt[0], fy: pt[1], action: actName });
      } catch (e) {
        console.error(`[action-err] ${actName}:`, e.message);
      }
    }
    const remMs = segStart + seg.dur * 1000 - performance.now();
    if (remMs > 0) await sleep(remMs);
  }

  await sleep(750);
  recording = false;
  // Flush any remaining target frames before closing stdin
  const finalTarget = Math.floor(((performance.now() - t0) / 1000) * FPS);
  while (framesWritten < finalTarget) {
    ff.stdin.write(latestFrame);
    framesWritten++;
  }
  await cdp.send("Page.stopScreencast").catch(() => {});
  ff.stdin.end();
  const code = await new Promise((res) => ff.on("close", res));
  if (code !== 0) {
    console.error(ffErr.slice(-2000));
    process.exit(1);
  }
  await browser.close();

  fs.writeFileSync(path.join(outDir, "marks.json"), JSON.stringify(marks, null, 2));
  console.log(`Recorded ${dstMp4}: ${framesWritten} frames (${(framesWritten / FPS).toFixed(2)}s), taps: ${marks.taps.length}`);
})();
