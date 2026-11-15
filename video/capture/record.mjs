// Records every piece of real Equal Care Finland footage used in the video.
//   node capture/record.mjs                 → everything
//   PARTS=tour node capture/record.mjs      → the built-in spotlight walkthrough (b-roll)
//   PARTS=journey node capture/record.mjs   → guided steps 1–4 (Helsinki → Satakunta)
//   PARTS=report node capture/record.mjs    → generated briefing + slide deck
// Requires: the API on :8010 and the production web build on :3011 (see README).
import {
  launch, newContext, startRecorder, openStaged,
  sleep, tap, hover, moveTo,
} from "./lib.mjs";

const PARTS = (process.env.PARTS ?? "tour,journey,report").split(",");
const W = 1600, H = 900, SCALE = 1.8; // recorded at 2880×1620
const BG = "#090b10";

const logErrors = (page, tag) =>
  page.on("console", (m) => m.type() === "error" && !/ERR_FAILED|favicon/.test(m.text()) && console.log(`[${tag} console.error]`, m.text().slice(0, 160)));

async function open(route) {
  const browser = await launch();
  const ctx = await newContext(browser, { width: W, height: H, dsf: 1, cursor: "arrow" });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("ec_tour_done", "1"); } catch {}
  });
  const S = await openStaged(ctx, { route, w: W, h: H, scale: SCALE, bg: BG });
  return { ...S, browser };
}

async function wheel(page, dy, ms = 900) {
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(15);
  }
}

/** Click a revealed resident dot: probe for the app's hover tooltip, click, confirm its card opened. */
async function clickDot(page, app) {
  const card = app.getByRole("button", { name: /See what .* was asked/i });
  for (const y of [860, 820, 900, 780, 940, 740]) {
    for (const x of [1900, 1840, 1960, 1780, 2020, 1720, 2080]) {
      await page.mouse.move(x, y, { steps: 4 });
      await sleep(60);
      if (!(await app.getByText(/takes part/i).first().isVisible().catch(() => false))) continue;
      await page.mouse.click(x, y);
      await sleep(450);
      if (await card.isVisible().catch(() => false)) return { x, y };
    }
  }
  return null;
}

/* ───────────── b-roll: the app's own spotlight walkthrough ───────────── */
async function tour() {
  const { page, app, browser } = await open("/?tour=0");
  logErrors(page, "tour");
  await app.getByText(/Step 1 of 4/i).waitFor({ timeout: 30000 });
  await sleep(4500); // basemap tiles + county fit
  const rec = await startRecorder(page, "tour", { quality: 90 });
  rec.mark("home");
  await moveTo(page, 2000, 700, 600);
  await sleep(2200);
  await tap(page, app.locator('button[title="Show me around"]'), { ms: 800 });
  rec.mark("tour-open");
  await sleep(2600);
  const next = app.getByRole("button", { name: "Next", exact: true });
  for (const label of ["tour-map", "tour-steps", "tour-programme", "tour-ranking"]) {
    await tap(page, next, { ms: 500 });
    rec.mark(label);
    await sleep(2600);
  }
  await rec.stop();
  await browser.close();
}

