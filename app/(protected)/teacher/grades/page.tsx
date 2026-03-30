"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { Award, Info } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TeacherGradeEntryTable } from "../components/TeacherGradeEntryTable";

export default function Page() {
  const searchParams = useSearchParams();
  const [subjects, setSubjects] = useState<
    Array<{
      id: string;
      name: string;
      section_id: string;
      section_name: string;
      is_madrasah: boolean;
    }>
  >([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>("");
  const [hasKinderSection, setHasKinderSection] = useState(false);
  const user = useAppSelector((state) => state.user.user);

  const fetchSubjects = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear) {
      setSubjects([]);
      setSelectedSubject("");
      return;
    }

    // Get subjects from schedules where teacher is assigned (only graded subjects)
    const { data: schedules } = await supabase
      .from("sms_subject_schedules")
      .select(
        `
        subject_id,
        section_id,
        subjects:subject_id (id, name, is_graded, is_madrasah),
        sections:section_id (id, name, grade_level)
      `
      )
      .eq("teacher_id", user.system_user_id)
      .eq("school_year", schoolYear);

    const subjectMap = new Map<
      string,
      { id: string; name: string; section_id: string; section_name: string; is_madrasah: boolean }
    >();

    schedules?.forEach((schedule) => {
      if (schedule.subjects && schedule.sections && schedule.section_id) {
        const subject = Array.isArray(schedule.subjects)
          ? schedule.subjects[0]
          : schedule.subjects;
        const section = Array.isArray(schedule.sections)
          ? schedule.sections[0]
          : schedule.sections;

        // Skip subjects that don't require grading
        if (subject.is_graded === false) return;

        // Skip Kindergarten sections — they use ECCD Checklist instead
        if (section.grade_level === 0) return;

        // Create unique key: subject_id + section_id to handle same subject in multiple sections
        const key = `${subject.id}_${schedule.section_id}`;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            id: subject.id,
            name: subject.name,
            section_id: schedule.section_id,
            section_name: section.name,
            is_madrasah: subject.is_madrasah ?? false,
          });
        }
      }
    });

    // Check if teacher advises any Kindergarten sections
    const hasKinder = schedules?.some((schedule) => {
      const section = Array.isArray(schedule.sections)
        ? schedule.sections[0]
        : schedule.sections;
      return section && section.grade_level === 0;
    });
    setHasKinderSection(!!hasKinder);

    const subjectsList = Array.from(subjectMap.values());
    setSubjects(subjectsList);

    // Reset selected subject if it's not in the new list
    setSelectedSubject((prev) => {
      if (prev) {
        const [subjectId, sectionId] = prev.split("_");
        const exists = subjectsList.some(
          (s) => s.id === subjectId && s.section_id === sectionId
        );
        if (!exists) {
          return "";
        }
      }
      return prev;
    });
  }, [user, schoolYear]);

  // Initialize from URL params if available
  useEffect(() => {
    const urlSubject = searchParams.get("subject");
    const urlSchoolYear = searchParams.get("schoolYear");

    const currentYear = urlSchoolYear || getCurrentSchoolYear();
    setSchoolYear(currentYear);

    if (urlSubject) {
      setSelectedSubject(urlSubject);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Award className="h-5 w-5" />
          Grade Entry
        </h1>
      </div>
      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Enter Student Grades</CardTitle>
            <CardDescription>
              Select subject to enter grades for all quarters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasKinderSection && (
              <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/50">
                <Info className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-200">
                    Kindergarten uses the ECCD Checklist
                  </p>
                  <p className="text-blue-700 dark:text-blue-300 mt-0.5">
                    Kindergarten learners are assessed using the Revised Philippine ECCD Checklist, not numeric grades.{" "}
                    <Link
                      href="/teacher/eccd"
                      className="underline font-medium hover:text-blue-900 dark:hover:text-blue-100"
                    >
                      Go to ECCD Checklist
                    </Link>
                  </p>
                </div>
              </div>
            )}
            {schoolYear &&
              user?.system_user_id && (
                <TeacherGradeEntryTable
                  key={`${selectedSubject}-${schoolYear}`}
                  schoolYear={schoolYear}
                  setSchoolYear={setSchoolYear}
                  subjects={subjects}
                  selectedSubject={selectedSubject}
                  setSelectedSubject={setSelectedSubject}
                  schoolYearOptions={getSchoolYearOptions()}
                  teacherId={user.system_user_id}
                  user={user}
                />
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
