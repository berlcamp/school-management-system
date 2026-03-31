"use client";

import { supabase } from "@/lib/supabase/client";
import {
  calculateBookAvailability,
  type BookAvailabilityRow,
  type BookAvailabilitySummary,
} from "@/lib/utils/books";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

// ─── Shared types ────────────────────────────────────────────

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
  school_id?: string | null;
}

interface StudentOption {
  id: string;
  fullName: string;
}

interface BookOption {
  id: string;
  title: string;
  subject_area: string;
  grade_level: number;
  available?: number;
}

interface IssuanceRow {
  id: string;
  student_id: string;
  book_id: string;
  section_id: string;
  school_year: string;
  date_issued: string;
  date_returned?: string | null;
  issued_by?: string | number | null;
  condition_on_return?: string | null;
  return_code?: string | null;
  remarks?: string | null;
  book?: { id: string; title: string; subject_area: string };
  student?: {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    gender: string;
  };
  section?: { id: string; name: string; grade_level: number };
}

interface HeldIssuance {
  id: string;
  student_id: string;
  book_id: string;
  date_returned: string;
  book?: { id: string; title: string; subject_area: string };
  student?: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
  };
}

// ─── useSections ─────────────────────────────────────────────

/**
 * Fetch sections for a school/year.
 * When `teacherId` is provided, returns only sections where the teacher
 * is adviser or has subject schedules.
 */
export function useSections(
  schoolId: string,
  schoolYear: string,
  teacherId?: number | null,
) {
  const [data, setData] = useState<SectionOption[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!schoolId) {
      setData([]);
      return;
    }

    setLoading(true);

    if (teacherId) {
      // Teacher flow: adviser sections + schedule sections
      const [adviserResult, scheduleResult] = await Promise.all([
        supabase
          .from("sms_sections")
          .select("id, name, grade_level")
          .eq("section_adviser_id", teacherId)
          .eq("school_id", schoolId)
          .eq("school_year", schoolYear)
          .eq("is_active", true)
          .order("grade_level")
          .order("name"),
        supabase
          .from("sms_subject_schedules")
          .select("section_id")
          .eq("teacher_id", teacherId)
          .eq("school_year", schoolYear),
      ]);

      const sectionIds = new Set<string>();
      (adviserResult.data || []).forEach((s) => sectionIds.add(s.id));
      (scheduleResult.data || []).forEach((s) =>
        sectionIds.add(String(s.section_id)),
      );

      if (sectionIds.size === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const { data: sectionList } = await supabase
        .from("sms_sections")
        .select("id, name, grade_level")
        .in("id", Array.from(sectionIds))
        .eq("school_year", schoolYear)
        .eq("is_active", true)
        .order("grade_level")
        .order("name");

      setData((sectionList || []) as SectionOption[]);
    } else {
      // Manager flow: all active sections for the school
      const { data: sections } = await supabase
        .from("sms_sections")
        .select("id, name, grade_level, school_id")
        .eq("school_id", schoolId)
        .eq("school_year", schoolYear)
        .eq("is_active", true)
        .order("grade_level")
        .order("name");

      setData(sections || []);
    }

    setLoading(false);
  }, [schoolId, schoolYear, teacherId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refetch };
}

// ─── useEnrolledStudents ─────────────────────────────────────

/** Fetch enrolled students for a section, formatted with fullName */
export function useEnrolledStudents(
  sectionId: string,
  schoolYear: string,
  schoolId: string,
) {
  const [data, setData] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!sectionId || !schoolId) {
      setData([]);
      return;
    }

    setLoading(true);

    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("student_id")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("status", "approved");

    const ids = [...new Set((enrollments || []).map((e) => e.student_id))];
    if (ids.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }

    const { data: studentList } = await supabase
      .from("sms_students")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", ids)
      .order("last_name")
      .order("first_name");

    setData(
      (studentList || []).map((s) => ({
        id: s.id,
        fullName:
          `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`.trim(),
      })),
    );
    setLoading(false);
  }, [sectionId, schoolYear, schoolId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refetch };
}

// ─── useBooksByGradeLevel ────────────────────────────────────

/** Fetch active books for a given grade level (manager flow) */
export function useBooksByGradeLevel(schoolId: string, gradeLevel: number) {
  const [data, setData] = useState<BookOption[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!schoolId || !gradeLevel) {
      setData([]);
      return;
    }

    setLoading(true);
    const bookGradeLevel = gradeLevel <= 0 ? 1 : gradeLevel;

    const { data: bookList } = await supabase
      .from("sms_books")
      .select("id, title, subject_area, grade_level")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .eq("grade_level", bookGradeLevel)
      .order("subject_area")
      .order("title");

    setData(
      (bookList || []).map((b) => ({
        id: b.id,
        title: b.title,
        subject_area: b.subject_area,
        grade_level: b.grade_level,
      })),
    );
    setLoading(false);
  }, [schoolId, gradeLevel]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refetch };
}