/* ───────────── the guided journey: steps 1–4 ───────────── */
async function journey() {
  const { page, app, browser } = await open("/?tour=0");
  logErrors(page, "journey");
  await app.getByText(/Step 1 of 4/i).waitFor({ timeout: 30000 });
  await sleep(4500);
  const rec = await startRecorder(page, "journey", { quality: 90 });

  // 1 · where is the gap
  rec.mark("s1");
  await moveTo(page, 2100, 600, 500);
  await sleep(1800);
  await hover(page, app.locator('[data-tour="ranking"] button').nth(1), { ms: 700 });
  await sleep(700);
  await hover(page, app.locator('[data-tour="ranking"] button').nth(0), { ms: 500 });
  rec.mark("s1-row");
  await sleep(1400);
  // real Sotkanet tooltips on the map
  for (const [x, y] of [[2010, 1010], [2060, 1180], [1930, 1330]]) {
    await moveTo(page, x, y, 700);
    await sleep(800);
  }
  rec.mark("s1-map");
  await sleep(600);

  // 2 · why — data split, then simulated residents
  await tap(page, app.getByRole("button", { name: /^Next:/ }), { ms: 700 });
  rec.mark("s2");
  await hover(page, app.locator('[data-tour="s2-split"]'), { ms: 700 });
  await sleep(3200);
  await tap(page, app.locator('[data-tour="s2-ask"]'), { ms: 600, pre: 300 });
  rec.mark("ask");
  await moveTo(page, 2500, 1450, 500);
  await app.locator('[data-tour="s2-groups"]').waitFor({ timeout: 30000 });
  rec.mark("groups");
  await sleep(3200);
  const dot = await clickDot(page, app);
  if (dot) {
    rec.mark("dot");
    await sleep(1300);
    await tap(page, app.getByRole("button", { name: /See what .* was asked/i }), { ms: 500 });
    rec.mark("asked");
    await sleep(3400);
    await page.keyboard.press("Escape");
    await sleep(500);
  } else console.log("  !! no resident dot found");
  rec.mark("s2-end");

  // 3 · what would help
  await tap(page, app.getByRole("button", { name: /^Next:/ }), { ms: 700 });
  rec.mark("s3");
  await sleep(1300);
  await tap(page, app.locator('[data-tour="s3-chip0"]'), { ms: 600 });
  rec.mark("pick");
  await sleep(900);
  await tap(page, app.locator('[data-tour="s3-run"]'), { ms: 500, pre: 250 });
  rec.mark("run");
  await moveTo(page, 2500, 1450, 500);
  await app.locator('[data-tour="s3-result"]').waitFor({ timeout: 40000 });
  rec.mark("result");
  await sleep(3200);
  await hover(page, app.locator('[data-tour="s3-result"] a.tag-roadmap').first(), { ms: 700 });
  rec.mark("roadmap");
  await sleep(2600);

  // 4 · the rest of the pathway (Goal 3)
  await tap(page, app.getByRole("button", { name: /^Next:/ }), { ms: 700 });
  rec.mark("s4");
  await moveTo(page, 2300, 500, 500);
  await sleep(4200);
  await hover(page, app.locator('[data-tour="s4-focus"]'), { ms: 600 });
  rec.mark("focus");
  await sleep(1800);
  await tap(page, app.getByRole("button", { name: /Satakunta/ }), { ms: 700 });
  rec.mark("satakunta");
  await sleep(2000);
  await tap(page, app.locator('[data-tour="s4-node-treatment"]'), { ms: 600 });
  rec.mark("treatment");
  await sleep(2400);
  await tap(page, app.locator('[data-tour="s4-play"]'), { ms: 600 });
  rec.mark("play");
  await moveTo(page, 2400, 600, 500);
  await sleep(12500);
  rec.mark("played");
  await hover(page, app.locator('[data-tour="s4-hero"]'), { ms: 600 });
  await sleep(2200);
  await rec.stop();
  await browser.close();
}

/* ───────────── generated briefing + slide deck ───────────── */
async function report() {
  const { page, app, browser } = await open("/report?items=breast:06,breast:90:own_language");
  logErrors(page, "report");
  const gen = app.getByRole("button", { name: /^Generate report$/ });
  await gen.waitFor({ timeout: 30000 });
  await sleep(1500);
  const rec = await startRecorder(page, "report", { quality: 90 });
  rec.mark("picker");
  await moveTo(page, 1700, 700, 500);
  await sleep(1500);
  await tap(page, gen, { ms: 700 });
  rec.mark("generate");
  await app.getByRole("tab", { name: "Slides" }).waitFor({ timeout: 120000 });
  rec.mark("ready");
  await sleep(2600);
  await moveTo(page, 1440, 900, 400);
  await wheel(page, 900, 1400);
  rec.mark("briefing");
  await sleep(2200);
  await wheel(page, -900, 600);
  await sleep(500);
  await tap(page, app.getByRole("tab", { name: "Slides" }), { ms: 600 });
  rec.mark("slide:title");
  await moveTo(page, 2700, 1500, 400);
  await sleep(3000);
  for (const kind of ["where", "why", "who", "what", "pathway"]) {
    await page.keyboard.press("ArrowRight");
    rec.mark(`slide:${kind}`);
    await sleep(3000);
  }
  await rec.stop();
  await browser.close();
}

/* ───────────── validation: registry vs simulated, per group ───────────── */
async function valid() {
  const { page, app, browser } = await open("/?tour=0");
  await app.getByText(/Step 1 of 4/i).waitFor({ timeout: 30000 });
  await sleep(3500);
  await tap(page, app.getByRole("button", { name: /^Next:/ }), { ms: 400 });
  await tap(page, app.locator('[data-tour="s2-ask"]'), { ms: 400 });
  await sleep(1200);
  await app.getByRole("button", { name: "Skip", exact: true }).click();
  await app.locator('[data-tour="s2-groups"]').waitFor({ timeout: 30000 });
  await sleep(2500);
  const rec = await startRecorder(page, "valid", { quality: 90 });
  rec.mark("groups");
  await sleep(1200);
  await tap(page, app.getByText(/How this was computed/), { ms: 700 });
  rec.mark("open");
  await sleep(900);
  await hover(page, app.getByText(/Registry 2024 vs simulated/), { ms: 700 });
  rec.mark("table");
  await sleep(1500);
  await hover(page, app.getByText(/another or missing native language/), { ms: 700 });
  rec.mark("lang-row");
  await sleep(4000);
  await rec.stop();
  await browser.close();
}

if (PARTS.includes("valid")) await valid();
if (PARTS.includes("tour")) await tour();
if (PARTS.includes("journey")) await journey();
if (PARTS.includes("report")) await report();
console.log("done");
