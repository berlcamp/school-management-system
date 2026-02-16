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
  const [enrollments, setEnrollments] = useState<
    Array<{ id: string; student: Student; grade_level: number; enrollment_date: string }>
  >([]);
  const [subjects, setSubjects] = useState<
    (Subject & { teacher_name?: string })[]
  >([]);
  const [adviser, setAdviser] = useState<{ name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSectionData = useCallback(async () => {
    if (!sectionId || !user?.system_user_id) return;

    setLoading(true);
    try {
      // Verify teacher is adviser of this section
      const { data: sectionData } = await supabase
        .from("sms_sections")
        .select("*")
        .eq("id", sectionId)
        .eq("section_adviser_id", user.system_user_id)
        .eq("is_active", true)
        .single();

      if (!sectionData) {
        router.replace("/teacher/sections");
        return;
      }

      setSection(sectionData);

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

      // Fetch enrolled students from sms_enrollments (approved enrollments)
      const { data: enrollmentsData } = await supabase
        .from("sms_enrollments")
        .select(
          `
          id,
          grade_level,
          enrollment_date,
          student:sms_students!sms_enrollments_student_id_fkey(*)
        `
        )
        .eq("section_id", sectionId)
        .eq("school_year", sectionData.school_year)
        .eq("status", "approved")
        .order("enrollment_date", { ascending: true });

      if (enrollmentsData) {
        const validEnrollments = enrollmentsData
          .filter((e) => {
            const student = Array.isArray(e.student) ? e.student[0] : e.student;
            return !!student;
          })
          .map((e) => {
            const student = Array.isArray(e.student)
              ? e.student[0]
              : (e.student as Student);
            return {
              id: e.id,
              student,
              grade_level: e.grade_level,
              enrollment_date: e.enrollment_date,
            };
          })
          .sort(
            (a, b) =>
              a.student.last_name.localeCompare(b.student.last_name) ||
              a.student.first_name.localeCompare(b.student.first_name)
          );
        setEnrollments(validEnrollments);
      }

      // Fetch subjects from schedules for this section
      const { data: schedules } = await supabase
        .from("sms_subject_schedules")
        .select(
          `
          subject_id,
          teacher_id,
          subjects:subject_id (*),
          teachers:teacher_id (name)
        `
        )
        .eq("section_id", sectionId)
        .eq("school_year", sectionData.school_year);

      if (schedules && schedules.length > 0) {
        // Create a map to deduplicate subjects and get teacher names
        const subjectMap = new Map<
          string,
          Subject & { teacher_name?: string }
        >();

        schedules.forEach((schedule) => {
          if (schedule.subjects) {
            const subject = Array.isArray(schedule.subjects)
              ? schedule.subjects[0]
              : schedule.subjects;

            const teacher = schedule.teachers
              ? Array.isArray(schedule.teachers)
                ? schedule.teachers[0]
                : schedule.teachers
              : null;

            // Use subject_id as key to deduplicate
            if (!subjectMap.has(subject.id)) {
              subjectMap.set(subject.id, {
                ...subject,
                teacher_name: teacher?.name,
              });
            }
          }
        });

        setSubjects(Array.from(subjectMap.values()));
      }
    } catch (error) {
      console.error("Error fetching section data:", error);
    } finally {
      setLoading(false);
    }
  }, [sectionId, user?.system_user_id, router]);

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
                <p className="text-lg font-semibold">{enrollments.length}</p>
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
              Students ({enrollments.length})
            </CardTitle>
            <CardDescription>
              List of students enrolled in this section
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enrollments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No students enrolled in this section
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Student Name
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        LRN
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Grade
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Enrolled
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {enrollments.map((enrollment, index) => (
                      <tr
                        key={enrollment.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3">
                          {enrollment.student.last_name},{" "}
                          {enrollment.student.first_name}
                          {enrollment.student.middle_name &&
                            ` ${enrollment.student.middle_name}`}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">
                          {enrollment.student.lrn}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                            Grade {enrollment.grade_level}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(
                            enrollment.enrollment_date
                          ).toLocaleDateString()}
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