// ─── useTeacherAllocations ───────────────────────────────────

/** Fetch teacher allocations with computed availability */
export function useTeacherAllocations(
  teacherId: number | undefined,
  schoolYear: string,
) {
  const [rows, setRows] = useState<BookAvailabilityRow[]>([]);
  const [summary, setSummary] = useState<BookAvailabilitySummary>({
    totalAllocated: 0,
    withStudents: 0,
    held: 0,
    available: 0,
  });
  const [loading, setLoading] = useState(true);

  const emptySummary: BookAvailabilitySummary = {
    totalAllocated: 0,
    withStudents: 0,
    held: 0,
    available: 0,
  };

  const refetch = useCallback(async () => {
    if (!teacherId) {
      setRows([]);
      setSummary(emptySummary);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [allocResult, issuancesResult] = await Promise.all([
      supabase
        .from("sms_book_allocations")
        .select(
          `
          id,
          quantity,
          book:sms_books(id, title, subject_area, grade_level)
        `,
        )
        .eq("teacher_id", teacherId)
        .eq("school_year", schoolYear),
      supabase
        .from("sms_book_issuances")
        .select("book_id, date_returned, returned_to_manager_at")
        .eq("issued_by", teacherId)
        .eq("school_year", schoolYear),
    ]);

    if (allocResult.error || !allocResult.data?.length) {
      setRows([]);
      setSummary(emptySummary);
      setLoading(false);
      return;
    }

    const allocations = allocResult.data.map((a) => ({
      id: String(a.id),
      quantity: (a as { quantity: number }).quantity,
      book: Array.isArray(a.book) ? a.book[0] : a.book,
    }));

    const { rows: computedRows, summary: computedSummary } =
      calculateBookAvailability(allocations, issuancesResult.data ?? []);

    setRows(computedRows);
    setSummary(computedSummary);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, schoolYear]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { rows, summary, loading, refetch };
}

// ─── useIssuances ────────────────────────────────────────────

/** Fetch issuance records with joined book/student/section data */
export function useIssuances(sectionId: string, schoolYear: string) {
  const [data, setData] = useState<IssuanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!sectionId) {
      setData([]);
      return;
    }

    setLoading(true);
    const { data: issuances, error } = await supabase
      .from("sms_book_issuances")
      .select(
        `
        *,
        book:sms_books(id, title, subject_area),
        student:sms_students!sms_book_issuances_student_id_fkey(id, first_name, middle_name, last_name, suffix, gender),
        section:sms_sections!sms_book_issuances_section_id_fkey(id, name, grade_level)
      `,
      )
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .order("date_issued", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Failed to load issuances");
      setData([]);
    } else {
      setData(issuances || []);
    }
    setLoading(false);
  }, [sectionId, schoolYear]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refetch };
}

// ─── useHeldIssuances ────────────────────────────────────────

/** Fetch books returned by students but not yet returned to manager */
export function useHeldIssuances(
  teacherId: number | undefined,
  schoolYear: string,
) {
  const [data, setData] = useState<HeldIssuance[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!teacherId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data: issuances, error } = await supabase
      .from("sms_book_issuances")
      .select(
        `
        id,
        student_id,
        book_id,
        date_returned,
        book:sms_books(id, title, subject_area),
        student:sms_students!sms_book_issuances_student_id_fkey(first_name, middle_name, last_name, suffix)
      `,
      )
      .eq("issued_by", teacherId)
      .eq("school_year", schoolYear)
      .not("date_returned", "is", null)
      .is("returned_to_manager_at", null)
      .order("date_returned", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Failed to load held books");
      setData([]);
    } else {
      const normalized = (issuances || []).map(
        (r: Record<string, unknown>) => ({
          ...r,
          book: Array.isArray(r.book) ? r.book[0] : r.book,
          student: Array.isArray(r.student) ? r.student[0] : r.student,
        }),
      );
      setData(normalized as HeldIssuance[]);
    }
    setLoading(false);
  }, [teacherId, schoolYear]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refetch };
}

// Re-export types for consumers
export type {
  SectionOption,
  StudentOption,
  BookOption,
  IssuanceRow,
  HeldIssuance,
};
