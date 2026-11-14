"use client";
// Finland by wellbeing services county, coloured by the selected indicator. Click a county to select it; its
// municipalities are drawn on top when the indicator exists at municipality level.
import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { FlyToInterpolator, Layer, WebMercatorViewport, type PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");   // Turbopack does not bundle MapLibre's module worker (see postinstall)
import { fmt, getResidentAnswer, type FC, type Feature, type ResidentAnswer, type Values } from "@/lib/api";
import type { Crowd, CrowdDot } from "@/lib/dots";
import { Asked } from "@/components/SimReplay";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
// centre shifted west so Finland sits in the map area visible right of the 456 px story column
const HOME = { longitude: 17.5, latitude: 64.6, zoom: 4.35, pitch: 0, bearing: 0 };
type ViewState = typeof HOME & { transitionDuration?: number; transitionInterpolator?: FlyToInterpolator };
type RGB = [number, number, number];
const BAD: RGB = [232, 93, 74], MID: RGB = [70, 76, 92], GOOD: RGB = [72, 196, 160], NEUTRAL: RGB = [120, 150, 220];
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((x, i) => Math.round(x + (b[i] - x) * t)) as RGB;

// colour: distance from the national value, scaled by the spread across regions. Red = worse than Finland.
export function colorFor(v: number | undefined, vals: Values | null): [number, number, number, number] {
  if (v == null || !vals) return [40, 42, 52, 120];
  const xs = Object.values(vals.values).map((x) => x.value);
  const ref = vals.national ?? xs.reduce((a, b) => a + b, 0) / xs.length;
  const spread = Math.max(...xs.map((x) => Math.abs(x - ref))) || 1;
  const t = Math.max(-1, Math.min(1, (v - ref) / spread));
  if (vals.higher_is_better == null) return [...mix(MID, NEUTRAL, (t + 1) / 2), 215];
  const good = vals.higher_is_better ? t : -t;
  return [...(good >= 0 ? mix(MID, GOOD, good) : mix(MID, BAD, -good)), 225];
}

const coords = (f: Feature): number[][] => {
  if (f.geometry.type === "Polygon") return f.geometry.coordinates.flat(1);
  if (f.geometry.type === "MultiPolygon") return f.geometry.coordinates.flat(2);
  return [];   // GeometryCollection or other types do not occur in the boundary files
};

export default function ChoroplethMap(props: {
  counties: FC | null; municipalities: FC | null; county: Values | null; muni: Values | null;
  selected: string | null; onSelect: (code: string | null) => void;
  live?: { code: string; value: number } | null;   // running simulated rate for one county (replay animation)
  crowd?: Crowd | null;                            // simulated residents as dots (replay)
}) {
  const { counties, municipalities, county, muni, selected, onSelect, live, crowd } = props;
  const [view, setView] = useState<ViewState>(HOME);
  const wrap = useRef<HTMLDivElement>(null);
  const wasFocus = useRef(false);
  // The crowd outlives `live` (cleared on every step change), so driving the camera off the
  // crowd keeps the county framed through the whole step 2 -> step 3 run, incl. fetch waits.
  const focusCode = live?.code ?? crowd?.code ?? null;

  // "the map comes alive": while a replay crowd exists, the camera fits that county inside the
  // free area right of the 440 px story column; when the crowd clears, back to all of Finland.
  useEffect(() => {
    const t = setTimeout(() => {
      if (focusCode == null) {
        if (wasFocus.current)
          setView({ ...HOME, transitionDuration: 800, transitionInterpolator: new FlyToInterpolator() });
        wasFocus.current = false;
        return;
      }
      wasFocus.current = true;
      const el = wrap.current;
      const f = counties?.features.find((x) => x.properties.code === focusCode);
      if (!el || !f) return;
      const pts = coords(f);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const vp = new WebMercatorViewport({ width: el.clientWidth, height: el.clientHeight });
      const fit = vp.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
                               { padding: { left: 480, top: 84, right: 48, bottom: 96 }, maxZoom: 6.4 });
      setView({ longitude: fit.longitude, latitude: fit.latitude, zoom: fit.zoom, pitch: 0, bearing: 0,
                transitionDuration: 900, transitionInterpolator: new FlyToInterpolator() });
    }, 0);
    return () => clearTimeout(t);
  }, [focusCode, counties]);
  const [hover, setHover] = useState<{ x: number; y: number; name: string; value: string; n?: string; src?: string } | null>(null);
  const [pick, setPick] = useState<{ x: number; y: number; d: CrowdDot } | null>(null);
  const [ans, setAns] = useState<ResidentAnswer | null>(null);
  const muniName = useMemo(() => {
    const m = new globalThis.Map<string, string>();   // "Map" is the react-map-gl component here
    for (const f of municipalities?.features ?? []) m.set(f.properties.code, f.properties.name);
    return m;
  }, [municipalities]);
  useEffect(() => {   // Esc closes the dot card
    if (!pick) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setPick(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [pick]);
  useEffect(() => {   // a new county's crowd closes the open dot card (async — lint forbids sync setState in effects)
    const t = setTimeout(() => { setPick(null); setAns(null); }, 0);
    return () => clearTimeout(t);
  }, [crowd?.prog, crowd?.code]);

  const muniFeatures = useMemo(() => {
    if (!municipalities || !muni) return null;
    return { ...municipalities, features: municipalities.features.filter((f) => muni.values[f.properties.code]) };
  }, [municipalities, muni]);

  const fly = (f: Feature | null) => {
    if (!f) return setView({ ...HOME, transitionDuration: 700, transitionInterpolator: new FlyToInterpolator() });
    const pts = coords(f);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const lon = (Math.min(...xs) + Math.max(...xs)) / 2, lat = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * 2);
    setView({ longitude: lon, latitude: lat, zoom: Math.min(8.5, Math.log2(360 / span) - 0.3), pitch: 0, bearing: 0,
      transitionDuration: 800, transitionInterpolator: new FlyToInterpolator() });
  };

  const tip = (vals: Values | null) => (info: PickingInfo) => {
    const f = info.object as Feature | undefined;
    if (!f) return setHover(null);
    const v = vals?.values[f.properties.code];
    setHover({
      x: info.x, y: info.y, name: f.properties.name,
      value: fmt(v?.value, vals?.unit),
      n: v?.abs_value != null ? `n = ${fmt(v.abs_value)}` : undefined,
      src: vals?.source ? `${vals.source.org}${vals.source.period || vals.source.year ? `, ${vals.source.period ?? vals.source.year}` : ""}` : undefined,
    });
  };

  const layers: Layer[] = [];
  if (counties) {
    layers.push(new GeoJsonLayer({
      id: "counties", data: counties as unknown as FeatureCollection, pickable: true, stroked: true, filled: true,
      getFillColor: (f: unknown) => {
        const code = (f as Feature).properties.code;
        const c = code === live?.code ? colorFor(live?.value, county)
                                     : colorFor(county?.values[code]?.value, county);
        const focus = selected ?? live?.code;
        if (focus && code !== focus) return [c[0], c[1], c[2], live ? 60 : 90];   // rest of Finland fades
        return [c[0], c[1], c[2], crowd && code === crowd.code ? 90 : c[3]];      // dots are the hero
      },
      getLineColor: (f: unknown) => {
        const code = (f as Feature).properties.code;
        if (code === live?.code) return [125, 211, 252, 255];      // sky outline while the replay runs
        return code === selected ? [255, 255, 255, 255] : [12, 13, 18, 255];
      },
      getLineWidth: (f: unknown) => {
        const code = (f as Feature).properties.code;
        return code === live?.code ? 3 : code === selected ? 2.5 : 1;
      }, lineWidthUnits: "pixels",
      updateTriggers: { getFillColor: [county, selected, live], getLineColor: [selected, live], getLineWidth: [selected, live] },
      onHover: tip(county),
      onClick: (info: PickingInfo) => {
        setPick(null); setAns(null);
        const f = info.object as Feature; const code = f.properties.code === selected ? null : f.properties.code;
        onSelect(code);
        // while a replay crowd holds the camera, a stray click (a missed dot) must not fly away —
        // the focus effect only fires when focusCode changes, so a fly(null) here would strand
        // the view on Finland with the dots left behind.
        if (!crowd) fly(code ? f : null);
      },
    }));
  }
  if (muniFeatures && selected) {
    layers.push(new GeoJsonLayer({
      id: "municipalities", data: muniFeatures as unknown as FeatureCollection, pickable: true, stroked: true, filled: true,
      getFillColor: (f: unknown) => colorFor(muni?.values[(f as Feature).properties.code]?.value, muni),
      getLineColor: [12, 13, 18, 200], getLineWidth: 0.6, lineWidthUnits: "pixels",
      updateTriggers: { getFillColor: [muni] }, onHover: tip(muni),
    }));
  }
  if (crowd) {
    layers.push(new ScatterplotLayer({
      id: "crowd", data: crowd.dots, pickable: true,
      getPosition: (d: CrowdDot) => [d.lon, d.lat],
      getRadius: (d: CrowdDot) => (d.u <= crowd.revealFrac ? 3 : 0), radiusUnits: "pixels",
      getFillColor: (d: CrowdDot) => (d.u < crowd.pRow[d.row] ? [74, 222, 128, 235] : [248, 113, 113, 235]),
      stroked: true, getLineColor: [255, 255, 255, 90], getLineWidth: 0.5, lineWidthUnits: "pixels",
      transitions: { getRadius: 400, getFillColor: 300 },   // grow on reveal, fade on scenario flip
      updateTriggers: { getRadius: [crowd.revealFrac], getFillColor: [crowd.pRow, crowd.flip] },
      onHover: (info: PickingInfo) => {
        const d = info.object as CrowdDot | undefined;
        if (!d || d.u > crowd.revealFrac) return setHover(null);
        const r = crowd.flip[d.row] ?? crowd.rows[d.row];
        setHover({ x: info.x, y: info.y, name: d.tip,
                   value: `${crowd.engine} ${Math.round(r.jev_attend * 100)} % takes part`,
                   src: `simulation · ${crowd.engine}` });
      },
      onClick: (info: PickingInfo) => {
        const d = info.object as CrowdDot | undefined;
        if (d && d.u <= crowd.revealFrac) { setAns(null); setPick({ x: info.x, y: info.y, d }); }
      },
    }));
  }

  return (
    <div className="absolute inset-0" ref={wrap}>
      <DeckGL viewState={view} onViewStateChange={(e: { viewState: unknown }) => setView(e.viewState as ViewState)} controller layers={layers}
        getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}>
        <Map mapStyle={STYLE} />
      </DeckGL>
      {hover && (
        <div className="glass pointer-events-none absolute px-3 py-2 max-w-[240px]" style={{ left: hover.x + 12, top: hover.y + 12, borderRadius: 8 }}>
          <div className="t-caption text-white/70 leading-tight">{hover.name}</div>
          <div className="flex items-baseline gap-2">
            <span className="t-section tabular-nums">{hover.value}</span>
            {hover.n && <span className="t-micro">{hover.n}</span>}
          </div>
          {hover.src && <div className="t-micro mt-0.5">{hover.src}</div>}
        </div>
      )}
      {pick && crowd && (() => {
        const r = crowd.rows[pick.d.row], f = crowd.flip[pick.d.row];
        const left = Math.min(pick.x + 14, window.innerWidth - 296);   // the map fills the viewport
        const top = Math.min(pick.y + 10, window.innerHeight - 236);
        return (
          <div className="glass absolute z-20 w-[264px] p-2.5" style={{ left, top, borderRadius: 10 }}>
            <div className="flex items-start justify-between gap-2">
              <div className="t-caption leading-tight text-white/80">{r.key.sex_label}, {r.key.age5}</div>
              <button onClick={() => setPick(null)} className="text-white/50 hover:text-white leading-none px-1">×</button>
            </div>
            <div className="t-body text-white/70 mt-0.5 leading-snug">
              {r.key.lang_label} · {r.key.activity} · lives in {muniName.get(pick.d.muni) ?? pick.d.muni} · one of ~{crowd.perDot} similar {crowd.who}
            </div>
            <div className="text-[11px] mt-1 leading-snug">
              <span className="text-sky-300/90 tabular-nums">
                {f ? `${crowd.engine} ${Math.round((f.jev_attend_before ?? 0) * 100)} % → ${Math.round(f.jev_attend * 100)} % take part`
                    : `${crowd.engine} ${Math.round(r.jev_attend * 100)} % take part`}
              </span>
              {r.reason_short && <span className="text-white/55"> · main factor: {r.reason_short}</span>}
            </div>
            <button onClick={() => getResidentAnswer(crowd.prog, (f ?? r).answer_key,
                            crowd.scenarios.length ? crowd.scenarios : undefined).then(setAns).catch(() => null)}
                    className="t-micro mt-1.5 underline decoration-dotted text-sky-300/90 hover:text-sky-200">
              See what {crowd.engine} was asked
            </button>
            {ans && <div className="mt-1.5 max-h-[38vh] overflow-y-auto"><Asked ans={ans} eng={crowd.engine} onClose={() => setAns(null)} /></div>}
          </div>
        );
      })()}
    </div>
  );
}
