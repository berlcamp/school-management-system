"use client";

import type { ModuleStatus } from "@/lib/utils/needsReview";

/** Needs Review status colours, shared by the division and school pages. */
export const STATUS_STYLE: Record<ModuleStatus, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "border-red-200 bg-red-50 text-red-800" },
  incomplete: { label: "Incomplete", className: "border-amber-200 bg-amber-50 text-amber-900" },
  complete: { label: "Complete", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  not_applicable: { label: "N/A", className: "border-slate-200 bg-slate-50 text-slate-500" },
};

export function StatusPill({ status }: { status: ModuleStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}
