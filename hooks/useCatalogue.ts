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
