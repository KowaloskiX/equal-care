"use client";
// Shared design-system pieces: tags (the one chip), the segmented control, step numbers, skeletons.
import type { ReactNode } from "react";

export function Tag({ v = "data", children }: { v?: "data" | "sim" | "roadmap" | "goal3" | "warn" | "note"; children: ReactNode }) {
  return <span className={`tag tag-${v}`}>{children}</span>;
}

export function Seg<T extends string>({ options, value, onChange, small }: {
  options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void; small?: boolean;
}) {
  return (
    <div className={`seg ${small ? "seg-sm" : ""}`} role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value}
                className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function StepNo({ n }: { n: number }) {
  return <span className="stepno">{n}</span>;
}

export function Skel({ className = "" }: { className?: string }) {
  return <div className={`skel ${className}`} />;
}
