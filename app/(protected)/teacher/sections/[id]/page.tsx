"use client";

import { Button } from "@/components/ui/button";
import { getGradeLevelLabel } from "@/lib/constants";
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
import { ArrowLeft, ArrowUpRight, BookOpen, ClipboardCheck, Download, GraduationCap, Heart, Pencil, Printer, UserX, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { generateReportCardPrint } from "@/lib/pdf/generateReportCard";
import { PromoteStudentModal } from "../../components/PromoteStudentModal";
import { RetainNlisModal } from "../../components/RetainNlisModal";
import { TeacherEditStudentModal } from "../../components/TeacherEditStudentModal";

const TERMINAL_GRADES = [6, 10, 12];

export default function Page() {
  const params = useParams();
  const router = useRouter();
  const sectionId = params.id as string;
  const user = useAppSelector((state) => state.user.user);
  const [section, setSection] = useState<Section | null>(null);
  const [enrollments, setEnrollments] = useState<
    Array<{ id: string; student: Student; grade_level: number; enrollment_date: string; enrollment_status: string }>
  >([]);
  const [subjects, setSubjects] = useState<
    (Subject & { teacher_name?: string })[]
  >([]);
  const [adviser, setAdviser] = useState<{ name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [printingCardFor, setPrintingCardFor] = useState<string | null>(null);
  const [promoteStudent, setPromoteStudent] = useState<{
    student: Student;
    enrollmentId: string;
    gradeLevel: number;
  } | null>(null);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [retainNlisStudent, setRetainNlisStudent] = useState<{
    student: Student;
    enrollmentId: string;
    gradeLevel: number;
  } | null>(null);

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
          enrollment_status,
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
              enrollment_status: (e as Record<string, unknown>).enrollment_status as string || "active",
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

  const filteredEnrollments = useMemo(() => {
    if (genderFilter === "all") return enrollments;
    return enrollments.filter((e) => e.student.gender === genderFilter);
  }, [enrollments, genderFilter]);

  const exportToExcel = () => {
    const data = filteredEnrollments.map((enrollment, index) => ({
      "#": index + 1,
      "Last Name": enrollment.student.last_name,
      "First Name": enrollment.student.first_name,
      "Middle Name": enrollment.student.middle_name || "",
      LRN: enrollment.student.lrn,
      Gender: enrollment.student.gender
        ? enrollment.student.gender.charAt(0).toUpperCase() +
          enrollment.student.gender.slice(1)
        : "",
      "Grade Level": getGradeLevelLabel(enrollment.grade_level),
      "Enrollment Date": new Date(
        enrollment.enrollment_date
      ).toLocaleDateString(),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    const filterLabel = genderFilter === "all" ? "" : `_${genderFilter}`;
    XLSX.writeFile(
      wb,
      `${section?.name || "Section"}_Students${filterLabel}.xlsx`
    );
  };

  const handlePrintCard = async (studentId: string) => {
    if (!user?.school_id || !section) return;
    setPrintingCardFor(studentId);
    try {
      await generateReportCardPrint({
        schoolId: String(user.school_id),
        studentId,
        sectionId,
        schoolYear: section.school_year,
      });
    } catch (error) {
      console.error("Error generating report card:", error);
    } finally {
      setPrintingCardFor(null);
    }
  };

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
        <div className="app__title_actions flex items-center gap-2">
          <Link href={`/attendance?section=${sectionId}&school_year=${section.school_year}`}>
            <Button variant="outline" size="sm">
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Attendance
            </Button>
          </Link>
          <Link href={`/health?section=${sectionId}&school_year=${section.school_year}`}>
            <Button variant="outline" size="sm">
              <Heart className="h-4 w-4 mr-2" />
              Learners Health
            </Button>
          </Link>
        </div>
      </div>
      <div className="app__content space-y-6">
        {/* Section Info Summary */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Grade Level:</span>
            <span className="font-medium">{getGradeLevelLabel(section.grade_level)}</span>
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">School Year:</span>
            <span className="font-medium">{section.school_year}</span>
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Students:</span>
            <span className="font-medium">{enrollments.length}</span>
          </div>
          {adviser && (
            <>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Adviser:</span>
                <span className="font-medium">{adviser.name}</span>
              </div>
            </>
          )}
        </div>

        {/* Students Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Students ({filteredEnrollments.length}
                  {genderFilter !== "all" && ` of ${enrollments.length}`})
                </CardTitle>
                <CardDescription>
                  List of students enrolled in this section
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-md border bg-muted p-0.5">
                  {(["all", "male", "female"] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => setGenderFilter(value)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
                        genderFilter === value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {value.charAt(0).toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToExcel}
                  disabled={filteredEnrollments.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredEnrollments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {genderFilter === "all"
                  ? "No students enrolled in this section"
                  : `No ${genderFilter} students enrolled in this section`}
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
                        Gender
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Grade
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium">
                        Enrolled
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-medium">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-medium">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredEnrollments.map((enrollment, index) => (
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
                        <td className="px-4 py-3 text-sm capitalize">
                          {enrollment.student.gender || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                            {getGradeLevelLabel(enrollment.grade_level)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(
                            enrollment.enrollment_date
                          ).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {enrollment.enrollment_status === "active" ? (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                              Active
                            </span>
                          ) : enrollment.enrollment_status === "completed" ? (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                              Promoted
                            </span>
                          ) : enrollment.enrollment_status === "retained" ? (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">
                              Retained
                            </span>
                          ) : enrollment.enrollment_status === "dropped" ? (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800">
                              NLIS/Dropped
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
                              {enrollment.enrollment_status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditStudent(enrollment.student)}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePrintCard(String(enrollment.student.id))}
                              disabled={printingCardFor === String(enrollment.student.id)}
                            >
                              <Printer className="h-3.5 w-3.5 mr-1" />
                              {printingCardFor === String(enrollment.student.id) ? "Printing..." : "Print Card"}
                            </Button>
                            {enrollment.enrollment_status === "active" && (
                              <>
                                {!TERMINAL_GRADES.includes(enrollment.grade_level) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setPromoteStudent({
                                        student: enrollment.student,
                                        enrollmentId: enrollment.id,
                                        gradeLevel: enrollment.grade_level,
                                      })
                                    }
                                  >
                                    <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                                    Promote
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setRetainNlisStudent({
                                      student: enrollment.student,
                                      enrollmentId: enrollment.id,
                                      gradeLevel: enrollment.grade_level,
                                    })
                                  }
                                >
                                  <UserX className="h-3.5 w-3.5 mr-1" />
                                  Retain/NLIS
                                </Button>
                              </>
                            )}
                          </div>
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
                      {subject.code} • {getGradeLevelLabel(subject.grade_level)}
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

      {/* Promote Student Modal */}
      {promoteStudent && section && (
        <PromoteStudentModal
          isOpen={!!promoteStudent}
          onClose={() => setPromoteStudent(null)}
          student={promoteStudent.student}
          enrollmentId={promoteStudent.enrollmentId}
          gradeLevel={promoteStudent.gradeLevel}
          sectionId={sectionId}
          schoolYear={section.school_year}
          schoolId={user?.school_id != null ? String(user.school_id) : null}
          onPromoted={() => {
            fetchSectionData();
          }}
        />
      )}

      {/* Retain/NLIS Modal */}
      {retainNlisStudent && section && (
        <RetainNlisModal
          isOpen={!!retainNlisStudent}
          onClose={() => setRetainNlisStudent(null)}
          student={retainNlisStudent.student}
          enrollmentId={retainNlisStudent.enrollmentId}
          gradeLevel={retainNlisStudent.gradeLevel}
          sectionId={sectionId}
          schoolYear={section.school_year}
          onUpdated={() => {
            fetchSectionData();
          }}
        />
      )}

      {/* Edit Student Modal */}
      <TeacherEditStudentModal
        isOpen={!!editStudent}
        onClose={() => setEditStudent(null)}
        editData={editStudent}
        onUpdated={(updatedStudent) => {
          setEnrollments((prev) =>
            prev.map((e) =>
              String(e.student.id) === String(updatedStudent.id)
                ? { ...e, student: updatedStudent }
                : e
            )
          );
        }}
      />
    </div>
  );
}
