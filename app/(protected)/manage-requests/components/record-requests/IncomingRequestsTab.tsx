"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { useAppSelector } from "@/lib/redux/hook";
import { StatusBadge } from "../shared/StatusBadge";
import { RejectReasonDialog } from "../shared/RejectReasonDialog";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { RecordRequest, School, Student } from "@/types/database";
import { ArrowLeftRight, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface RecordRequestRow extends RecordRequest {
  student: Student | null;
  requesting_school: School | null;
}

export function IncomingRequestsTab() {
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id ?? null;
  const userId = user?.system_user_id ?? null;

  const [requests, setRequests] = useState<RecordRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  const handleApproveConfirm = async () => {
    if (!userId || !confirmApproveId) return;
    const requestId = confirmApproveId;
    setActionLoading(requestId);
    setConfirmApproveId(null);
    try {
      const { error } = await supabase.rpc("respond_to_record_request", {
        p_request_id: requestId,
        p_action: "approved",
        p_responder_id: userId,
      });
      if (error) throw error;
      toast.success(
        (t) => (
          <div className="flex items-center gap-3">
            <span>Record request approved. Records are now accessible to the requesting school.</span>
            <button
              className="font-semibold underline whitespace-nowrap"
              onClick={async () => {
                toast.dismiss(t.id);
                try {
                  const { error: undoError } = await supabase.rpc(
                    "undo_record_request_approval",
                    { p_request_id: requestId, p_user_id: userId }
                  );
                  if (undoError) throw undoError;
                  toast.success("Approval undone.");
                  fetchRequests();
                } catch {
                  toast.error("Failed to undo approval.");
                }
              }}
            >
              Undo
            </button>
          </div>
        ),
        { duration: 6000 }
      );
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
      <div className="flex justify-end mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                      <StatusBadge status={request.status} />
                    </td>
                    <td className="app__table_td_actions">
                      <div className="app__table_action_container">
                        {request.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmApproveId(request.id)}
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
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <ArrowLeftRight className="h-8 w-8" />
            </div>
            <h3 className="app__empty_state_title">No incoming requests</h3>
            <p className="app__empty_state_description">
              No incoming record requests found.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmApproveId}
        onClose={() => setConfirmApproveId(null)}
        onConfirm={handleApproveConfirm}
        title="Approve Record Request"
        description="This will grant the requesting school read access to the student's records. Are you sure you want to approve?"
        confirmLabel="Approve"
      />

      <RejectReasonDialog
        isOpen={rejectModalOpen}
        onClose={() => {
          setRejectModalOpen(false);
          setRejectingId(null);
        }}
        onConfirm={handleRejectConfirm}
        title="Reject Record Request"
        description="Please provide a reason for rejecting this record request. This will be visible to the requesting school. This action cannot be undone."
      />
    </>
  );
}
