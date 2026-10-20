"use client";

import { isRegionAccount } from "@/lib/constants";
import { regionReportKey } from "@/lib/constants/regionAccess";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

/**
 * Which dashboard sections and SDO Reports a Region Account may see
 * (migration 214).
 *
 * For every other role `canView` is always true: the switches narrow the Region
 * Account and nobody else. For a Region Account it is true only for a key whose
 * row is switched on — a missing row is off, and so is everything while the
 * switches are still loading or failed to load, so a slow read never flashes a
 * hidden report.
 *
 * The switches are read once and shared by the sidebar, header, guard and
 * pages, which all mount together; `refreshRegionAccess()` drops the copy after
 * the super admin saves.
 */

let cached: Promise<Set<string>> | null = null;

function loadEnabledKeys(): Promise<Set<string>> {
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase
        .from("sms_region_account_access")
        .select("item_key")
        .eq("is_enabled", true);
      if (error) {
        cached = null;
        throw error;
      }
      return new Set((data ?? []).map((row) => row.item_key as string));
    })();
  }
  return cached;
}

export function refreshRegionAccess() {
  cached = null;
}

export function useRegionAccess() {
  const userType = useAppSelector((state) => state.user.user?.type);
  const isRegion = isRegionAccount(userType);

  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(isRegion);

  useEffect(() => {
    if (!isRegion) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    setLoading(true);
    loadEnabledKeys()
      .then((keys) => {
        if (isMounted) setEnabled(keys);
      })
      .catch((error) => {
        console.error("Error loading Region Account access:", error);
        if (isMounted) setEnabled(new Set());
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isRegion]);

  const canView = useCallback(
    (key: string) => !isRegion || (!loading && enabled.has(key)),
    [isRegion, loading, enabled],
  );

  return { isRegion, loading, canView, reportKey: regionReportKey };
}
