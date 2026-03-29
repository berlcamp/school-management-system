import {
  DEFAULT_SETTINGS,
  fetchSchoolSettings,
  saveSchoolSettings,
  SchoolSettings,
} from "@/lib/utils/schoolSettings";
import { useCallback, useEffect, useState } from "react";

export function useSchoolSettings(
  enabled = true,
  schoolId?: string | number | null
) {
  const [settings, setSettings] = useState<SchoolSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchSchoolSettings(schoolId);
    setSettings(data);
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
    async (newSettings: SchoolSettings) => {
      const result = await saveSchoolSettings(newSettings, schoolId);
      if (result.success) {
        setSettings(newSettings);
      }
      return result;
    },
    [schoolId]
  );

  return { settings, isLoading, refetch, save };
}
