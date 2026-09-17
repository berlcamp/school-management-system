import {
  fetchSchoolCalendar,
  isCalendarUnset,
  SchoolCalendarDay,
} from "@/lib/utils/schoolCalendar";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The calendar in scope for one school and school year, and whether it is unset.
 *
 * For surfaces that print or total class days without otherwise needing the
 * calendar — the card print dialog, the DepEd forms pages — so they can say
 * that every weekday is counting as a class day rather than letting a wrong
 * denominator out on paper. A failed read looks the same as an empty calendar
 * to `fetchSchoolCalendar` (it returns []), which is the safer way round: the
 * notice is advisory and nothing is blocked by it.
 */
export function useSchoolCalendar(
  schoolId: string | number | null | undefined,
  schoolYear: string,
  enabled = true
) {
  const [entries, setEntries] = useState<SchoolCalendarDay[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    if (!enabled || !schoolYear) {
      setEntries([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const rows = await fetchSchoolCalendar(schoolId, schoolYear);
    if (!isMounted.current) return;
    setEntries(rows);
    setIsLoading(false);
  }, [enabled, schoolId, schoolYear]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    entries,
    isLoading,
    /** Only ever true once loaded, so the notice cannot flash before the read. */
    unset: !isLoading && isCalendarUnset(entries),
    refetch,
  };
}
