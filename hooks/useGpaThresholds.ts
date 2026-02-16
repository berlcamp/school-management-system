import {
  DEFAULT_THRESHOLDS,
  fetchGpaThresholds,
  GpaThresholds,
  saveGpaThresholds,
} from "@/lib/utils/gpaThresholds";
import { useCallback, useEffect, useState } from "react";

export function useGpaThresholds(
  enabled = true,
  schoolId?: string | number | null
) {
  const [thresholds, setThresholds] = useState<GpaThresholds>(DEFAULT_THRESHOLDS);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchGpaThresholds(schoolId);
    setThresholds(data);
    setIsLoading(false);
  }, [schoolId]);

  useEffect(() => {
    if (enabled) {
      refetch();
    } else {
      setIsLoading(false);
    }
  }, [enabled, refetch]);

  const save = useCallback(
    async (newThresholds: GpaThresholds) => {
      const result = await saveGpaThresholds(newThresholds, schoolId);
      if (result.success) {
        setThresholds(newThresholds);
      }
      return result;
    },
    [schoolId]
  );

  return { thresholds, isLoading, refetch, save };
}
