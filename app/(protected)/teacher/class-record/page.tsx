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
  isTermBasedSchoolYear,
} from "@/lib/utils/schoolYear";
import { BookOpenCheck, Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ClassRecordTable } from "./components/ClassRecordTable";

export interface ClassRecordSubjectOption {
  id: string;
  name: string;
  section_id: string;
  section_name: string;
  grade_level: number;
  is_madrasah: boolean;
}

export default function Page() {
  const [subjects, setSubjects] = useState<ClassRecordSubjectOption[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>("");
  const user = useAppSelector((state) => state.user.user);

  const fetchSubjects = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear) {
      setSubjects([]);
      setSelectedSubject("");
      return;
    }

    // Super admins can access every section's class record for testing.
    // They see all schedules for the active school; regular teachers only
    // see the sections they are assigned to.
    const isSuperAdmin = user.type === "super admin";

    let query = supabase
      .from("sms_subject_schedules")
      .select(
        `
        subject_id,
        section_id,
        subjects:subject_id (id, name, is_graded, is_madrasah),
        sections:section_id (id, name, grade_level)
      `
      )
      .eq("school_year", schoolYear);

    if (isSuperAdmin) {
      if (user.school_id) {
        query = query.eq("school_id", Number(user.school_id));
      }
    } else {
      query = query.eq("teacher_id", user.system_user_id);
    }

    const { data: schedules } = await query;

    const subjectMap = new Map<string, ClassRecordSubjectOption>();

    schedules?.forEach((schedule) => {
      if (schedule.subjects && schedule.sections && schedule.section_id) {
        const subject = Array.isArray(schedule.subjects)
          ? schedule.subjects[0]
          : schedule.subjects;
        const section = Array.isArray(schedule.sections)
          ? schedule.sections[0]
          : schedule.sections;

        if (subject.is_graded === false) return;
        if (section.grade_level === 0) return; // Kindergarten uses ECCD

        const key = `${subject.id}_${schedule.section_id}`;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            id: subject.id,
            name: subject.name,
            section_id: schedule.section_id,
            section_name: section.name,
            grade_level: section.grade_level,
            is_madrasah: subject.is_madrasah ?? false,
          });
        }
      }
    });

    const subjectsList = Array.from(subjectMap.values());
    setSubjects(subjectsList);

    setSelectedSubject((prev) => {
      if (prev) {
        const [subjectId, sectionId] = prev.split("_");
        const exists = subjectsList.some(
          (s) => s.id === subjectId && s.section_id === sectionId
        );
        if (!exists) return "";
      }
      return prev;
    });
  }, [user, schoolYear]);

  useEffect(() => {
    // Default to the current SY; if it's not term-based the banner below explains.
    setSchoolYear(getCurrentSchoolYear());
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const isTermYear = isTermBasedSchoolYear(schoolYear);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5" />
          Class Record
        </h1>
      </div>
      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Manage Class Record</CardTitle>
            <CardDescription>
              DepEd 3-term class record. Enter raw scores per component; the Term
              Grade is computed and posted to the learner&apos;s grades automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {schoolYear && !isTermYear && (
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
                <Info className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    Class Record uses the 3-term MATATAG grading
                  </p>
                  <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                    School year {schoolYear} still uses 4 quarters. Select SY
                    2026-2027 or later to use the term-based class record, or use
                    Grade Entry for quarter grades.
                  </p>
                </div>
              </div>
            )}
            {schoolYear && user?.system_user_id && (
              <ClassRecordTable
                key={`${selectedSubject}-${schoolYear}`}
                schoolYear={schoolYear}
                setSchoolYear={setSchoolYear}
                schoolYearOptions={getSchoolYearOptions()}
                subjects={subjects}
                selectedSubject={selectedSubject}
                setSelectedSubject={setSelectedSubject}
                teacherId={user.system_user_id}
                schoolId={user.school_id ? Number(user.school_id) : null}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
