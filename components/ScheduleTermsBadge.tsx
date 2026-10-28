"use client";

import { cn } from "@/lib/utils";
import { formatScheduleTerms, scheduleTermOptions } from "@/lib/utils/scheduleTerms";

interface ScheduleTermsBadgeProps {
  terms: number[] | null | undefined;
  schoolYear: string;
  shsCurriculum?: string | null;
  className?: string;
}

/** "T3 only" / "T1–T2" on a part-year schedule (migration 222); nothing for the whole year. */
export const ScheduleTermsBadge = ({
  terms,
  schoolYear,
  shsCurriculum,
  className,
}: ScheduleTermsBadgeProps) => {
  const label = formatScheduleTerms(
    terms,
    scheduleTermOptions(schoolYear, shsCurriculum),
  );
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800",
        className,
      )}
    >
      {label}
    </span>
  );
};
