"use client";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { RecordRequest, School, Student } from "@/types/database";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import RejectReasonModal from "./RejectReasonModal";

interface RecordRequestRow extends RecordRequest {
  student: Student | null;
  requesting_school: School | null;
}

interface Props {
  schoolId: string | number | null;
  userId: number | null;
  statusFilter: string;
}

export default function IncomingRequests({
  schoolId,
  userId,
  statusFilter,
}: Props) {
  const [requests, setRequests] = useState<RecordRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);

    let query = supabase
      .from("sms_record_requests")
      .select(
        "*, student:sms_students(*), requesting_school:sms_schools!sms_record_requests_requesting_school_id_fkey(*)"
      )
      .eq("origin_school_id", schoolId)
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching incoming requests:", error);
    }
    setRequests((data as RecordRequestRow[]) ?? []);
    setLoading(false);
  }, [schoolId, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (requestId: string) => {
    if (!userId) return;
    setActionLoading(requestId);
    try {
      const { error } = await supabase.rpc("respond_to_record_request", {
        p_request_id: requestId,
        p_action: "approved",
        p_responder_id: userId,
      });
      if (error) throw error;
      toast.success("Record request approved. Student can now be enrolled.");
      fetchRequests();
    } catch {
      toast.error("Failed to approve request");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectClick = (requestId: string) => {
    setRejectingId(requestId);
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!userId || !rejectingId) return;
    setActionLoading(rejectingId);
    setRejectModalOpen(false);
    try {
      const { error } = await supabase.rpc("respond_to_record_request", {
        p_request_id: rejectingId,
        p_action: "rejected",
        p_responder_id: userId,
        p_rejection_reason: reason,
      });
      if (error) throw error;
      toast.success("Record request rejected.");
      fetchRequests();
    } catch {
      toast.error("Failed to reject request");
    } finally {
      setActionLoading(null);
      setRejectingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
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

  return (
    <>
      <div className="app__table_container">
        <div className="app__table_wrapper">
          <table className="app__table">
            <thead className="app__table_thead">
              <tr>
                <th className="app__table_th">Student</th>
                <th className="app__table_th">Requesting School</th>
                <th className="app__table_th">Target Grade</th>
                <th className="app__table_th">School Year</th>
                <th className="app__table_th">Date</th>
                <th className="app__table_th">Status</th>
                <th className="app__table_th_right">Actions</th>
              </tr>
            </thead>
            <tbody className="app__table_tbody">
              {requests.map((request) => {
                const studentName = request.student
                  ? `${request.student.last_name}, ${request.student.first_name}${request.student.middle_name ? ` ${request.student.middle_name.charAt(0)}.` : ""}`
                  : `LRN: ${request.student_lrn}`;
                const isProcessing = actionLoading === request.id;

                return (
                  <tr key={request.id} className="app__table_tr">
                    <td className="app__table_td">
                      <div className="app__table_cell_text">
                        <div className="app__table_cell_title">
                          {studentName}
                        </div>
                        <div className="app__table_cell_subtitle">
                          LRN: {request.student_lrn}
                        </div>
                      </div>
                    </td>
                    <td className="app__table_td">
                      <div className="app__table_cell_text">
                        <div className="app__table_cell_title">
                          {request.requesting_school?.name ?? "—"}
                        </div>
                      </div>
                    </td>
                    <td className="app__table_td">
                      {request.target_grade_level != null
                        ? request.target_grade_level === 0
                          ? "Kindergarten"
                          : `Grade ${request.target_grade_level}`
                        : "—"}
                    </td>
                    <td className="app__table_td">
                      {request.target_school_year ?? "—"}
                    </td>
                    <td className="app__table_td">
                      {formatDate(request.requested_at)}
                    </td>
                    <td className="app__table_td">
                      {getStatusBadge(request.status)}
                    </td>
                    <td className="app__table_td_actions">
                      <div className="app__table_action_container">
                        {request.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(request.id)}
                              disabled={isProcessing}
                              className="mr-2"
                            >
                              {isProcessing ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectClick(request.id)}
                              disabled={isProcessing}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        {request.status === "rejected" &&
                          request.rejection_reason && (
                            <span className="text-sm text-muted-foreground">
                              Reason: {request.rejection_reason}
                            </span>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {requests.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No incoming record requests
          </div>
        )}
      </div>

      <RejectReasonModal
        isOpen={rejectModalOpen}
        onClose={() => {
          setRejectModalOpen(false);
          setRejectingId(null);
        }}
        onConfirm={handleRejectConfirm}
      />
    </>
  );
}
