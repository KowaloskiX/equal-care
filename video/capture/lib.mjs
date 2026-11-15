// Shared Playwright helpers for recording real footage of a running web app.
// Frames come from the CDP screencast (JPEG, device-pixel resolution) with
// wall-clock timestamps, and are later encoded to constant-30fps H.264.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RAW = path.join(ROOT, "capture", "raw");
export const BASE = process.env.APP_BASE ?? "http://localhost:3100";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ micWav } = {}) {
  const args = [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
  ];
  if (micWav) args.push(`--use-file-for-fake-audio-capture=${micWav}%noloop`);
  return chromium.launch({ channel: "chromium", headless: true, args });
}

/** A browser context that never leaks the host's real location or IP city. */
export async function newContext(browser, { width, height, dsf, cursor }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dsf,
    locale: "en-GB",
    timezoneId: "Europe/Helsinki",
    permissions: ["microphone"],
    colorScheme: "light",
  });
  // Block anything that would leak the recording machine (IP geolocation,
  // analytics…). Extend this pattern for the app you are recording.
  await ctx.route(/ipapi\.co|ipwho\.is|ipinfo\.io/, (r) => r.abort());
  await ctx.addInitScript(cursorScript, cursor ?? "arrow");
  return ctx;
}

/** Injected into every frame: a visible cursor / touch dot + click ripple. */
function cursorScript(kind) {
  if (window.__demoCursor) return;
  window.__demoCursor = true;
  const make = () => {
    if (!document.documentElement) return;
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    const base =
      "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;opacity:0;will-change:transform;";
    if (kind === "touch") {
      c.style.cssText =
        base +
        "width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;" +
        "background:rgba(28,25,23,.28);border:2.5px solid rgba(255,255,255,.95);" +
        "box-shadow:0 2px 10px rgba(0,0,0,.28);transition:opacity .25s, scale .12s;";
    } else {
      c.style.cssText = base + "width:26px;height:26px;transition:opacity .2s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));";
      c.innerHTML =
        '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5l15.2 9.2-6.7 1.5 4 7.3-2.9 1.6-4-7.4-5.2 4.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    }
    const ring = document.createElement("div");
    ring.style.cssText =
      "position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;width:56px;height:56px;margin:-28px 0 0 -28px;" +
      "border-radius:50%;border:3px solid rgba(255,107,43,.95);opacity:0;";
    const mount = () => {
      (document.body ?? document.documentElement).append(ring, c);
    };
    mount();
    let x = -100, y = -100;
    const place = () => {
      c.style.transform = `translate(${x}px,${y}px)`;
    };
    window.addEventListener(
      "mousemove",
      (e) => {
        x = e.clientX; y = e.clientY;
        c.style.opacity = "1";
        if (!c.isConnected) mount();
        place();
        if (kind === "touch") {
          clearTimeout(window.__demoIdle);
          window.__demoIdle = setTimeout(() => (c.style.opacity = "0"), 1100);
        }
      },
      true
    );
    document.addEventListener("mouseleave", () => (c.style.opacity = "0"), true);
    window.addEventListener(
      "mousedown",
      () => {
        if (kind === "touch") c.style.scale = "0.72";
        ring.style.transform = `translate(${x}px,${y}px)`;
        ring.animate(
          [
            { opacity: 0.95, scale: 0.35 },
            { opacity: 0, scale: 1.25 },
          ],
          { duration: 520, easing: "cubic-bezier(.2,.7,.2,1)" }
        );
      },
      true
    );
    window.addEventListener("mouseup", () => { if (kind === "touch") c.style.scale = "1"; }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", make);
  else make();
}

function jpegSize(buf) {
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) break;
    if (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/**
 * New-headless Chromium windows sometimes carry ~87px of (invisible) browser
 * chrome, which crops the bottom of the screencast. Probe one frame and grow
 * the OS window until the captured surface is exactly the emulated viewport.
 */
async function fitSurface(page, cdp, W, H) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const frame = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no screencast frame")), 8000);
      const on = ({ data, sessionId }) => {
        clearTimeout(timer);
        cdp.off("Page.screencastFrame", on);
        cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
        resolve(Buffer.from(data, "base64"));
      };
      cdp.on("Page.screencastFrame", on);
      cdp.send("Page.startScreencast", { format: "jpeg", quality: 20, everyNthFrame: 1 });
      // nudge a repaint so a frame is always produced
      page.evaluate(() => {
        const d = document.createElement("div");
        d.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01";
        document.body.append(d);
        setTimeout(() => d.remove(), 120);
      }).catch(() => {});
    });
    await cdp.send("Page.stopScreencast").catch(() => {});
    const size = jpegSize(frame);
    if (size && size.w === W && size.h === H) return;
    const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { width: bounds.width + (W - (size?.w ?? W)), height: bounds.height + (H - (size?.h ?? H)) },
    });
    await sleep(400);
  }
  throw new Error(`could not fit the screencast surface to ${W}x${H}`);
}

