"use client";

import {
  selectableProgramsFor,
  specializationsOf,
  type SpecialProgram,
  type SpecialProgramSpecialization,
} from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

/**
 * The special programs a school may use, and their strands (migration 179).
 *
 * Reads both tables whole rather than filtering by school in the query: a
 * division-wide row has a NULL `school_id` and is usable by everyone, so the
 * scope rule lives in `selectableProgramsFor` where it can be read in one
 * place. Both tables are small — a division has a handful of programs — and
 * RLS makes every row readable to any authenticated user anyway.
 *
 * `selectable` is what a picker should offer. `programs` and `specializations`
 * are the complete sets, including retired rows, so a subject tagged to a
 * program the school has since deactivated still resolves its own label.
 */
export function useSpecialPrograms() {
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id ?? null;

  const [programs, setPrograms] = useState<SpecialProgram[]>([]);
  const [specializations, setSpecializations] = useState<
    SpecialProgramSpecialization[]
  >([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: programData }, { data: strandData }] = await Promise.all([
        supabase
          .from("sms_special_programs")
          .select("*")
          .order("name", { ascending: true }),
        supabase
          .from("sms_special_program_specializations")
          .select("*")
          .order("name", { ascending: true }),
      ]);
      setPrograms((programData || []) as SpecialProgram[]);
      setSpecializations(
        (strandData || []) as SpecialProgramSpecialization[],
      );
    } catch (err) {
      console.error("Special programs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    // The listSlice convention: never setState after unmount.
    (async () => {
      if (!mounted) return;
      await fetchAll();
    })();
    return () => {
      mounted = false;
    };
  }, [fetchAll]);

  return {
    programs,
    specializations,
    /** Active programs this school may tag a subject with. */
    selectable: selectableProgramsFor(programs, schoolId),
    /** The active strands of one program, in name order. */
    strandsOf: (programId: string | null | undefined) =>
      specializationsOf(specializations, programId),
    loading,
    refresh: fetchAll,
  };
}
