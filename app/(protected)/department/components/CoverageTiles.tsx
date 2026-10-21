"use client";

import { StatTile } from "@/components/dashboards/DashboardKit";
import type { coverageTotals } from "@/lib/utils/departmentMps";
import { AlertTriangle, BarChart3, CheckCircle2 } from "lucide-react";

type Totals = ReturnType<typeof coverageTotals>;

export function CoverageTiles({
  totals,
  periodLabel,
}: {
  totals: Totals;
  periodLabel: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatTile
        label="Encoded"
        value={`${totals.encoded} / ${totals.expected}`}
        hint={`Classes with MPS in ${periodLabel}`}
        icon={CheckCircle2}
        tone="emerald"
      />
      <StatTile
        label="Missing"
        value={totals.missing}
        hint={totals.missing > 0 ? "Classes still to encode" : "Nothing outstanding"}
        icon={AlertTriangle}
        tone={totals.missing > 0 ? "rose" : "slate"}
      />
      <StatTile
        label="Average MPS"
        value={totals.average == null ? "—" : totals.average.toFixed(1)}
        hint={periodLabel}
        icon={BarChart3}
        tone="sky"
      />
    </div>
  );
}
