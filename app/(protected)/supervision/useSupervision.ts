"use client";

import { supabase } from "@/lib/supabase/client";
import type {
  CotObservation,
  CotRating,
  SupervisionObserver,
  SupervisionSchedule,
  SupervisionScheduleObserver,
} from "@/types";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

/** A staff member who can be scheduled as a teacher or designated as an observer. */
export interface SupervisionStaff {
  id: string;
  name: string;
  position: string | null;
  type: string | null;
}

/** A schedule with its assigned observers and the COT forms filed against it. */
export interface ScheduleBundle {
  schedule: SupervisionSchedule;
  observers: SupervisionScheduleObserver[];
  observations: CotObservation[];
}

/**
 * Every staff member at the school who can appear in the supervision module —
 * as the teacher being observed, or as a designated observer.
 *
 * Division admins have no `school_id`, so callers pass null and get an empty
 * list rather than every user in the division.
 */
export function useSupervisionStaff(schoolId: string | number | null | undefined) {
  const [staff, setStaff] = useState<SupervisionStaff[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (schoolId == null) {
      setStaff([]);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("sms_users")
        .select("id, name, position, type")
        .eq("school_id", Number(schoolId))
        .eq("is_active", true)
        .order("name");
      if (!isMounted) return;
      if (error) {
        toast.error(error.message);
        setStaff([]);
      } else {
        setStaff(
          (data ?? []).map((row) => ({
            id: String(row.id),
            name: (row.name as string) ?? "",
            position: (row.position as string | null) ?? null,
            type: (row.type as string | null) ?? null,
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolId]);

  return { staff, loading };
}

/** Observers designated for a school year, newest designation last. */
export function useDesignatedObservers(
  schoolId: string | number | null | undefined,
  schoolYear: string,
) {
  const [observers, setObservers] = useState<SupervisionObserver[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (schoolId == null || !schoolYear) {
      setObservers([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_supervision_observers")
        .select("*")
        .eq("school_id", Number(schoolId))
        .eq("school_year", schoolYear)
        .order("created_at");
      if (error) throw new Error(error.message);
      setObservers((data ?? []) as SupervisionObserver[]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load observers.",
      );
      setObservers([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId, schoolYear]);

  useEffect(() => {
    load();
  }, [load]);

  return { observers, loading, reload: load };
}

interface ScheduleQuery {
  schoolId: string | number | null | undefined;
  schoolYear: string;
  /** Null = every term. */
  term?: number | null;
  /** Restrict to one teacher — the teacher-facing page passes their own id. */
  teacherId?: string | number | null;
}

/**
 * Schedules plus their observers and filed COT forms.
 *
 * Fetched as three queries rather than a nested select because the observer and
 * observation rows are needed keyed by schedule, and PostgREST embedding here
 * would still require the same regrouping on the client.
 */
export function useSupervisionSchedules(query: ScheduleQuery) {
  const { schoolId, schoolYear, term, teacherId } = query;
  const [bundles, setBundles] = useState<ScheduleBundle[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (schoolId == null || !schoolYear) {
      setBundles([]);
      return;
    }
    setLoading(true);
    try {
      let request = supabase
        .from("sms_supervision_schedules")
        .select("*")
        .eq("school_id", Number(schoolId))
        .eq("school_year", schoolYear);
      if (term != null) request = request.eq("term", term);
      if (teacherId != null) request = request.eq("teacher_id", Number(teacherId));

      const { data, error } = await request.order("observation_at", {
        ascending: true,
      });
      if (error) throw new Error(error.message);

      const schedules = (data ?? []) as SupervisionSchedule[];
      if (schedules.length === 0) {
        setBundles([]);
        return;
      }

      const ids = schedules.map((s) => Number(s.id));
      const [obsRes, cotRes] = await Promise.all([
        supabase
          .from("sms_supervision_schedule_observers")
          .select("*")
          .in("schedule_id", ids)
          .order("slot"),
        supabase.from("sms_cot_observations").select("*").in("schedule_id", ids),
      ]);
      if (obsRes.error) throw new Error(obsRes.error.message);
      if (cotRes.error) throw new Error(cotRes.error.message);

      const observersBySchedule = new Map<string, SupervisionScheduleObserver[]>();
      for (const row of (obsRes.data ?? []) as SupervisionScheduleObserver[]) {
        const key = String(row.schedule_id);
        const list = observersBySchedule.get(key);
        if (list) list.push(row);
        else observersBySchedule.set(key, [row]);
      }

      const cotBySchedule = new Map<string, CotObservation[]>();
      for (const row of (cotRes.data ?? []) as CotObservation[]) {
        const key = String(row.schedule_id);
        const list = cotBySchedule.get(key);
        if (list) list.push(row);
        else cotBySchedule.set(key, [row]);
      }

      setBundles(
        schedules.map((schedule) => ({
          schedule,
          observers: observersBySchedule.get(String(schedule.id)) ?? [],
          observations: cotBySchedule.get(String(schedule.id)) ?? [],
        })),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load observation schedules.",
      );
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId, schoolYear, term, teacherId]);

  useEffect(() => {
    load();
  }, [load]);

  return { bundles, loading, reload: load };
}

/** The saved indicator scores for one COT form, keyed by indicator code. */
export function useCotRatings(observationId: string | null) {
  const [ratings, setRatings] = useState<CotRating[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!observationId) {
      setRatings([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_cot_ratings")
        .select("*")
        .eq("observation_id", Number(observationId));
      if (error) throw new Error(error.message);
      setRatings((data ?? []) as CotRating[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load ratings.");
      setRatings([]);
    } finally {
      setLoading(false);
    }
  }, [observationId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ratings, loading, reload: load };
}
