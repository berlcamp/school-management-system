"use client";

import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { ECCD_DIVISION } from "@/lib/constants/eccd";
import { ENROLLED_LIFECYCLE_STATUSES } from "@/lib/constants/enrollment";
import { letterheadRegion } from "@/lib/constants/letterhead";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  aggregateGrade1Attendance,
  type MonthAttendance,
} from "@/lib/utils/grade1Workbook";
import { sortLearnersBySex } from "@/lib/utils/learnerSex";
import { fetchSchoolCalendar } from "@/lib/utils/schoolCalendar";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import type { PaceArea, PaceCompetency, PaceRating, PaceTerm } from "@/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

/**
 * Everything the Grade 1 workbook page shows, loaded once for the section.
 *
 * Ratings and narratives are the same `sms_pace_ratings` /
 * `sms_grade1_progress_narratives` rows the per-learner PACE form writes
 * (migration 180) — the class sheets are a second way into that data, not a
 * copy of it, so a rating typed on either screen is on both and on the print.
 */

export interface WorkbookLearner {
  id: string;
  name: string;
  lrn: string | null;
  dateOfBirth: string | null;
  gender: string | null;
}

export interface WorkbookInfo {
  region: string;
  division: string;
  city: string;
  district: string;
  schoolCode: string;
  schoolName: string;
  schoolYear: string;
  schoolHead: string;
  adviserName: string;
  sectionName: string;
  schoolId: string;
}

export type NarrativeKey = "can_do" | "to_improve";
type NarrativeValue = Record<NarrativeKey, string>;

const NARRATIVE_SAVE_DELAY_MS = 800;

export const ratingKey = (studentId: string, competencyId: string, term: PaceTerm) =>
  `${studentId}:${competencyId}:${term}`;
export const narrativeKey = (studentId: string, term: PaceTerm) => `${studentId}:${term}`;

