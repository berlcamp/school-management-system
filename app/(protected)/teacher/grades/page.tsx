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
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { Award } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TeacherGradeEntryTable } from "../components/TeacherGradeEntryTable";

export default function Page() {
  const searchParams = useSearchParams();
  const [sections, setSections] = useState<
    Array<{ id: string; name: string; grade_level: number }>
  >([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedGradingPeriod, setSelectedGradingPeriod] =
    useState<string>("1");
  const [schoolYear, setSchoolYear] = useState<string>("");
  const user = useAppSelector((state) => state.user.user);
  const fetchSections = async () => {
    if (!user?.system_user_id || !schoolYear) return;

    // Get sections where teacher is adviser
    const { data: adviserSections } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level")
      .eq("section_adviser_id", user.system_user_id)
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .is("deleted_at", null);

    // Get sections via subject assignments
    const { data: assignmentData } = await supabase
      .from("sms_subject_assignments")
      .select(
        `
        section_id,
        sections:section_id (id, name, grade_level)
      `
      )
      .eq("teacher_id", user.system_user_id)
      .eq("school_year", schoolYear)
      .not("section_id", "is", null);

    const sectionMap = new Map<
      string,
      { id: string; name: string; grade_level: number }
    >();

    adviserSections?.forEach((section) => {
      sectionMap.set(section.id, section);
    });

    assignmentData?.forEach((assignment) => {
      if (assignment.section_id && assignment.sections) {
        const section = Array.isArray(assignment.sections)
          ? assignment.sections[0]
          : assignment.sections;
        sectionMap.set(section.id, {
          id: section.id,
          name: section.name,
          grade_level: section.grade_level,
        });
      }
    });

    setSections(Array.from(sectionMap.values()));
  };

  const fetchSubjects = async () => {
    if (!selectedSection || !user?.system_user_id || !schoolYear) return;

    // Get subjects assigned to teacher for this section
    const { data: assignments } = await supabase
      .from("sms_subject_assignments")
      .select(
        `
        subject_id,
        subjects:subject_id (id, name)
      `
      )
      .eq("teacher_id", user.system_user_id)
      .eq("section_id", selectedSection)
      .eq("school_year", schoolYear);

    const subjectMap = new Map<string, { id: string; name: string }>();
    assignments?.forEach((assignment) => {
      if (assignment.subjects) {
        const subject = Array.isArray(assignment.subjects)
          ? assignment.subjects[0]
          : assignment.subjects;
        subjectMap.set(subject.id, { id: subject.id, name: subject.name });
      }
    });

    setSubjects(Array.from(subjectMap.values()));

    // Reset selected subject if it's not in the new list
    if (selectedSubject && !subjectMap.has(selectedSubject)) {
      setSelectedSubject("");
    }
  };

  // Initialize from URL params if available
  useEffect(() => {
    const urlSection = searchParams.get("section");
    const urlSubject = searchParams.get("subject");
    const urlSchoolYear = searchParams.get("schoolYear");

    const currentYear = urlSchoolYear || getCurrentSchoolYear();
    setSchoolYear(currentYear);

    // Set selections from URL params
    if (urlSection) {
      setSelectedSection(urlSection);
    }
    if (urlSubject) {
      setSelectedSubject(urlSubject);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user?.system_user_id && schoolYear) {
      fetchSections();
    }
  }, [user, schoolYear]);

  useEffect(() => {
    if (selectedSection && user?.system_user_id && schoolYear) {
      fetchSubjects();
    } else {
      setSubjects([]);
      setSelectedSubject("");
    }
  }, [selectedSection, user, schoolYear]);

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
              Select section, subject, and grading period to enter grades
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Section
                </label>
                <Select
                  value={selectedSection}
                  onValueChange={(value) => {
                    setSelectedSection(value);
                    setSelectedSubject("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
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
                  disabled={!selectedSection}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
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
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1st Quarter</SelectItem>
                    <SelectItem value="2">2nd Quarter</SelectItem>
                    <SelectItem value="3">3rd Quarter</SelectItem>
                    <SelectItem value="4">4th Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  School Year
                </label>
                <input
                  type="text"
                  value={schoolYear}
                  onChange={(e) => setSchoolYear(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  placeholder="2024-2025"
                />
              </div>
            </div>

            {selectedSection &&
              selectedSubject &&
              selectedGradingPeriod &&
              schoolYear &&
              user?.system_user_id && (
                <TeacherGradeEntryTable
                  sectionId={selectedSection}
                  subjectId={selectedSubject}
                  gradingPeriod={parseInt(selectedGradingPeriod)}
                  schoolYear={schoolYear}
                  teacherId={user.system_user_id}
                />
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
