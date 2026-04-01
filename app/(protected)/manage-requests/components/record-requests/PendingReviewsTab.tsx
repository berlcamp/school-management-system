"use client";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { useAppSelector } from "@/lib/redux/hook";
import { getGradeLevelLabel } from "@/lib/constants";
import type {
  Enrollment,
  RecordRequest,
  School,
  Section,
  Student,
} from "@/types/database";
import { ArrowLeftRight, ClipboardCheck, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TransferRecordViewer } from "./TransferRecordViewer";

interface PendingEnrollment extends Enrollment {
  student?: Student | null;
  section?: Section | null;
  record_request?: (RecordRequest & {
    origin_school?: School | null;
  }) | null;
}

export function PendingReviewsTab() {
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id ?? null;

  const [enrollments, setEnrollments] = useState<PendingEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] =
    useState<PendingEnrollment | null>(null);

  const fetchPendingReviews = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("sms_enrollments")
      .select(
        "*, student:sms_students(*), section:sms_sections(*), record_request:sms_record_requests!fk_enrollments_record_request(*, origin_school:sms_schools!sms_record_requests_origin_school_id_fkey(*))"
      )
      .eq("school_id", schoolId)
      .eq("enrollment_status", "pending_review")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching pending reviews:", error);
    }
    setEnrollments((data as PendingEnrollment[]) ?? []);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchPendingReviews();
  }, [fetchPendingReviews]);

  const handleReview = (enrollment: PendingEnrollment) => {
    setSelectedEnrollment(enrollment);
    setViewerOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Build the record request prop for the viewer
  const viewerRecordRequest = selectedEnrollment?.record_request
    ? {
        ...selectedEnrollment.record_request,
        student: selectedEnrollment.student ?? null,
        origin_school: selectedEnrollment.record_request.origin_school ?? null,
      }
    : null;

  return (
    <>
      <div className="app__table_container">
        <div className="app__table_wrapper">
          <table className="app__table">
            <thead className="app__table_thead">
              <tr>
                <th className="app__table_th">Student</th>
                <th className="app__table_th">Previous School</th>
                <th className="app__table_th">Target Grade</th>
                <th className="app__table_th">Section</th>
                <th className="app__table_th">School Year</th>
                <th className="app__table_th">Date</th>
                <th className="app__table_th_right">Actions</th>
              </tr>
            </thead>
            <tbody className="app__table_tbody">
              {enrollments.map((enrollment) => {
                const student = enrollment.student;
                const studentName = student
                  ? `${student.last_name}, ${student.first_name}${student.middle_name ? ` ${student.middle_name.charAt(0)}.` : ""}`
                  : "Unknown";

                return (
                  <tr key={enrollment.id} className="app__table_tr">
                    <td className="app__table_td">
                      <div className="app__table_cell_text">
                        <div className="app__table_cell_title">
                          {studentName}
                        </div>
                        <div className="app__table_cell_subtitle">
                          LRN: {student?.lrn ?? "—"}
                        </div>
                      </div>
                    </td>
                    <td className="app__table_td">
                      {enrollment.record_request?.origin_school?.name ?? "—"}
                    </td>
                    <td className="app__table_td">
                      {getGradeLevelLabel(enrollment.grade_level)}
                    </td>
                    <td className="app__table_td">
                      {enrollment.section?.name ?? "—"}
                    </td>
                    <td className="app__table_td">
                      {enrollment.school_year}
                    </td>
                    <td className="app__table_td">
                      {formatDate(enrollment.created_at)}
                    </td>
                    <td className="app__table_td_actions">
                      <div className="app__table_action_container">
                        <Button
                          size="sm"
                          onClick={() => handleReview(enrollment)}
                        >
                          <ClipboardCheck className="h-4 w-4 mr-1" />
                          Review
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {enrollments.length === 0 && (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <ArrowLeftRight className="h-8 w-8" />
            </div>
            <h3 className="app__empty_state_title">No pending reviews</h3>
            <p className="app__empty_state_description">
              No transfer enrollments are waiting for your review.
            </p>
          </div>
        )}
      </div>

      <TransferRecordViewer
        enrollmentId={selectedEnrollment?.id ?? null}
        recordRequest={viewerRecordRequest}
        isOpen={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setSelectedEnrollment(null);
        }}
        onActionComplete={fetchPendingReviews}
      />
    </>
  );
}
