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
import { useAppSelector } from "@/lib/redux/hook";
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
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Loader2,
  User,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RejectReasonDialog } from "../shared/RejectReasonDialog";
import { ConfirmDialog } from "../shared/ConfirmDialog";

interface TransferRecordViewerProps {
  enrollmentId: string | null;
  recordRequest: (RecordRequest & { student?: Student | null; origin_school?: School | null }) | null;
  isOpen: boolean;
  onClose: () => void;
  onActionComplete: () => void;
}

interface GradeWithSubject extends Grade {
  subject?: Subject | null;
  section?: Section | null;
}

interface EnrollmentWithSection extends Enrollment {
  section?: Section | null;
}

export function TransferRecordViewer({
  enrollmentId,
  recordRequest,
  isOpen,
  onClose,
  onActionComplete,
}: TransferRecordViewerProps) {
  const user = useAppSelector((state) => state.user.user);
  const userId = user?.system_user_id ?? null;

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  // Student data from origin school
  const [grades, setGrades] = useState<GradeWithSubject[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentWithSection[]>([]);

  const studentId = recordRequest?.student_id;
  const student = recordRequest?.student;

  const fetchStudentData = useCallback(async () => {
    if (!studentId || !isOpen) return;
    setLoading(true);

    try {
      // Fetch grades with subject names
      const { data: gradesData } = await supabase
        .from("sms_grades")
        .select("*, subject:sms_subjects(*), section:sms_sections(*)")
        .eq("student_id", studentId)
        .order("school_year", { ascending: false })
        .order("grading_period", { ascending: true });

      // Fetch enrollment history
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

  const handleApprove = async () => {
    if (!userId || !enrollmentId) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("review_transfer_enrollment", {
        p_enrollment_id: enrollmentId,
        p_action: "approved",
        p_reviewer_id: userId,
      });
      if (error) throw error;
      toast.success("Enrollment approved! Student is now active.");
      onClose();
      onActionComplete();
    } catch {
      toast.error("Failed to approve enrollment");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!userId || !enrollmentId) return;
    setActionLoading(true);
    setRejectModalOpen(false);
    try {
      const { error } = await supabase.rpc("review_transfer_enrollment", {
        p_enrollment_id: enrollmentId,
        p_action: "rejected",
        p_reviewer_id: userId,
        p_rejection_reason: reason,
      });
      if (error) throw error;
      toast.success("Enrollment rejected.");
      onClose();
      onActionComplete();
    } catch {
      toast.error("Failed to reject enrollment");
    } finally {
      setActionLoading(false);
    }
  };

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
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Review Transfer Enrollment
            </DialogTitle>
            <DialogDescription>
              Review the student&apos;s records from {recordRequest?.origin_school?.name ?? "their previous school"} before approving or rejecting enrollment.
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
                    // Group by subject within the year
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

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => setRejectModalOpen(true)}
              disabled={actionLoading}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Reject Enrollment
            </Button>
            <Button onClick={() => setConfirmApproveOpen(true)} disabled={actionLoading}>
              {actionLoading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Approve Enrollment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmApproveOpen}
        onClose={() => setConfirmApproveOpen(false)}
        onConfirm={handleApprove}
        title="Approve Enrollment"
        description="Are you sure you want to approve this transfer enrollment? The student will become active at your school."
        confirmLabel="Approve Enrollment"
      />

      <RejectReasonDialog
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        onConfirm={handleRejectConfirm}
        title="Reject Transfer Enrollment"
        description="Please provide a reason for rejecting this enrollment. The student's record access will be revoked."
      />
    </>
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
