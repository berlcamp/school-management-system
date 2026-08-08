"use client";

import { Button } from "@/components/ui/button";
import { formatLrn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase/client";
import { getGradeLevelLabel } from "@/lib/constants";
import type {
  Enrollment,
  Grade,
  RecordRequest,
  School,
  Student,
  Subject,
  Section,
} from "@/types/database";
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  Loader2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface TransferRecordViewerProps {
  recordRequest: (RecordRequest & { student?: Student | null; origin_school?: School | null }) | null;
  isOpen: boolean;
  onClose: () => void;
}

interface GradeWithSubject extends Grade {
  subject?: Subject | null;
  section?: Section | null;
}

interface EnrollmentWithSection extends Enrollment {
  section?: Section | null;
}

export function TransferRecordViewer({
  recordRequest,
  isOpen,
  onClose,
}: TransferRecordViewerProps) {
  const [loading, setLoading] = useState(true);
  const [grades, setGrades] = useState<GradeWithSubject[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentWithSection[]>([]);

  const studentId = recordRequest?.student_id;
  const student = recordRequest?.student;

  const fetchStudentData = useCallback(async () => {
    if (!isOpen) return;
    // A request whose student row is missing has nothing to show; without this
    // the dialog sits on its spinner forever.
    if (!studentId) {
      setGrades([]);
      setEnrollments([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const { data: gradesData } = await supabase
        .from("sms_grades")
        .select("*, subject:sms_subjects(*), section:sms_sections(*)")
        .eq("student_id", studentId)
        .order("school_year", { ascending: false })
        .order("grading_period", { ascending: true });

      const { data: enrollmentData } = await supabase
        .from("sms_enrollments")
        .select("*, section:sms_sections(*)")
        .eq("student_id", studentId)
        .eq("status", "approved")
        .order("school_year", { ascending: false });

      setGrades((gradesData as GradeWithSubject[]) ?? []);
      setEnrollments((enrollmentData as EnrollmentWithSection[]) ?? []);
    } catch (err) {
      console.error("Error fetching student data:", err);
    } finally {
      setLoading(false);
    }
  }, [studentId, isOpen]);

  useEffect(() => {
    fetchStudentData();
  }, [fetchStudentData]);

  // Group grades by school year
  const gradesByYear = grades.reduce(
    (acc, g) => {
      const key = g.school_year;
      if (!acc[key]) acc[key] = [];
      acc[key].push(g);
      return acc;
    },
    {} as Record<string, GradeWithSubject[]>
  );

  const fullName = student
    ? [student.first_name, student.middle_name, student.last_name, student.suffix]
        .filter(Boolean)
        .join(" ")
    : "Unknown Student";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Previous School Records
          </DialogTitle>
          <DialogDescription>
            Viewing student records from {recordRequest?.origin_school?.name ?? "their previous school"}.
          </DialogDescription>
        </DialogHeader>

        {/* Student Info Header */}
        {student && (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm flex-1">
                <InfoField label="Name" value={fullName} />
                <InfoField label="LRN" value={formatLrn(student.lrn)} />
                <InfoField
                  label="Date of Birth"
                  value={new Date(student.date_of_birth).toLocaleDateString("en-US", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                />
                <InfoField label="Gender" value={capitalize(student.gender)} />
                <InfoField
                  label="Previous School"
                  value={recordRequest?.origin_school?.name ?? "—"}
                />
                {recordRequest?.target_grade_level != null && (
                  <InfoField
                    label="Target Grade"
                    value={getGradeLevelLabel(recordRequest.target_grade_level)}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="grades" className="mt-2">
            <TabsList>
              <TabsTrigger value="grades" className="gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Grades
              </TabsTrigger>
              <TabsTrigger value="enrollment" className="gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" />
                Enrollment History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="grades" className="mt-4 space-y-6">
              {Object.keys(gradesByYear).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No grade records found for this student.
                </p>
              ) : (
                Object.entries(gradesByYear).map(([year, yearGrades]) => {
                  const subjectMap = new Map<string, GradeWithSubject[]>();
                  yearGrades.forEach((g) => {
                    const subjectName = g.subject?.name ?? g.subject_id;
                    if (!subjectMap.has(subjectName)) subjectMap.set(subjectName, []);
                    subjectMap.get(subjectName)!.push(g);
                  });

                  return (
                    <div key={year}>
                      <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                        SY {year}
                      </h4>
                      <div className="app__table_container">
                        <div className="app__table_wrapper">
                          <table className="app__table">
                            <thead className="app__table_thead">
                              <tr>
                                <th className="app__table_th">Subject</th>
                                <th className="app__table_th text-center">Q1</th>
                                <th className="app__table_th text-center">Q2</th>
                                <th className="app__table_th text-center">Q3</th>
                                <th className="app__table_th text-center">Q4</th>
                                <th className="app__table_th text-center">Average</th>
                                <th className="app__table_th">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="app__table_tbody">
                              {Array.from(subjectMap.entries()).map(([subjectName, subjectGrades]) => {
                                const q: Record<number, number | null> = {};
                                subjectGrades.forEach((g) => { q[g.grading_period] = g.grade; });
                                const validGrades = [1, 2, 3, 4].map((p) => q[p]).filter((g): g is number => g != null);
                                const avg = validGrades.length > 0
                                  ? Math.round(validGrades.reduce((a, b) => a + b, 0) / validGrades.length)
                                  : null;
                                const lastRemarks = subjectGrades[subjectGrades.length - 1]?.remarks;

                                return (
                                  <tr key={subjectName} className="app__table_tr">
                                    <td className="app__table_td font-medium">{subjectName}</td>
                                    {[1, 2, 3, 4].map((p) => (
                                      <td key={p} className="app__table_td text-center">
                                        {q[p] != null ? q[p] : "—"}
                                      </td>
                                    ))}
                                    <td className="app__table_td text-center font-semibold">
                                      {avg ?? "—"}
                                    </td>
                                    <td className="app__table_td">
                                      {lastRemarks ? (
                                        <span className={`text-xs font-medium ${
                                          lastRemarks.toLowerCase() === "passed"
                                            ? "text-green-600"
                                            : lastRemarks.toLowerCase() === "failed"
                                              ? "text-red-600"
                                              : "text-muted-foreground"
                                        }`}>
                                          {lastRemarks}
                                        </span>
                                      ) : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="enrollment" className="mt-4">
              {enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No enrollment history found.
                </p>
              ) : (
                <div className="app__table_container">
                  <div className="app__table_wrapper">
                    <table className="app__table">
                      <thead className="app__table_thead">
                        <tr>
                          <th className="app__table_th">School Year</th>
                          <th className="app__table_th">Grade Level</th>
                          <th className="app__table_th">Section</th>
                          <th className="app__table_th">Status</th>
                        </tr>
                      </thead>
                      <tbody className="app__table_tbody">
                        {enrollments.map((enr) => (
                          <tr key={enr.id} className="app__table_tr">
                            <td className="app__table_td">{enr.school_year}</td>
                            <td className="app__table_td">
                              {getGradeLevelLabel(enr.grade_level)}
                            </td>
                            <td className="app__table_td">
                              {enr.section?.name ?? "—"}
                            </td>
                            <td className="app__table_td">
                              <span className="capitalize text-sm">
                                {enr.enrollment_status.replace(/_/g, " ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
