"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import type { AralEnrollment, Student } from "@/types";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export interface TutorLearnerRow extends AralEnrollment {
  student: Student | null;
  sectionName: string | null;
}

/**
 * Loads the ARAL learners assigned to the signed-in tutor for a school year,
 * joined with student + section name and sorted by learner name. Shared by the
 * tutor "My Learners", "Attendance", and "Progress Tracker" pages.
 */
export function useTutorLearners(schoolYear: string) {
  const user = useAppSelector((state) => state.user.user);
  const [rows, setRows] = useState<TutorLearnerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.system_user_id) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data: enrollments, error } = await supabase
        .from("sms_aral_enrollments")
        .select("*")
        .eq("tutor_id", Number(user.system_user_id))
        .eq("school_year", schoolYear)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const list = (enrollments || []) as AralEnrollment[];

      const studentById = new Map<string, Student>();
      const sectionNames = new Map<string, string>();
      if (list.length > 0) {
        const { data: students } = await supabase
          .from("sms_students")
          .select("*")
          .in(
            "id",
            list.map((e) => e.student_id),
          );
        ((students || []) as Student[]).forEach((s) =>
          studentById.set(String(s.id), s),
        );
        const sectionIds = [
          ...new Set(
            list
              .map((e) => e.section_id)
              .filter((id): id is string => id != null),
          ),
        ];
        if (sectionIds.length > 0) {
          const { data: sections } = await supabase
            .from("sms_sections")
            .select("id, name")
            .in("id", sectionIds);
          (sections || []).forEach((s) =>
            sectionNames.set(String(s.id), s.name as string),
          );
        }
      }

      setRows(
        list
          .map((e) => ({
            ...e,
            student: studentById.get(String(e.student_id)) ?? null,
            sectionName:
              e.section_id != null
                ? (sectionNames.get(String(e.section_id)) ?? null)
                : null,
          }))
          .sort((a, b) => {
            const an = a.student
              ? `${a.student.last_name}, ${a.student.first_name}`
              : "";
            const bn = b.student
              ? `${b.student.last_name}, ${b.student.first_name}`
              : "";
            return an.localeCompare(bn);
          }),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load learners.",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.system_user_id, schoolYear]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    rows,
    loading,
    reload: load,
    tutorId: user?.system_user_id ? Number(user.system_user_id) : null,
    schoolId: user?.school_id ?? null,
  };
}

export function learnerName(row: TutorLearnerRow): string {
  return row.student
    ? `${row.student.last_name}, ${row.student.first_name}`
    : `Student #${row.student_id}`;
}
