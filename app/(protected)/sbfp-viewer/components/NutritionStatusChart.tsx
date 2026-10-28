"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SBFP_WEIGHING_PERIODS } from "@/lib/constants/sbfp";
import {
  formatCount,
  nutritionDistribution,
  type NutritionAxis,
  type SbfpNutritionRow,
} from "@/lib/utils/sbfpOverview";
import { Table2 } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * Diverging encoding: the scale is ordered around Normal, so under-nutrition
 * takes the red arm, over-nutrition the blue arm and Normal a neutral gray.
 * Validated with the dataviz palette script against the white card: adjacent
 * pairs clear ΔE 18 under every colour-vision type. The gray and the light
 * blue sit under 3:1 against white, which is why every segment wide enough
 * carries a direct label and the table view is one click away.
 */
const BAND_STYLE: Record<string, { fill: string; ink: string }> = {
  severely_wasted: { fill: "#a32424", ink: "#ffffff" },
  wasted: { fill: "#e0644f", ink: "#1f1f1f" },
  normal: { fill: "#d4d3cd", ink: "#1f1f1f" },
  overweight: { fill: "#5b9be8", ink: "#0b0b0b" },
  obese: { fill: "#1c4f95", ink: "#ffffff" },
  severely_stunted: { fill: "#a32424", ink: "#ffffff" },
  stunted: { fill: "#e0644f", ink: "#1f1f1f" },
  tall: { fill: "#5b9be8", ink: "#0b0b0b" },
};

/** Below this share a segment is too narrow for its label; the tooltip carries it. */
const LABEL_MIN_PERCENT = 9;

const AXES: { value: NutritionAxis; label: string }[] = [
  { value: "bmi", label: "BMI-for-age" },
  { value: "hfa", label: "Height-for-age" },
];

export function NutritionStatusChart({ rows }: { rows: readonly SbfpNutritionRow[] }) {
  const [axis, setAxis] = useState<NutritionAxis>("bmi");
  const [showTable, setShowTable] = useState(false);

  const periods = useMemo(
    () => SBFP_WEIGHING_PERIODS.map((p) => ({ ...p, dist: nutritionDistribution(rows, p.value, axis) })),
    [rows, axis],
  );
  const legend = periods[0]?.dist.bands ?? [];
  const nobodyWeighed = periods.every((p) => p.dist.total === 0);

  return (
    <section
      aria-labelledby="nutrition-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="nutrition-heading" className="text-base font-semibold text-slate-900">
            Nutritional status of beneficiaries
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Share of weighed learners in each band, at each of the programme&apos;s three weighings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Measure" className="inline-flex rounded-lg bg-slate-100 p-1">
            {AXES.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={axis === a.value}
                onClick={() => setAxis(a.value)}
                className={`h-9 cursor-pointer whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 ${
                  axis === a.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
            className="inline-flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700"
          >
            <Table2 className="h-4 w-4" aria-hidden="true" />
            {showTable ? "Hide table" : "Show table"}
          </button>
        </div>
      </div>

      {/* Legend: identity is never colour alone — every band is named here and on the bar. */}
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2" aria-label="Legend">
        {legend.map((b) => (
          <li key={b.key} className="flex items-center gap-2 text-sm text-slate-700">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: BAND_STYLE[b.key]?.fill }}
              aria-hidden="true"
            />
            {b.label}
          </li>
        ))}
      </ul>

      {nobodyWeighed ? (
        <p className="mt-6 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No beneficiary has been weighed yet for this school year.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {periods.map(({ value, label, dist }) => {
            const banded = dist.total - dist.unrecorded;
            const shown = dist.bands.filter((b) => b.count > 0);
            const summary = shown.map((b) => `${b.label} ${b.percent.toFixed(1)}%`).join(", ");
            return (
              <div key={value}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{label}</span>
                  <span className="text-xs text-slate-500">
                    {banded === 0 ? "Not weighed yet" : `${formatCount(banded)} learners`}
                    {dist.unrecorded > 0 && ` · ${formatCount(dist.unrecorded)} without a band`}
                  </span>
                </div>
                {banded === 0 ? (
                  <div className="h-9 rounded-md border border-dashed border-slate-300" aria-hidden="true" />
                ) : (
                  <div
                    role="img"
                    aria-label={`${label}: ${summary}`}
                    className="flex h-9 w-full gap-[2px] overflow-hidden rounded-[4px]"
                  >
                    {shown.map((b) => {
                      const style = BAND_STYLE[b.key];
                      return (
                        <Tooltip key={b.key}>
                          <TooltipTrigger asChild>
                            <div
                              className="flex h-full min-w-[3px] items-center justify-center text-xs font-semibold tabular-nums transition-opacity duration-150 hover:opacity-90"
                              style={{ width: `${b.percent}%`, backgroundColor: style?.fill, color: style?.ink }}
                            >
                              {b.percent >= LABEL_MIN_PERCENT && `${Math.round(b.percent)}%`}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span className="font-medium">{b.label}</span> · {formatCount(b.count)} learners ·{" "}
                            {b.percent.toFixed(1)}%
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showTable && !nobodyWeighed && (
        <div className="relative mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Beneficiaries by nutritional status and weighing</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th scope="col" className="py-2 pr-3 font-medium">Weighing</th>
                {legend.map((b) => (
                  <th key={b.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {b.label}
                  </th>
                ))}
                <th scope="col" className="py-2 pl-3 text-right font-medium">No band</th>
              </tr>
            </thead>
            <tbody>
              {periods.map(({ value, label, dist }) => (
                <tr key={value} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-900">
                    {label}
                  </th>
                  {dist.bands.map((b) => (
                    <td key={b.key} className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatCount(b.count)}
                      <span className="ml-1 text-xs text-slate-500">({b.percent.toFixed(1)}%)</span>
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right tabular-nums text-slate-700">
                    {formatCount(dist.unrecorded)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
