"use client";
// Evidence chips (DATA / MODEL / SIMULATION / ROADMAP) and the roadmap citation chip for generated reports.
import { Tag } from "@/components/ui";
import { KIND_TAG, KIND_WORDS, type Kind, type ReportAction } from "@/lib/report";

export function EvidenceChips({ kinds, big }: { kinds?: Kind[]; big?: boolean }) {
  if (!kinds?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5" style={big ? { fontSize: "1.1em" } : undefined}>
      {kinds.map((k) => (
        <span key={k} title={`Evidence: ${KIND_WORDS[k]}`}><Tag v={KIND_TAG[k]}>{k}</Tag></span>
      ))}
    </span>
  );
}

export function ActionChip({ a }: { a?: ReportAction | null }) {
  if (!a) return <Tag v="warn">no roadmap action</Tag>;
  const label = <>Roadmap {a.id}{a.page != null && <i>· p. {a.page}</i>}</>;
  return a.url
    ? <a href={a.url} target="_blank" rel="noreferrer" title={a.title ?? undefined} className="tag tag-roadmap">{label}</a>
    : <span className="tag tag-roadmap" title={a.title ?? undefined}>{label}</span>;
}
