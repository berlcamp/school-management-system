"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGradeLevelLabel, GRADE_LEVELS, PER_PAGE } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { Subject } from "@/types";
import { BookOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SubjectCard } from "../components/SubjectCard";

const TEACHER_PAGE_SIZE = PER_PAGE * 3; // 30 items per page for card grid

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [subjects, setSubjects] = useState<
    (Subject & { section_name?: string; section_id?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [schoolYear, setSchoolYear] = useState("");
  const [gradeLevel, setGradeLevel] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const currentYear = getCurrentSchoolYear();
    setSchoolYear(currentYear);
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [schoolYear, gradeLevel]);

  const fetchSubjects = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear) return;

    setLoading(true);
    try {
      let query = supabase
        .from("sms_subject_schedules")
        .select(
          `
          subject_id,
          section_id,
          subjects:subject_id (*),
          sections:section_id (id, name)
        `,
          { count: "exact" },
        )
        .eq("teacher_id", user.system_user_id)
        .eq("school_year", schoolYear);

      // Filter by grade level at the DB level via subject join
      if (gradeLevel !== "all") {
        query = query.eq("subjects.grade_level", parseInt(gradeLevel));
      }

      const { data: schedules, count } = await query
        .range(
          (page - 1) * TEACHER_PAGE_SIZE,
          page * TEACHER_PAGE_SIZE - 1,
        )
        .order("subject_id", { ascending: true });

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

            if (!subject) return;

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
        setTotalCount(count || 0);
      }
    } catch (error) {
      console.error("Error fetching subjects:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.system_user_id, schoolYear, gradeLevel, page]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const totalPages = Math.ceil(totalCount / TEACHER_PAGE_SIZE);

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
              {GRADE_LEVELS.map((grade) => (
                <SelectItem key={grade} value={grade.toString()}>
                  {getGradeLevelLabel(grade)}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="app__pagination">
            <div className="app__pagination_info">
              Page <span className="font-medium">{page}</span> of{" "}
              <span className="font-medium">{totalPages}</span>
            </div>
            <div className="app__pagination_controls">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(page - 1)}
                disabled={page === 1 || loading}
                className="h-9 min-w-[80px]"
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages || loading}
                className="h-9 min-w-[80px]"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
