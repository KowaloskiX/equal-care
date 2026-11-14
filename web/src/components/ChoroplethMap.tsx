"use client";
// Finland by wellbeing services county, coloured by the selected indicator. Click a county to select it; its
// municipalities are drawn on top when the indicator exists at municipality level.
import { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { FlyToInterpolator, Layer, type PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");   // Turbopack does not bundle MapLibre's module worker (see postinstall)
import { fmt, type FC, type Feature, type Values } from "@/lib/api";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
const HOME = { longitude: 25.5, latitude: 64.6, zoom: 4.35, pitch: 0, bearing: 0 };
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
}) {
  const { counties, municipalities, county, muni, selected, onSelect } = props;
  const [view, setView] = useState<ViewState>(HOME);
  const [hover, setHover] = useState<{ x: number; y: number; name: string; value: string; n?: string; src?: string } | null>(null);

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
        const c = colorFor(county?.values[(f as Feature).properties.code]?.value, county);
        return selected && (f as Feature).properties.code !== selected ? [c[0], c[1], c[2], 90] : c;
      },
      getLineColor: (f: unknown) => ((f as Feature).properties.code === selected ? [255, 255, 255, 255] : [12, 13, 18, 255]),
      getLineWidth: (f: unknown) => ((f as Feature).properties.code === selected ? 2.5 : 1), lineWidthUnits: "pixels",
      updateTriggers: { getFillColor: [county, selected], getLineColor: [selected], getLineWidth: [selected] },
      onHover: tip(county),
      onClick: (info: PickingInfo) => {
        const f = info.object as Feature; const code = f.properties.code === selected ? null : f.properties.code;
        onSelect(code); fly(code ? f : null);
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

  return (
    <div className="absolute inset-0">
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
    </div>
  );
}
