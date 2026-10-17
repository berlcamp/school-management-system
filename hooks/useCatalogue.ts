"use client";

import { supabase } from "@/lib/supabase/client";
import type { CatalogueCompetency, LearningArea } from "@/types";
import { useCallback, useEffect, useState } from "react";

/** The catalogue's learning areas (migration 195), alphabetical. */
export function useLearningAreas(includeRetired = false) {
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      let q = supabase.from("sms_learning_areas").select("*").order("name");
      if (!includeRetired) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (!isMounted) return;
      if (error) console.error(error);
      setAreas((data as LearningArea[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [includeRetired, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { areas, loading, reload };
}

/** Catalogue competencies of one learning area + grade, by LC code. */
export function useCatalogueCompetencies(
  areaId: string | null,
  gradeLevel: number | null,
  includeRetired = false,
) {
  const [competencies, setCompetencies] = useState<CatalogueCompetency[]>([]);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;
    if (!areaId || gradeLevel == null) {
      setCompetencies([]);
      return;
    }
    (async () => {
      setLoading(true);
      let q = supabase
        .from("sms_competency_catalogue")
        .select("*")
        .eq("learning_area_id", Number(areaId))
        .eq("grade_level", gradeLevel)
        .order("lc_code");
      if (!includeRetired) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (!isMounted) return;
      if (error) console.error(error);
      setCompetencies((data as CatalogueCompetency[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [areaId, gradeLevel, includeRetired, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { competencies, loading, reload };
}

/**
 * Which learning areas have active catalogue entries at each grade, so a TOS
 * picks its grade first and is offered only the areas taught at it.
 */
export function useAreasByGrade() {
  const [byGrade, setByGrade] = useState<Map<number, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const next = new Map<number, Set<string>>();
      // Paged: PostgREST caps a response at 1000 rows.
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("sms_competency_catalogue")
          .select("learning_area_id, grade_level")
          .eq("is_active", true)
          .order("id")
          .range(from, from + 999);
        if (!isMounted) return;
        if (error) {
          console.error(error);
          break;
        }
        for (const r of (data ?? []) as { learning_area_id: number; grade_level: number }[]) {
          let set = next.get(r.grade_level);
          if (!set) next.set(r.grade_level, (set = new Set()));
          set.add(String(r.learning_area_id));
        }
        if (!data || data.length < 1000) break;
      }
      if (!isMounted) return;
      setByGrade(next);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  return { byGrade, loading };
}
