"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import type { Student } from "@/types";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export interface AdvisoryLearnerRow extends Student {
  section_id: string | null;
  section_name: string | null;
  section_grade_level: number | null;
}

/**
 * Loads the learners in the signed-in teacher's advisory section(s) for a
 * school year, joined with section name/grade and sorted by learner name.
 * School heads / super admins see every active section in their school.
 *
 * Class-adviser analogue of the tutor `useTutorLearners` hook — shared by the
 * Anecdotal Record and Learner Cardex pages.
 */
export function useAdvisoryLearners(schoolYear: string) {
  const user = useAppSelector((state) => state.user.user);
  const [rows, setRows] = useState<AdvisoryLearnerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      // Sections the teacher advises. School heads / super admins see all
      // active sections in their school (mirrors teacher/sections/page.tsx).
      const seesAllSections =
        user.type === "super admin" ||
        user.type === "school_head" ||
        user.type === "assistant_school_head";

      let sectionQuery = supabase
        .from("sms_sections")
        .select("id, name, grade_level")
        .eq("is_active", true)
        .eq("school_year", schoolYear);

      if (seesAllSections) {
        if (user.school_id != null) {
          sectionQuery = sectionQuery.eq("school_id", Number(user.school_id));
        }
      } else {
        sectionQuery = sectionQuery.eq(
          "section_adviser_id",
          user.system_user_id,
        );
      }

      const { data: sections, error: sectionErr } = await sectionQuery;
      if (sectionErr) throw new Error(sectionErr.message);

      const sectionList = (sections || []) as {
        id: string;
        name: string;
        grade_level: number;
      }[];
      if (sectionList.length === 0) {
        setRows([]);
        return;
      }
      const sectionById = new Map(sectionList.map((s) => [String(s.id), s]));
      const sectionIds = sectionList.map((s) => s.id);

      // Approved enrollments in those sections for the school year.
      const { data: enrollments, error: enrollErr } = await supabase
        .from("sms_enrollments")
        .select("student_id, section_id")
        .in("section_id", sectionIds)
        .eq("school_year", schoolYear)
        .eq("status", "approved");
      if (enrollErr) throw new Error(enrollErr.message);

      const enrollList = (enrollments || []) as {
        student_id: string;
        section_id: string;
      }[];
      if (enrollList.length === 0) {
        setRows([]);
        return;
      }
      const sectionByStudent = new Map(
        enrollList.map((e) => [String(e.student_id), String(e.section_id)]),
      );
      const studentIds = [...new Set(enrollList.map((e) => e.student_id))];

      const { data: students, error: studentErr } = await supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds);
      if (studentErr) throw new Error(studentErr.message);

      const enriched = ((students || []) as Student[])
        .map((s) => {
          const sectionId = sectionByStudent.get(String(s.id)) ?? null;
          const section = sectionId ? sectionById.get(sectionId) : null;
          return {
            ...s,
            section_id: sectionId,
            section_name: section?.name ?? null,
            section_grade_level: section?.grade_level ?? null,
          };
        })
        .sort((a, b) =>
          `${a.last_name}, ${a.first_name}`.localeCompare(
            `${b.last_name}, ${b.first_name}`,
          ),
        );

      setRows(enriched);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load learners.",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.system_user_id, user?.type, user?.school_id, schoolYear]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    rows,
    loading,
    reload: load,
    schoolId: user?.school_id ?? null,
    userId: user?.system_user_id ?? null,
  };
}

export function advisoryLearnerName(row: {
  last_name: string;
  first_name: string;
  middle_name?: string | null;
  suffix?: string | null;
}): string {
  const mid = row.middle_name ? ` ${row.middle_name}` : "";
  const suffix = row.suffix ? ` ${row.suffix}` : "";
  return `${row.last_name}, ${row.first_name}${mid}${suffix}`.trim();
}
