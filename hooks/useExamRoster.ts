"use client";

/**
 * Section + learner lookups for the exam scanning workspace.
 *
 * Split out of the panels because the answer-sheet, scan and results tabs all
 * need the same roster and must agree on it exactly: the sheets are printed
 * from this list, the scans are matched against it, and the results are saved
 * for it. One query, one ordering, three consumers.
 *
 * Section visibility mirrors ItemAnalysisPanel — a teacher sees the sections
 * they are scheduled in, a super admin sees every section — so the scanning
 * pages expose nothing the item-analysis page did not already.
 */

import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export interface RosterSection {
  id: string;
  name: string;
  grade_level: number;
  school_id: number | null;
}

export interface RosterLearner {
  /** sms_students.id — the value bubble-encoded onto the answer sheet. */
  id: number;
  name: string;
  lrn: string | null;
}

/** Enrollment lifecycle states that still count as "in this section". */
const ACTIVE_ENROLLMENT_STATUSES = [
  "active",
  "promoted",
  "graduated",
  "retained",
  "completed",
];

export function useTeacherSections(
  schoolYear: string,
  teacherId: string | number | null,
  isSuperAdmin: boolean,
): { sections: RosterSection[]; loading: boolean } {
  const [sections, setSections] = useState<RosterSection[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!schoolYear || (!isSuperAdmin && !teacherId)) {
      setSections([]);
      return;
    }
    let active = true;
    setLoading(true);

    (async () => {
      if (isSuperAdmin) {
        const { data } = await supabase
          .from("sms_sections")
          .select("id, name, grade_level, school_id")
          .eq("school_year", schoolYear)
          .eq("is_active", true)
          .neq("grade_level", 0)
          .order("name");
        if (!active) return;
        setSections(
          (data ?? []).map((s) => ({
            id: String(s.id),
            name: s.name as string,
            grade_level: s.grade_level as number,
            school_id: s.school_id != null ? Number(s.school_id) : null,
          })),
        );
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("sms_subject_schedules")
        .select(
          "section_id, sections:section_id (id, name, grade_level, school_id)",
        )
        .eq("teacher_id", teacherId)
        .eq("school_year", schoolYear);
      if (!active) return;

      const seen = new Set<string>();
      const list: RosterSection[] = [];
      (data ?? []).forEach((row) => {
        const section = Array.isArray(row.sections)
          ? row.sections[0]
          : row.sections;
        if (!section || !row.section_id) return;
        const id = String(section.id);
        if (seen.has(id) || section.grade_level === 0) return;
        seen.add(id);
        list.push({
          id,
          name: section.name,
          grade_level: section.grade_level,
          school_id: section.school_id != null ? Number(section.school_id) : null,
        });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setSections(list);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [schoolYear, teacherId, isSuperAdmin]);

  return { sections, loading };
}

/**
 * Learners enrolled in a section for a school year, ordered by name — the same
 * order the answer sheets are printed in, so a teacher handing out a stack can
 * follow the class list.
 */
export function useSectionRoster(
  sectionId: string,
  schoolYear: string,
): { learners: RosterLearner[]; loading: boolean } {
  const [learners, setLearners] = useState<RosterLearner[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sectionId || !schoolYear) {
      setLearners([]);
      return;
    }
    let active = true;
    setLoading(true);

    (async () => {
      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .eq("section_id", Number(sectionId))
        .eq("school_year", schoolYear)
        .eq("status", "approved")
        .in("enrollment_status", ACTIVE_ENROLLMENT_STATUSES);

      const studentIds = (enrollments ?? []).map((e) => Number(e.student_id));
      if (!active) return;

      if (studentIds.length === 0) {
        setLearners([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("sms_students")
        .select("id, first_name, last_name, lrn")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");
      if (!active) return;

      setLearners(
        (data ?? []).map((s) => ({
          id: Number(s.id),
          name: `${s.last_name}, ${s.first_name}`,
          lrn: (s.lrn as string | null) ?? null,
        })),
      );
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [sectionId, schoolYear]);

  return { learners, loading };
}
