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
import { BarChart3 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  ScheduleAssignment,
  TeacherMpsEntryForm,
} from "../components/TeacherMpsEntryForm";

export default function Page() {
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>("");
  const user = useAppSelector((state) => state.user.user);

  const fetchAssignments = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear) {
      setAssignments([]);
      setSelectedSectionId("");
      setSelectedSubjectId("");
      return;
    }

    const { data: schedules } = await supabase
      .from("sms_subject_schedules")
      .select(
        `
        subject_id,
        section_id,
        subjects:subject_id (id, name, is_graded),
        sections:section_id (id, name, grade_level)
        `
      )
      .eq("teacher_id", user.system_user_id)
      .eq("school_year", schoolYear);

    const seen = new Set<string>();
    const list: ScheduleAssignment[] = [];

    schedules?.forEach((schedule) => {
      if (!schedule.subjects || !schedule.sections || !schedule.section_id) return;
      const subject = Array.isArray(schedule.subjects)
        ? schedule.subjects[0]
        : schedule.subjects;
      const section = Array.isArray(schedule.sections)
        ? schedule.sections[0]
        : schedule.sections;

      if (subject.is_graded === false) return;
      if (section.grade_level === 0) return;

      const subjectIdStr = String(subject.id);
      const sectionIdStr = String(schedule.section_id);
      const key = `${subjectIdStr}_${sectionIdStr}`;
      if (seen.has(key)) return;
      seen.add(key);

      list.push({
        subject_id: subjectIdStr,
        subject_name: subject.name,
        section_id: sectionIdStr,
        section_name: section.name,
        grade_level: section.grade_level,
      });
    });

    setAssignments(list);
  }, [user, schoolYear]);

  useEffect(() => {
    setSchoolYear(getCurrentSchoolYear());
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          MPS Entry
        </h1>
      </div>
      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Enter Mean Percentage Score</CardTitle>
            <CardDescription>
              Manually enter the MPS (0–100) per subject, section, and quarter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {schoolYear && user?.system_user_id && (
              <TeacherMpsEntryForm
                key={`${selectedSectionId}-${selectedSubjectId}-${schoolYear}`}
                schoolYear={schoolYear}
                setSchoolYear={setSchoolYear}
                assignments={assignments}
                selectedSectionId={selectedSectionId}
                setSelectedSectionId={setSelectedSectionId}
                selectedSubjectId={selectedSubjectId}
                setSelectedSubjectId={setSelectedSubjectId}
                schoolYearOptions={getSchoolYearOptions()}
                teacherId={user.system_user_id}
                schoolId={user.school_id ?? null}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
