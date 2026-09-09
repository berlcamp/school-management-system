"use client";

import { ClassRecordGradingScheme } from "@/lib/constants/classRecord";
import { descriptorDistribution } from "./classRecordUtils";

/**
 * How the class sits across the descriptor bands, under the record's own
 * grading scheme (migration 173: MATATAG's Advancing / Benchmarking /
 * Connecting / Developing / Emerging, or DO 8, s.2015's on a legacy record).
 *
 * A count of what is already on screen, never a second computation of it: the
 * caller passes the grades from the column being summarised, so the tally
 * cannot drift from the rows above it. Learners with nothing encoded are not
 * counted at all rather than landing in the lowest band — an ungraded learner
 * is not a failing one — which is why the total is stated beside the chips.
 */

/** Highest band first, so the colours run best to lowest as the bands do. */
const BAND_STYLES = [
  "border-emerald-300 bg-emerald-50 text-emerald-800",
  "border-sky-300 bg-sky-50 text-sky-800",
  "border-amber-300 bg-amber-50 text-amber-800",
  "border-orange-300 bg-orange-50 text-orange-800",
  "border-red-300 bg-red-50 text-red-800",
];

interface DescriptorSummaryProps {
  grades: number[];
  scheme: ClassRecordGradingScheme;
  /** How many learners are on the list, graded or not. */
  learnerCount: number;
  label?: string;
}

export function DescriptorSummary({
  grades,
  scheme,
  learnerCount,
  label = "Descriptor summary",
}: DescriptorSummaryProps) {
  const { tallies, total } = descriptorDistribution(grades, scheme);
  const ungraded = Math.max(learnerCount - total, 0);

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {tallies.map((t, i) => (
          <span
            key={t.label}
            title={`${t.label} (${t.range})`}
            className={`inline-flex items-baseline gap-1.5 rounded-md border px-2 py-0.5 text-xs ${
              BAND_STYLES[i] ?? BAND_STYLES[BAND_STYLES.length - 1]
            } ${t.count === 0 ? "opacity-55" : ""}`}
          >
            <span className="font-semibold tabular-nums">{t.count}</span>
            <span>{t.label}</span>
            <span className="opacity-70 tabular-nums">
              {t.range} &middot; {t.percent}%
            </span>
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {total} of {learnerCount} learner{learnerCount === 1 ? "" : "s"} counted
        {ungraded > 0 ? `; ${ungraded} not yet graded and left out` : ""}.
      </p>
    </div>
  );
}
