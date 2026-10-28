"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveCurrentPeriod } from "@/lib/utils/departmentMps";
import { getCurrentSchoolYear, getGradingPeriods } from "@/lib/utils/schoolYear";
import { fetchTermDates } from "@/lib/utils/termDates";
import { useEffect, useState } from "react";

/**
 * The grading period under way for a school year (migration 223), or null
 * while the school's term dates load. Teaching Load, Subjects Handled, the
 * School Dashboard and the schedule calendar open here rather than on Term 1,
 * now that a subject can pass from one teacher to another between terms.
 */
export function useCurrentPeriod(
  schoolId: number | null | undefined,
  schoolYear: string,
): number | null {
  const [resolved, setResolved] = useState<{
    key: string;
    period: number;
  } | null>(null);
  const key = `${schoolId ?? ""}|${schoolYear}`;

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      const termDates =
        schoolId != null ? await fetchTermDates(schoolId, schoolYear) : null;
      if (!isMounted) return;
      setResolved({
        key,
        period: resolveCurrentPeriod(
          schoolYear,
          getCurrentSchoolYear(),
          new Date(),
          termDates,
        ),
      });
    };
    run();
    return () => {
      isMounted = false;
    };
  }, [schoolId, schoolYear, key]);

  // A stale answer for another school / year is not an answer.
  return resolved && resolved.key === key ? resolved.period : null;
}

interface SchedulePeriodSelectProps {
  schoolYear: string;
  value: number | "all";
  onChange: (value: number | "all") => void;
  allowWholeYear?: boolean;
}

export const SchedulePeriodSelect = ({
  schoolYear,
  value,
  onChange,
  allowWholeYear = false,
}: SchedulePeriodSelectProps) => {
  const periods = getGradingPeriods(schoolYear);
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onChange(v === "all" ? "all" : Number(v))}
    >
      <SelectTrigger className="h-9 w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowWholeYear && <SelectItem value="all">Whole year</SelectItem>}
        {periods.map((p) => (
          <SelectItem key={p.value} value={String(p.value)}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