export function useGrade1Workbook(sectionId: string) {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<WorkbookInfo | null>(null);
  const [learners, setLearners] = useState<WorkbookLearner[]>([]);
  const [areas, setAreas] = useState<PaceArea[]>([]);
  const [competencies, setCompetencies] = useState<PaceCompetency[]>([]);
  const [ratings, setRatings] = useState<Record<string, PaceRating>>({});
  const [narratives, setNarratives] = useState<Record<string, NarrativeValue>>({});
  const [attendance, setAttendance] = useState<Record<string, MonthAttendance[]>>({});
  const [savingCount, setSavingCount] = useState(0);

  const isMounted = useRef(true);
  const narrativesRef = useRef(narratives);
  narrativesRef.current = narratives;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const schoolYear = info?.schoolYear ?? "";
  const { settings, isLoading: settingsLoading } = useSchoolSettings(true, user?.school_id);
  const yearLocked =
    !!schoolYear &&
    schoolYear !== getCurrentSchoolYear() &&
    !settings.allow_edit_previous_school_year;
  const isLocked = yearLocked || settingsLoading;

  useEffect(() => {
    isMounted.current = true;
    const pending = timers.current;
    return () => {
      isMounted.current = false;
      Object.values(pending).forEach(clearTimeout);
    };
  }, []);

  /** `silent` refreshes in place, without the page-level spinner. */
  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      // Same access rule as the section page: the adviser, or a super admin
      // within their active school.
      const isSuperAdmin = user.type === "super admin";
      let sectionQuery = supabase
        .from("sms_sections")
        .select("id, name, school_id, school_year, grade_level, section_adviser_id")
        .eq("id", sectionId)
        .eq("is_active", true);
      if (isSuperAdmin) {
        if (user.school_id != null) {
          sectionQuery = sectionQuery.eq("school_id", Number(user.school_id));
        }
      } else {
        sectionQuery = sectionQuery.eq("section_adviser_id", user.system_user_id);
      }
      const { data: section } = await sectionQuery.single();
      if (!section || Number(section.grade_level) !== 1) {
        router.replace(section ? `/teacher/sections/${sectionId}` : "/teacher/sections");
        return;
      }
      const sy = section.school_year as string;
      const schoolId = String(section.school_id);

      const [schoolRes, adviserRes, enrollRes, areasRes, compsRes, ratingsRes, narrRes, attRes, calendar, schoolSettings] =
        await Promise.all([
          supabase
            .from("sms_schools")
            .select("name, school_id, region, district, municipality_city")
            .eq("id", schoolId)
            .single(),
          section.section_adviser_id
            ? supabase.from("sms_users").select("name").eq("id", section.section_adviser_id).single()
            : Promise.resolve({ data: null }),
          supabase
            .from("sms_enrollments")
            .select(
              "student:sms_students!sms_enrollments_student_id_fkey(id, first_name, middle_name, last_name, suffix, lrn, date_of_birth, gender)",
            )
            .eq("section_id", sectionId)
            .eq("school_year", sy)
            .eq("status", "approved")
            // A learner who has left the school is off the class sheets, as
            // on the per-learner PACE page.
            .in("enrollment_status", ENROLLED_LIFECYCLE_STATUSES),
          supabase.from("sms_pace_areas").select("*").eq("is_active", true).order("sort_order"),
          supabase.from("sms_pace_competencies").select("*").eq("is_active", true).order("sort_order"),
          supabase
            .from("sms_pace_ratings")
            .select("student_id, competency_id, term, rating")
            .eq("section_id", sectionId)
            .eq("school_year", sy),
          supabase
            .from("sms_grade1_progress_narratives")
            .select("student_id, term, can_do, to_improve")
            .eq("section_id", sectionId)
            .eq("school_year", sy),
          supabase
            .from("sms_attendance")
            .select("student_id, date, am_present, pm_present")
            .eq("section_id", sectionId)
            .eq("school_year", sy),
          fetchSchoolCalendar(schoolId, sy),
          fetchSchoolSettings(schoolId),
        ]);

      type StudentRow = {
        id: number | string;
        first_name: string;
        middle_name: string | null;
        last_name: string;
        suffix: string | null;
        lrn: string | null;
        date_of_birth: string | null;
        gender: string | null;
      };
      const students = (enrollRes.data || [])
        .map((e) => (Array.isArray(e.student) ? e.student[0] : e.student) as StudentRow | null)
        .filter((s): s is StudentRow => !!s)
        .sort(
          (a, b) =>
            a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
        );
      const learnerRows = sortLearnersBySex(
        students.map((s) => ({
          id: String(s.id),
          name: `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`
            .replace(/\s+/g, " ")
            .trim(),
          lrn: s.lrn,
          dateOfBirth: s.date_of_birth,
          gender: s.gender,
        })),
        (l) => l.gender,
      );

      const ratingMap: Record<string, PaceRating> = {};
      (ratingsRes.data || []).forEach((r) => {
        ratingMap[ratingKey(String(r.student_id), String(r.competency_id), r.term as PaceTerm)] =
          r.rating as PaceRating;
      });

      const narrMap: Record<string, NarrativeValue> = {};
      (narrRes.data || []).forEach((n) => {
        narrMap[narrativeKey(String(n.student_id), n.term as PaceTerm)] = {
          can_do: (n.can_do as string) ?? "",
          to_improve: (n.to_improve as string) ?? "",
        };
      });

      const recordsByStudent: Record<string, { date: string; am_present: boolean | null; pm_present: boolean | null }[]> = {};
      (attRes.data || []).forEach((r) => {
        (recordsByStudent[String(r.student_id)] ??= []).push(r);
      });
      const attMap: Record<string, MonthAttendance[]> = {};
      learnerRows.forEach((l) => {
        attMap[l.id] = aggregateGrade1Attendance(recordsByStudent[l.id] || [], calendar, sy);
      });

      const school = schoolRes.data;
      if (!isMounted.current) return;
      setInfo({
        region: letterheadRegion(school?.region),
        division: ECCD_DIVISION,
        city: school?.municipality_city || "",
        district: school?.district || "",
        schoolCode: school?.school_id || "",
        schoolName: school?.name || "",
        schoolYear: sy,
        schoolHead: schoolSettings.principal_name || "",
        adviserName: (adviserRes.data as { name?: string } | null)?.name || "",
        sectionName: section.name as string,
        schoolId,
      });
      setLearners(learnerRows);
      setAreas((areasRes.data || []) as PaceArea[]);
      setCompetencies((compsRes.data || []) as PaceCompetency[]);
      setRatings(ratingMap);
      setNarratives(narrMap);
      setAttendance(attMap);
    } catch (err) {
      console.error("Error loading the Grade 1 workbook:", err);
      toast.error("Failed to load the Grade 1 workbook");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [user, sectionId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  const track = useCallback(async (run: () => Promise<void>) => {
    setSavingCount((n) => n + 1);
    try {
      await run();
    } finally {
      if (isMounted.current) setSavingCount((n) => n - 1);
    }
  }, []);

  /**
   * Clearing a rating DELETEs the row rather than writing an empty one: the
   * printed form shows a blank cell for "not yet rated" (migration 180).
   */
  const setRating = useCallback(
    (studentId: string, competencyId: string, term: PaceTerm, value: PaceRating | "") => {
      if (!info) return;
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return;
      }
      const key = ratingKey(studentId, competencyId, term);
      const previous = ratings[key] ?? "";
      if (previous === value) return;

      setRatings((prev) => {
        const next = { ...prev };
        if (value) next[key] = value;
        else delete next[key];
        return next;
      });

      void track(async () => {
        const { error } = value
          ? await supabase.from("sms_pace_ratings").upsert(
              {
                student_id: studentId,
                competency_id: competencyId,
                section_id: sectionId,
                school_id: Number(info.schoolId),
                school_year: info.schoolYear,
                term,
                rating: value,
                assessed_by: user?.system_user_id ?? null,
              },
              { onConflict: "student_id,competency_id,section_id,school_year,term" },
            )
          : await supabase
              .from("sms_pace_ratings")
              .delete()
              .eq("student_id", studentId)
              .eq("competency_id", competencyId)
              .eq("section_id", sectionId)
              .eq("school_year", info.schoolYear)
              .eq("term", term);
        if (error) {
          console.error("PACE rating save error:", error);
          toast.error("Failed to save. Please try again.");
          if (isMounted.current) {
            setRatings((prev) => {
              const next = { ...prev };
              if (previous) next[key] = previous;
              else delete next[key];
              return next;
            });
          }
        }
      });
    },
    [info, ratings, sectionId, track, user?.system_user_id, yearLocked],
  );

  /**
   * "Fill blanks with B": one letter into every EMPTY cell of a column, in one
   * request. Never overwrites a rating already given — that is what makes it
   * safe to offer as a one-click action.
   */
  const fillBlanks = useCallback(
    (competencyId: string, term: PaceTerm, value: PaceRating, studentIds: string[]) => {
      if (!info) return 0;
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return 0;
      }
      const blanks = studentIds.filter((id) => !ratings[ratingKey(id, competencyId, term)]);
      if (blanks.length === 0) return 0;

      setRatings((prev) => {
        const next = { ...prev };
        blanks.forEach((id) => (next[ratingKey(id, competencyId, term)] = value));
        return next;
      });

      void track(async () => {
        const { error } = await supabase.from("sms_pace_ratings").upsert(
          blanks.map((id) => ({
            student_id: id,
            competency_id: competencyId,
            section_id: sectionId,
            school_id: Number(info.schoolId),
            school_year: info.schoolYear,
            term,
            rating: value,
            assessed_by: user?.system_user_id ?? null,
          })),
          { onConflict: "student_id,competency_id,section_id,school_year,term" },
        );
        if (error) {
          console.error("PACE bulk fill error:", error);
          toast.error("Failed to fill the column. Please try again.");
          if (isMounted.current) {
            setRatings((prev) => {
              const next = { ...prev };
              blanks.forEach((id) => delete next[ratingKey(id, competencyId, term)]);
              return next;
            });
          }
        }
      });
      return blanks.length;
    },
    [info, ratings, sectionId, track, user?.system_user_id, yearLocked],
  );

  const setNarrative = useCallback(
    (studentId: string, term: PaceTerm, field: NarrativeKey, value: string) => {
      if (!info) return;
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return;
      }
      const key = narrativeKey(studentId, term);
      const updated = {
        can_do: narrativesRef.current[key]?.can_do ?? "",
        to_improve: narrativesRef.current[key]?.to_improve ?? "",
        [field]: value,
      } as NarrativeValue;
      narrativesRef.current = { ...narrativesRef.current, [key]: updated };
      setNarratives(narrativesRef.current);

      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        // Send both fields from the latest state: the row is unique per
        // (learner, section, year, term) and an upsert of one column would
        // blank the other.
        const current = narrativesRef.current[key];
        void track(async () => {
          const { error } = await supabase.from("sms_grade1_progress_narratives").upsert(
            {
              student_id: studentId,
              section_id: sectionId,
              school_id: Number(info.schoolId),
              school_year: info.schoolYear,
              term,
              can_do: current.can_do,
              to_improve: current.to_improve,
              created_by: user?.system_user_id ?? null,
            },
            { onConflict: "student_id,section_id,school_year,term" },
          );
          if (error) {
            console.error("Grade 1 narrative save error:", error);
            toast.error("Failed to save the narrative");
          }
        });
      }, NARRATIVE_SAVE_DELAY_MS);
    },
    [info, sectionId, track, user?.system_user_id, yearLocked],
  );

  return {
    loading,
    info,
    learners,
    areas,
    competencies,
    ratings,
    narratives,
    attendance,
    saving: savingCount > 0,
    isLocked,
    yearLocked,
    setRating,
    fillBlanks,
    setNarrative,
    reload,
  };
}
