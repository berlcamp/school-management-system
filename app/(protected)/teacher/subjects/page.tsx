"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { Subject } from "@/types";
import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { SubjectCard } from "../components/SubjectCard";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [subjects, setSubjects] = useState<
    (Subject & { section_name?: string; section_id?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [schoolYear, setSchoolYear] = useState("");
  const [gradeLevel, setGradeLevel] = useState<string>("all");

  useEffect(() => {
    const currentYear = getCurrentSchoolYear();
    setSchoolYear(currentYear);

    if (user?.system_user_id) {
      fetchSubjects(currentYear);
    }
  }, [user]);

  useEffect(() => {
    if (user?.system_user_id && schoolYear) {
      fetchSubjects(schoolYear);
    }
  }, [schoolYear, gradeLevel, user]);

  const fetchSubjects = async (year: string) => {
    if (!user?.system_user_id) return;

    setLoading(true);
    try {
      const { data: schedules } = await supabase
        .from("sms_subject_schedules")
        .select(
          `
          subject_id,
          section_id,
          subjects:subject_id (*),
          sections:section_id (id, name)
        `
        )
        .eq("teacher_id", user.system_user_id)
        .eq("school_year", year);

      if (schedules) {
        const subjectsList: (Subject & {
          section_name?: string;
          section_id?: string;
        })[] = [];

        schedules.forEach((schedule) => {
          if (schedule.subjects) {
            const subject = Array.isArray(schedule.subjects)
              ? schedule.subjects[0]
              : schedule.subjects;

            // Filter by grade level if selected
            if (
              gradeLevel !== "all" &&
              subject.grade_level !== parseInt(gradeLevel)
            ) {
              return;
            }

            const section =
              schedule.section_id && schedule.sections
                ? Array.isArray(schedule.sections)
                  ? schedule.sections[0]
                  : schedule.sections
                : null;

            subjectsList.push({
              ...subject,
              section_id: schedule.section_id || undefined,
              section_name: section?.name || undefined,
            });
          }
        });

        setSubjects(subjectsList);
      }
    } catch (error) {
      console.error("Error fetching subjects:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          My Subjects
        </h1>
        <div className="app__title_actions flex gap-2">
          <Select value={schoolYear} onValueChange={setSchoolYear}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="School Year" />
            </SelectTrigger>
            <SelectContent>
              {getSchoolYearOptions().map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={gradeLevel} onValueChange={setGradeLevel}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Grade Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((grade) => (
                <SelectItem key={grade} value={grade.toString()}>
                  Grade {grade}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading subjects...
          </div>
        ) : subjects.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <BookOpen className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No subjects found</p>
            <p className="app__empty_state_description">
              You are not assigned to any subjects for {schoolYear}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <SubjectCard
                key={`${subject.id}-${subject.section_id || "none"}`}
                subject={subject}
                schoolYear={schoolYear}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
