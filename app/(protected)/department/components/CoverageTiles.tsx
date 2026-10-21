"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { coverageTotals } from "@/lib/utils/departmentMps";

type Totals = ReturnType<typeof coverageTotals>;

export function CoverageTiles({
  totals,
  periodLabel,
}: {
  totals: Totals;
  periodLabel: string;
}) {
  const tiles = [
    { value: `${totals.encoded} / ${totals.expected}`, label: `encoded in ${periodLabel}` },
    { value: String(totals.missing), label: "missing", alert: totals.missing > 0 },
    { value: totals.average == null ? "—" : totals.average.toFixed(1), label: "average MPS" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {tiles.map((t) => (
        <Card key={t.label} className="py-0">
          <CardContent className="p-4">
            <div className={`text-2xl font-semibold ${t.alert ? "text-red-600" : ""}`}>
              {t.value}
            </div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
