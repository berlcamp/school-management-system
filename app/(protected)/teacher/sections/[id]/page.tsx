"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Section, Student, Subject } from "@/types";
import { ArrowLeft, BookOpen, GraduationCap, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function Page() {
  const params = useParams();
  const router = useRouter();
  const sectionId = params.id as string;
  const user = useAppSelector((state) => state.user.user);
  const [section, setSection] = useState<Section | null>(null);
  const [students, setStudents] = useState<(Student & { lrn: string })[]>([]);
  const [subjects, setSubjects] = useState<
    (Subject & { teacher_name?: string })[]
  >([]);
  const [adviser, setAdviser] = useState<{ name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [schoolYear, setSchoolYear] = useState("");

  useEffect(() => {
    const getCurrentSchoolYear = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      if (month >= 5) {
        return `${year}-${year + 1}`;
      } else {
        return `${year - 1}-${year}`;
      }
    };
    setSchoolYear(getCurrentSchoolYear());
  }, []);

  const fetchSectionData = useCallback(async () => {
    if (!sectionId || !user?.system_user_id) return;

    setLoading(true);
    try {
      // Verify teacher has access to this section
      const { data: adviserSection } = await supabase
        .from("sms_sections")
        .select("*")
        .eq("id", sectionId)
        .eq("section_adviser_id", user.system_user_id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .single();

      const { data: assignmentSection } = await supabase
        .from("sms_subject_assignments")
        .select("section_id")
        .eq("teacher_id", user.system_user_id)
        .eq("section_id", sectionId)
        .maybeSingle();

      if (!adviserSection && !assignmentSection) {
        router.replace("/teacher/sections");
        return;
      }

      // Fetch section details
      const { data: sectionData } = await supabase
        .from("sms_sections")
        .select("*")
        .eq("id", sectionId)
        .single();

      if (sectionData) {
        setSection(sectionData);
        setSchoolYear(sectionData.school_year);

        // Fetch adviser name
        if (sectionData.section_adviser_id) {
          const { data: adviserData } = await supabase
            .from("sms_users")
            .select("name")
            .eq("id", sectionData.section_adviser_id)
            .single();

          if (adviserData) {
            setAdviser({ name: adviserData.name });
          }
        }

        // Fetch students
        const { data: sectionStudents } = await supabase
          .from("sms_section_students")
          .select("student_id")
          .eq("section_id", sectionId)
          .eq("school_year", sectionData.school_year)
          .is("transferred_at", null);

        if (sectionStudents && sectionStudents.length > 0) {
          const studentIds = sectionStudents.map((ss) => ss.student_id);
          const { data: studentsData } = await supabase
            .from("sms_students")
            .select("*")
            .in("id", studentIds)
            .is("deleted_at", null)
            .order("last_name")
            .order("first_name");

          if (studentsData) {
            setStudents(studentsData);
          }
        }

        // Fetch subjects assigned to this section
        const { data: sectionSubjects } = await supabase
          .from("sms_section_subjects")
          .select(
            `
            subject_id,
            subjects:subject_id (*)
          `
          )
          .eq("section_id", sectionId)
          .eq("school_year", sectionData.school_year);

        if (sectionSubjects && sectionSubjects.length > 0) {
          const subjectIds = sectionSubjects.map((ss) => ss.subject_id);

          // Fetch teacher assignments for these subjects in this section
          const { data: teacherAssignments } = await supabase
            .from("sms_subject_assignments")
            .select(
              `
              subject_id,
              teacher_id,
              teachers:teacher_id (name)
            `
            )
            .eq("section_id", sectionId)
            .eq("school_year", sectionData.school_year)
            .in("subject_id", subjectIds);

          // Create a map of subject_id to teacher name
          const teacherMap = new Map<string, string>();
          if (teacherAssignments) {
            teacherAssignments.forEach((assignment) => {
              const teacher = assignment.teachers
                ? Array.isArray(assignment.teachers)
                  ? assignment.teachers[0]
                  : assignment.teachers
                : null;
              if (teacher?.name) {
                teacherMap.set(assignment.subject_id, teacher.name);
              }
            });
          }

          const subjectsList: (Subject & { teacher_name?: string })[] = [];
          sectionSubjects.forEach((sectionSubject) => {
            if (sectionSubject.subjects) {
              const subject = Array.isArray(sectionSubject.subjects)
                ? sectionSubject.subjects[0]
                : sectionSubject.subjects;
              subjectsList.push({
                ...subject,
                teacher_name: teacherMap.get(sectionSubject.subject_id),
              });
            }
          });
          setSubjects(subjectsList);
        }
      }
    } catch (error) {
      console.error("Error fetching section data:", error);
    } finally {
      setLoading(false);
    }
  }, [sectionId, user?.system_user_id, schoolYear, router]);

  useEffect(() => {
    if (sectionId && user?.system_user_id) {
      fetchSectionData();
    }
  }, [sectionId, user?.system_user_id, fetchSectionData]);

  if (loading) {
    return (
      <div>
        <div className="app__title">
          <h1 className="app__title_text">Loading...</h1>
        </div>
        <div className="app__content">
          <div className="text-center py-8 text-muted-foreground">
            Loading section details...
          </div>
        </div>
      </div>
    );
  }

  if (!section) {
    return (
      <div>
        <div className="app__title">
          <h1 className="app__title_text">Section Not Found</h1>
        </div>
        <div className="app__content">
          <div className="app__empty_state">
            <p className="app__empty_state_title">Section not found</p>
            <Link href="/teacher/sections">
              <Button variant="outline">Back to Sections</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="app__title">
        <div className="flex items-center gap-4">
          <Link href="/teacher/sections">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="app__title_text flex items-center gap-2">
            <Users className="h-5 w-5" />
            {section.name}
          </h1>
        </div>
      </div>
      <div className="app__content space-y-6">
        {/* Section Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Section Information</CardTitle>
            <CardDescription>Details about this section</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Grade Level</p>
                <p className="text-lg font-semibold">
                  Grade {section.grade_level}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">School Year</p>
                <p className="text-lg font-semibold">{section.school_year}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Students</p>
                <p className="text-lg font-semibold">{students.length}</p>
              </div>
              {adviser && (
                <div>
                  <p className="text-sm text-muted-foreground">Adviser</p>
                  <p className="text-lg font-semibold">{adviser.name}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Students Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Students ({students.length})
            </CardTitle>
            <CardDescription>
              List of students enrolled in this section
            </CardDescription>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No students enrolled in this section
              </div>
            ) : (
              <div className="border rounded-md">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Student Name
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        LRN
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.map((student) => (
                      <tr key={student.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3">
                          {student.last_name}, {student.first_name}
                          {student.middle_name && ` ${student.middle_name}`}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">
                          {student.lrn}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subjects Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Subjects ({subjects.length})
            </CardTitle>
            <CardDescription>Subjects assigned to this section</CardDescription>
          </CardHeader>
          <CardContent>
            {subjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No subjects assigned to this section
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold">{subject.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {subject.code} • Grade {subject.grade_level}
                    </p>
                    {subject.teacher_name && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Teacher: {subject.teacher_name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
