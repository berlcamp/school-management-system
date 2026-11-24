"use client";

import { useAppSelector } from "@/lib/redux/hook";
import {
  fetchPendingAdjustmentCount,
  GRADE_ADJUSTMENTS_CHANGED,
} from "@/lib/utils/gradeAdjustments";
import { useEffect, useState } from "react";

/** Roles that decide additional points by role; a Department Head by designation. */
export const canDecideAdjustmentsByRole = (type?: string | null) =>
  type === "school_head" ||
  type === "assistant_school_head" ||
  type === "super admin";

/** Additional points waiting on the user (239), for the menu badge. */
export function usePendingAdjustmentCount(enabled: boolean): number {
  const schoolId = useAppSelector((state) => state.user.user?.school_id) ?? null;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled || !schoolId) {
      setCount(0);
      return;
    }
    let isMounted = true;
    const load = async () => {
      const next = await fetchPendingAdjustmentCount(schoolId);
      if (isMounted) setCount(next);
    };
    void load();
    const timer = setInterval(load, 30000);
    window.addEventListener(GRADE_ADJUSTMENTS_CHANGED, load);
    return () => {
      isMounted = false;
      clearInterval(timer);
      window.removeEventListener(GRADE_ADJUSTMENTS_CHANGED, load);
    };
  }, [enabled, schoolId]);

  return count;
}