/** Screencast recorder → capture/raw/<name>/{f000001.jpg…, frames.json, events.json} */
export async function startRecorder(page, name, { quality = 92 } = {}) {
  const dir = path.join(RAW, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize();
  const dsf = await page.evaluate(() => window.devicePixelRatio);
  const frames = [];
  const events = [];
  let n = 0;
  let writes = Promise.resolve();
  await fitSurface(page, cdp, Math.round(vp.width * dsf), Math.round(vp.height * dsf));
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    const file = `f${String(++n).padStart(6, "0")}.jpg`;
    frames.push({ file, t: metadata.timestamp });
    const buf = Buffer.from(data, "base64");
    writes = writes.then(() => fs.promises.writeFile(path.join(dir, file), buf));
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality,
    maxWidth: Math.round(vp.width * dsf),
    maxHeight: Math.round(vp.height * dsf),
    everyNthFrame: 2,
  });
  const t0 = Date.now() / 1000;
  return {
    name,
    dir,
    /** mark a named moment (seconds since recording start) for the edit */
    mark(label) {
      const t = Date.now() / 1000 - t0;
      events.push({ label, t: +t.toFixed(3) });
      console.log(`  [${name}] ${t.toFixed(2)}s  ${label}`);
    },
    async stop() {
      const tEnd = Date.now() / 1000;
      await cdp.send("Page.stopScreencast").catch(() => {});
      await writes;
      const meta = {
        name, t0, tEnd, duration: +(tEnd - t0).toFixed(3),
        width: Math.round(vp.width * dsf), height: Math.round(vp.height * dsf),
        viewport: vp, dsf, frames, events,
      };
      // guard: the screencast must cover the whole viewport (see record.mjs note)
      const sz = jpegSize(fs.readFileSync(path.join(dir, frames.at(-1).file)));
      if (!sz || sz.w !== meta.width || sz.h !== meta.height)
        throw new Error(`[${name}] screencast is ${sz?.w}x${sz?.h}, expected ${meta.width}x${meta.height}`);
      fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 1));
      console.log(`  [${name}] stopped: ${frames.length} frames in ${meta.duration}s`);
      return meta;
    },
  };
}

/* ── humanised pointer ─────────────────────────────────────────────── */
const pos = new WeakMap();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function moveTo(page, x, y, ms = 520) {
  const from = pos.get(page) ?? { x: x - 60, y: y + 90 };
  const steps = Math.max(6, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    await sleep(15);
  }
  pos.set(page, { x, y });
}

/** centre of a locator in top-level page coordinates (works inside iframes) */
export async function centerOf(locator, { dx = 0, dy = 0 } = {}) {
  await locator.waitFor({ state: "visible", timeout: 15000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const b = await locator.boundingBox();
  if (!b) throw new Error("no bounding box");
  return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
}

export async function hover(page, locator, opts = {}) {
  const p = await centerOf(locator, opts);
  await moveTo(page, p.x, p.y, opts.ms ?? 520);
  return p;
}

export async function tap(page, locator, opts = {}) {
  await hover(page, locator, opts);
  await sleep(opts.pre ?? 140);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  await sleep(opts.post ?? 250);
}

export async function typeSlow(page, text, delay = 28) {
  await page.keyboard.type(text, { delay });
}

/**
 * Open an app route inside a same-origin "stage" page: the app runs in an
 * iframe with a true `w × h` CSS viewport (so its responsive layout is the
 * real one) and is scaled up by `scale`, so the screencast records crisp
 * `w*scale × h*scale` pixels. Returns the host page + the app frame locator.
 */
export async function openStaged(ctx, { route, w, h, scale, bg = "#000" }) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: Math.round(w * scale), height: Math.round(h * scale) });
  await page.route(`${BASE}/__stage`, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;height:100%;overflow:hidden;background:${bg}}
        iframe{border:0;width:${w}px;height:${h}px;transform:scale(${scale});transform-origin:0 0;display:block}
      </style></head><body><iframe id="app" src="${route}" allow="microphone; camera; autoplay"></iframe></body></html>`,
    })
  );
  await page.goto(`${BASE}/__stage`, { waitUntil: "domcontentloaded" });
  const app = page.frameLocator("#app");
  const frame = page.frame({ url: (u) => u.pathname.startsWith(route.split("?")[0]) }) ?? page.frames()[1];
  return { page, app, frame };
}
