"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import RegionCard, { Src } from "@/components/RegionCard";
import { fmt, getGap, getGeo, getMeta, getPathway, getValues, type FC, type Gap, type Meta, type Pathway, type Values } from "@/lib/api";

const ChoroplethMap = dynamic(() => import("@/components/ChoroplethMap"), { ssr: false });
const STAGE_ORDER = ["detection", "referral", "treatment", "outcome", "context"];
const SCREENING = ["screen_breast", "screen_cervix", "screen_bowel"];

export default function Home() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [geo, setGeo] = useState<{ county: FC | null; municipality: FC | null }>({ county: null, municipality: null });
  const [key, setKey] = useState("surv_bowel");
  const [county, setCounty] = useState<Values | null>(null);
  const [muni, setMuni] = useState<Values | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [path, setPath] = useState<Pathway | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMeta().then(setMeta).catch((e) => setErr(String(e)));
    Promise.all([getGeo("county"), getGeo("municipality")]).then(([c, m]) => setGeo({ county: c, municipality: m })).catch((e) => setErr(String(e)));
  }, []);
  useEffect(() => { getValues(key).then(setCounty).catch((e) => setErr(String(e))); }, [key]);
  useEffect(() => {
    if (!sel) { setMuni(null); setPath(null); setGaps([]); return; }
    getPathway(sel).then(setPath);
    Promise.all(SCREENING.map((k) => getGap(k, sel))).then((g) => setGaps(g.filter(Boolean) as Gap[]));
  }, [sel]);
  useEffect(() => { if (sel) getValues(key, "municipality", sel).then((v) => setMuni(Object.keys(v.values).length ? v : null)).catch(() => setMuni(null)); }, [key, sel]);

  const ind = meta?.indicators.find((i) => i.key === key);
  const ranked = useMemo(() => {
    if (!county) return [];
    const xs = Object.entries(county.values).map(([code, v]) => ({ code, ...v }));
    const better = county.higher_is_better ?? true;
    return xs.sort((a, b) => (better ? a.value - b.value : b.value - a.value));   // worst first
  }, [county]);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <ChoroplethMap counties={geo.county} municipalities={geo.municipality} county={county} muni={muni} selected={sel} onSelect={setSel} />

      <div className="absolute left-4 top-4 bottom-4 w-[340px] flex flex-col gap-3 pointer-events-none">
        <div className="glass p-4 pointer-events-auto">
          <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Equal Care Across Finland</div>
          <h1 className="text-[18px] font-semibold leading-tight mt-1">Where does the cancer care pathway fall behind?</h1>
          <p className="text-[12.5px] text-white/55 mt-1.5">Public data only: THL Sotkanet (Finnish Cancer Registry figures) and Statistics Finland. Click a county.</p>
          {err && <p className="text-rose-400 text-[12px] mt-2">API: {err}. Is <code>make app</code> running?</p>}
        </div>

        <div className="glass p-3 pointer-events-auto overflow-y-auto">
          {meta && STAGE_ORDER.map((st) => (
            <div key={st} className="mb-1.5">
              <div className="text-[10.5px] uppercase tracking-wide text-white/35 px-1 mb-1">{st}</div>
              <div className="flex flex-wrap gap-1.5">
                {meta.indicators.filter((i) => i.stage === st && i.unit !== "people" && i.unit !== "visits").map((i) => (
                  <button key={i.key} onClick={() => setKey(i.key)} className={`chip ${i.key === key ? "chip-primary" : ""}`}>{i.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {county && ind && (
          <div className="glass p-4 pointer-events-auto overflow-y-auto min-h-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[13px] font-semibold leading-tight">{county.label}, {county.year}</div>
              <Src s={county.source} />
            </div>
            <div className="text-[12px] text-white/55 mt-1">
              Finland {fmt(county.national, county.unit)}{county.target != null && <> · target {fmt(county.target, county.unit)}</>}
              {ind.goal && <> · strategy goal {ind.goal}</>}
            </div>
            <div className="mt-2 space-y-0.5">
              {ranked.slice(0, 6).map((r) => (
                <button key={r.code} onClick={() => setSel(r.code)} className="w-full flex justify-between text-[12.5px] px-1.5 py-1 rounded hover:bg-white/5">
                  <span className="text-white/75 truncate">{r.name.replace(" hyvinvointialue", "").replace("n hyvinvointialue", "")}</span>
                  <span className="tabular-nums text-rose-300">{fmt(r.value, county.unit)}</span>
                </button>
              ))}
            </div>
            <div className="text-[10.5px] text-white/35 mt-1.5">Weakest six of {ranked.length}. Red on the map = worse than Finland.</div>
          </div>
        )}
      </div>

      {path && (
        <div className="absolute right-4 top-4">
          <RegionCard p={path} gaps={gaps} active={key} onPick={setKey} onClose={() => setSel(null)} />
        </div>
      )}
    </main>
  );
}
