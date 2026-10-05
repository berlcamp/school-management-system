"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ECCD_AGE_BANDS, eccdReferenceTable } from "@/lib/constants/eccd";
import { eccdDomainScoring } from "@/lib/utils/eccdScale";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface EccdConversionTableProps {
  domainCode: string;
  activeItemCount: number;
}

/**
 * DepEd's raw -> scaled conversion for one domain, read-only. The table is a
 * published norm, not school configuration, so nothing here is editable; the
 * screen exists so staff can compare it with the paper and see whether the
 * domain's checklist still matches the one the table was built on.
 */
export function EccdConversionTable({ domainCode, activeItemCount }: EccdConversionTableProps) {
  const code = domainCode.trim().toUpperCase();
  const scoring = eccdDomainScoring(domainCode, activeItemCount);
  const tables = ECCD_AGE_BANDS.map((band) => ({ band, table: eccdReferenceTable(band.id, code) }));
  const rawCount = Math.max(0, ...tables.map((t) => t.table?.length ?? 0));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Scale Score Conversion</CardTitle>
        <CardDescription>
          DepEd&rsquo;s published raw-to-scaled table for {domainCode}, by the learner&rsquo;s age
          at each administration. Used as-is by the entry grid and the printed card; it cannot be
          edited.
        </CardDescription>
        {scoring.scored ? (
          <p className="flex items-center gap-1.5 pt-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {activeItemCount} active items match the official checklist — scale scores are
            computed.
          </p>
        ) : (
          <p className="flex items-start gap-1.5 pt-2 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>
              Scale scores for this domain are not computed: {scoring.reason} They print blank
              for hand-entry, and so do the Standard Score and its interpretation.
            </span>
          </p>
        )}
      </CardHeader>
      {rawCount > 0 && (
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Raw score</th>
                  {tables.map(({ band }) => (
                    <th key={band.id} className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                      {band.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {Array.from({ length: rawCount }, (_, raw) => (
                  <tr key={raw}>
                    <td className="px-2 py-1">{raw}</td>
                    {tables.map(({ band, table }) => (
                      <td key={band.id} className="px-2 py-1 text-right">
                        {table?.[raw] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
