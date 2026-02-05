"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Award } from "lucide-react";
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
    }>
  >([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedGradingPeriod, setSelectedGradingPeriod] =
    useState<string>("1");
  const [schoolYear, setSchoolYear] = useState<string>("");
  const user = useAppSelector((state) => state.user.user);

  const fetchSubjects = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear) {
      setSubjects([]);
      setSelectedSubject("");
      return;
    }

    // Get subjects from schedules where teacher is assigned
    const { data: schedules } = await supabase
      .from("sms_subject_schedules")
      .select(
        `
        subject_id,
        section_id,
        subjects:subject_id (id, name),
        sections:section_id (id, name)
      `
      )
      .eq("teacher_id", user.system_user_id)
      .eq("school_year", schoolYear);

    const subjectMap = new Map<
      string,
      { id: string; name: string; section_id: string; section_name: string }
    >();

    schedules?.forEach((schedule) => {
      if (schedule.subjects && schedule.sections && schedule.section_id) {
        const subject = Array.isArray(schedule.subjects)
          ? schedule.subjects[0]
          : schedule.subjects;
        const section = Array.isArray(schedule.sections)
          ? schedule.sections[0]
          : schedule.sections;

        // Create unique key: subject_id + section_id to handle same subject in multiple sections
        const key = `${subject.id}_${schedule.section_id}`;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            id: subject.id,
            name: subject.name,
            section_id: schedule.section_id,
            section_name: section.name,
          });
        }
      }
    });

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
    const urlGradingPeriod = searchParams.get("gradingPeriod");

    const currentYear = urlSchoolYear || getCurrentSchoolYear();
    setSchoolYear(currentYear);

    // Set selections from URL params
    if (urlSubject) {
      setSelectedSubject(urlSubject);
    }
    if (urlGradingPeriod) {
      setSelectedGradingPeriod(urlGradingPeriod);
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
              Select subject and grading period to enter grades
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  School Year
                </label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select school year" />
                  </SelectTrigger>
                  <SelectContent>
                    {getSchoolYearOptions().map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Subject
                </label>
                <Select
                  value={selectedSubject}
                  onValueChange={setSelectedSubject}
                  disabled={!schoolYear}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem
                        key={`${subject.id}_${subject.section_id}`}
                        value={`${subject.id}_${subject.section_id}`}
                      >
                        {subject.name} - {subject.section_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Grading Period
                </label>
                <Select
                  value={selectedGradingPeriod}
                  onValueChange={setSelectedGradingPeriod}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select grading period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1st Quarter</SelectItem>
                    <SelectItem value="2">2nd Quarter</SelectItem>
                    <SelectItem value="3">3rd Quarter</SelectItem>
                    <SelectItem value="4">4th Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedSubject &&
              selectedGradingPeriod &&
              schoolYear &&
              user?.system_user_id &&
              (() => {
                const [subjectId, sectionId] = selectedSubject.split("_");
                return (
                  <TeacherGradeEntryTable
                    key={`${subjectId}-${sectionId}-${selectedGradingPeriod}-${schoolYear}`}
                    sectionId={sectionId}
                    subjectId={subjectId}
                    gradingPeriod={parseInt(selectedGradingPeriod)}
                    schoolYear={schoolYear}
                    teacherId={user.system_user_id}
                  />
                );
              })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
