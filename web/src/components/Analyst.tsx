"use client";
// "Ask the analyst" — a right-side drawer where Claude answers with backend tool calls only.
// Grounding flags any number Claude invented; those render underlined amber.
import { useState } from "react";
import { askAnalyst, type AskResponse } from "@/lib/api";

const SUGGESTED = [
  "Where is breast screening furthest behind, and why?",
  "What should Helsinki do first, and how many women would it bring?",
  "Which counties have the longest oncology queues?",
];

type Msg = { q: string; r?: AskResponse; err?: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a flagged number may be written "1 216", "1,216" or "1216" — match all groupings
const variants = (n: number) => {
  const s = String(n);
  const out = [esc(s)];
  if (Number.isInteger(n) && Math.abs(n) >= 1000) {
    out.push(esc(s.replace(/\B(?=(\d{3})+(?!\d))/g, " ")), esc(s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")));
  }
  return out.join("|");
};

function Marked({ text, bad }: { text: string; bad: number[] }) {
  if (!bad.length) return <>{text}</>;
  const re = new RegExp(`(${bad.map(variants).join("|")})`, "g");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <span key={i} title="not found in the tool results"
                  className="underline decoration-amber-300 decoration-dotted underline-offset-2 text-amber-200">{p}</span>
          : <span key={i}>{p}</span>)}
    </>
  );
}

export default function Analyst({ prog, code, countyName, onShow, onPlay, onClose }: {
  prog: string | null; code: string | null; countyName: (c: string) => string;
  onShow: (f: { prog: string; code: string }) => void;
  onPlay: (r: { prog: string; code: string; scenarios: string[] }) => void;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const send = (question: string) => {
    const t = question.trim();
    if (!t || busy) return;
    setQ("");
    setBusy(true);
    setMsgs((m) => [...m, { q: t }]);
    askAnalyst(t, prog, code)
      .then((r) => setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, r } : x))))
      .catch((e) => setMsgs((m) => m.map((x, i) =>
        (i === m.length - 1 ? { ...x, err: String(e instanceof Error ? e.message : e) } : x))))
      .finally(() => setBusy(false));
  };

  return (
    <div className="absolute right-4 top-[72px] bottom-4 w-[420px] glass p-4 flex flex-col min-h-0 z-30">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="t-panel">Ask the analyst</div>
          <div className="t-micro mt-0.5">Claude Haiku reads the tool results — numbers come from the API only.</div>
        </div>
        <button onClick={onClose} className="text-white/50 hover:text-white leading-none px-1 text-lg">×</button>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto min-h-0 pr-1 space-y-3">
        {!msgs.length && (
          <div className="space-y-1.5">
            <div className="t-caption">Try asking</div>
            {SUGGESTED.map((s) => (
              <button key={s} onClick={() => send(s)}
                      className="w-full text-left rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2
                                 text-[12px] text-white/75 leading-snug hover:bg-white/[0.08]">
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i}>
            <div className="t-caption text-sky-200/90">{m.q}</div>
            <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
              {m.err ? <div className="t-body text-rose-300 leading-snug">{m.err}</div>
                : m.r ? (
                  <>
                    <div className="t-body text-white/80 leading-snug">
                      <Marked text={m.r.text} bad={m.r.unverified} />
                    </div>
                    <div className="t-micro mt-1.5 text-white/45">
                      Claude Haiku{m.r.tools.length
                        ? <> · tools: {[...new Set(m.r.tools.map((t) => t.name))].join(", ")}</> : " · no tools"}
                    </div>
                    {(m.r.focus || m.r.run) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {m.r.focus && (
                          <button onClick={() => onShow(m.r!.focus!)}
                                  className="rounded-md bg-sky-400/15 border border-sky-300/35 text-sky-200
                                             text-[10.5px] px-2 py-1 hover:bg-sky-400/25">
                            Show {countyName(m.r.focus.code)} in the story
                          </button>
                        )}
                        {m.r.run && (
                          <button onClick={() => onPlay(m.r!.run!)}
                                  className="rounded-md bg-emerald-400/15 border border-emerald-300/30 text-emerald-300
                                             text-[10.5px] px-2 py-1 hover:bg-emerald-400/25">
                            Play it on the map
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="t-body text-white/55">Analyst is checking the data…</div>
                )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(q); }}
            className="mt-3 pt-2.5 border-t border-white/10 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Ask about a county, a gap, the roadmap…"
               className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5
                          text-[12px] text-white/85 placeholder:text-white/30 outline-none focus:border-sky-300/40" />
        <button type="submit" disabled={busy || !q.trim()}
                className="rounded-lg bg-sky-400/20 border border-sky-300/40 text-sky-200 text-[12px] px-3
                           hover:bg-sky-400/30 disabled:opacity-40">
          Ask
        </button>
      </form>
    </div>
  );
}
