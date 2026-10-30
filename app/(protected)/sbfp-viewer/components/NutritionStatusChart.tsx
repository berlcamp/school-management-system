"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SBFP_WEIGHING_PERIODS } from "@/lib/constants/sbfp";
import {
  formatCount,
  nutritionDistribution,
  type NutritionAxis,
  type NutritionDistribution,
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

/** Learner Health (188) has a baseline and an endline only. */
const LEARNER_HEALTH_PERIODS = new Set(["baseline", "endline"]);

const AXES: { value: NutritionAxis; label: string }[] = [
  { value: "bmi", label: "BMI-for-age" },
  { value: "hfa", label: "Height-for-age" },
];

/**
 * One stacked bar: the share of weighed learners in each band. An empty
 * dashed outline when nobody in the group was weighed in the period.
 */
function DistributionBar({ caption, dist, emptyText }: { caption: string; dist: NutritionDistribution; emptyText: string }) {
  const banded = dist.total - dist.unrecorded;
  const shown = dist.bands.filter((b) => b.count > 0);
  const summary = shown.map((b) => `${b.label} ${b.percent.toFixed(1)}%`).join(", ");
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[9.5rem_1fr] sm:items-center sm:gap-3">
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <span className="text-xs font-medium text-slate-700">{caption}</span>
        <span className="block text-xs text-slate-500">
          {banded === 0 ? emptyText : `${formatCount(banded)} learners`}
          {dist.unrecorded > 0 && ` · ${formatCount(dist.unrecorded)} without a band`}
        </span>
      </div>
      {banded === 0 ? (
        <div className="h-9 rounded-md border border-dashed border-slate-300" aria-hidden="true" />
      ) : (
        <div
          role="img"
          aria-label={`${caption}: ${summary}`}
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
}

/**
 * Beneficiaries' bands at each SBFP weighing, each set against every learner
 * the division (or the chosen district) weighed in Learner Health for the same
 * period — the beneficiaries were picked for being wasted, so their share only
 * means something beside everyone's. Learner Health has no midline.
 */
export function NutritionStatusChart({
  rows,
  allLearnerRows,
  scopeLabel,
}: {
  rows: readonly SbfpNutritionRow[];
  /** Learner Health readings for the same schools (migration 224). */
  allLearnerRows: readonly SbfpNutritionRow[];
  scopeLabel: "division" | "district";
}) {
  const [axis, setAxis] = useState<NutritionAxis>("bmi");
  const [showTable, setShowTable] = useState(false);

  const periods = useMemo(
    () =>
      SBFP_WEIGHING_PERIODS.map((p) => ({
        ...p,
        dist: nutritionDistribution(rows, p.value, axis),
        all: LEARNER_HEALTH_PERIODS.has(p.value) ? nutritionDistribution(allLearnerRows, p.value, axis) : null,
      })),
    [rows, allLearnerRows, axis],
  );
  const legend = periods[0]?.dist.bands ?? [];
  const nobodyWeighed = periods.every((p) => p.dist.total === 0 && (p.all?.total ?? 0) === 0);
  const allCaption = `All learners in the ${scopeLabel}`;

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
            Share of weighed learners in each band, at each of the programme&apos;s three weighings, versus all
            learners in the {scopeLabel} weighed in Learner Health (SF8).
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
          No learner has been weighed yet for this school year.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {periods.map(({ value, label, dist, all }) => (
            <div key={value} className="space-y-2">
              <span className="text-sm font-medium text-slate-900">{label}</span>
              <DistributionBar caption="Beneficiaries" dist={dist} emptyText="Not weighed yet" />
              {all ? (
                <DistributionBar caption={allCaption} dist={all} emptyText="Not weighed yet" />
              ) : (
                <p className="text-xs text-slate-500 sm:pl-[10.25rem]">
                  Learner Health has no midline weighing, so there is no {scopeLabel} figure to compare.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showTable && !nobodyWeighed && (
        <div className="relative mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">
              Beneficiaries and all learners by nutritional status and weighing
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th scope="col" className="py-2 pr-3 font-medium">Weighing</th>
                <th scope="col" className="px-3 py-2 font-medium">Learners</th>
                {legend.map((b) => (
                  <th key={b.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {b.label}
                  </th>
                ))}
                <th scope="col" className="py-2 pl-3 text-right font-medium">No band</th>
              </tr>
            </thead>
            <tbody>
              {periods.flatMap(({ value, label, dist, all }) =>
                [
                  { key: "beneficiaries", group: "Beneficiaries", d: dist },
                  ...(all ? [{ key: "all", group: allCaption, d: all }] : []),
                ].map(({ key, group, d }, i, list) => (
                  <tr
                    key={`${value}-${key}`}
                    className={i === list.length - 1 ? "border-b border-slate-200 last:border-0" : ""}
                  >
                    {i === 0 && (
                      <th
                        scope="rowgroup"
                        rowSpan={list.length}
                        className="py-2 pr-3 text-left align-top font-medium text-slate-900"
                      >
                        {label}
                      </th>
                    )}
                    <th scope="row" className="px-3 py-2 text-left font-normal text-slate-700">
                      {group}
                    </th>
                    {d.bands.map((b) => (
                      <td key={b.key} className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {formatCount(b.count)}
                        <span className="ml-1 text-xs text-slate-500">({b.percent.toFixed(1)}%)</span>
                      </td>
                    ))}
                    <td className="py-2 pl-3 text-right tabular-nums text-slate-700">
                      {formatCount(d.unrecorded)}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
