"use client";

import {
  STAFF_DESIGNATIONS,
  type StaffDesignation,
} from "@/lib/constants/designations";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

/**
 * The designations the signed-in user holds at their ACTIVE school
 * (migration 216), with the subjects (Department Head) and grade levels
 * (Grade Level Coordinator) they cover.
 *
 * Everything is false/empty while loading or on error, so a slow read never
 * flashes a control. The read is cached per `${userId}:${schoolId}`, so a
 * school switch refetches; `refreshDesignations()` drops the copy after the
 * designations are edited.
 */

interface DesignationData {
  designations: Set<StaffDesignation>;
  subjectIds: Set<string>;
  gradeLevels: Set<number>;
}

const EMPTY: DesignationData = {
  designations: new Set(),
  subjectIds: new Set(),
  gradeLevels: new Set(),
};

let cachedKey: string | null = null;
let cached: Promise<DesignationData> | null = null;

function isDesignation(value: string): value is StaffDesignation {
  return (STAFF_DESIGNATIONS as readonly string[]).includes(value);
}

function load(userId: number, schoolId: number): Promise<DesignationData> {
  const key = `${userId}:${schoolId}`;
  if (cached && cachedKey === key) return cached;
  cachedKey = key;
  const promise = (async () => {
    const [desig, subjects] = await Promise.all([
      supabase
        .from("sms_staff_designations")
        .select("designation, grade_levels")
        .eq("user_id", userId)
        .eq("school_id", schoolId),
      supabase
        .from("sms_department_head_subjects")
        .select("subject_id")
        .eq("user_id", userId)
        .eq("school_id", schoolId),
    ]);
    if (desig.error) throw desig.error;
    if (subjects.error) throw subjects.error;

    const designations = new Set<StaffDesignation>();
    const gradeLevels = new Set<number>();
    for (const row of desig.data ?? []) {
      const d = row.designation as string;
      if (!isDesignation(d)) continue;
      designations.add(d);
      for (const g of (row.grade_levels as number[] | null) ?? []) {
        gradeLevels.add(Number(g));
      }
    }
    const subjectIds = new Set(
      (subjects.data ?? []).map((row) => String(row.subject_id)),
    );
    return { designations, subjectIds, gradeLevels };
  })();
  cached = promise;
  promise.catch(() => {
    if (cached === promise) {
      cached = null;
      cachedKey = null;
    }
  });
  return promise;
}

// Mounted hooks, so a refresh re-runs them instead of only dropping the cache.
const listeners = new Set<() => void>();

export function refreshDesignations() {
  cached = null;
  cachedKey = null;
  listeners.forEach((notify) => notify());
}

export function useDesignations() {
  const userId = useAppSelector((state) => state.user.user?.system_user_id);
  const schoolId = useAppSelector((state) => state.user.user?.school_id);
  const hasContext = userId != null && schoolId != null && schoolId !== "";

  const [data, setData] = useState<DesignationData>(EMPTY);
  const [loading, setLoading] = useState(hasContext);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const notify = () => setReloadTick((n) => n + 1);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, []);

  useEffect(() => {
    if (!hasContext) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    let isMounted = true;
    setData(EMPTY);
    setLoading(true);
    load(Number(userId), Number(schoolId))
      .then((result) => {
        if (isMounted) setData(result);
      })
      .catch((error) => {
        console.error("Error loading staff designations:", error);
        if (isMounted) setData(EMPTY);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [hasContext, userId, schoolId, reloadTick]);

  const has = useCallback(
    (d: StaffDesignation) => !loading && data.designations.has(d),
    [loading, data],
  );

  return {
    loading,
    has,
    subjectIds: loading ? EMPTY.subjectIds : data.subjectIds,
    gradeLevels: loading ? EMPTY.gradeLevels : data.gradeLevels,
  };
}
