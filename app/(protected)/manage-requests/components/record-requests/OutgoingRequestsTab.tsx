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
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { RejectReasonDialog } from "../shared/RejectReasonDialog";
import { StatusBadge } from "../shared/StatusBadge";
import { TransferRecordViewer } from "./TransferRecordViewer";
import { RecordRequest, School, Student } from "@/types/database";
import { ArrowLeftRight, BookOpen, Loader2, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface RecordRequestRow extends RecordRequest {
  student: Student | null;
  origin_school: School | null;
}

export function OutgoingRequestsTab() {
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id ?? null;
  const userId = user?.system_user_id ?? null;

  const [requests, setRequests] = useState<RecordRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RecordRequestRow | null>(null);

  // Remove student state
  const [removeRequestId, setRemoveRequestId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);

    let query = supabase
      .from("sms_record_requests")
      .select(
        "*, student:sms_students(*), origin_school:sms_schools!sms_record_requests_origin_school_id_fkey(*)"
      )
      .eq("requesting_school_id", schoolId)
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching outgoing requests:", error);
    }
    setRequests((data as RecordRequestRow[]) ?? []);
    setLoading(false);
  }, [schoolId, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleCancelConfirm = async () => {
    if (!userId || !confirmCancelId) return;
    const id = confirmCancelId;
    setConfirmCancelId(null);
    setActionLoading(id);
    try {
      const { error } = await supabase.rpc("cancel_record_request", {
        p_request_id: id,
        p_user_id: userId,
      });
      if (error) throw error;
      toast.success("Record request cancelled.");
      fetchRequests();
    } catch {
      toast.error("Failed to cancel request");
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewRecords = (request: RecordRequestRow) => {
    setSelectedRequest(request);
    setViewerOpen(true);
  };

  const handleRemoveConfirm = async (reason: string) => {
    if (!userId || !removeRequestId) return;
    setActionLoading(removeRequestId);
    setRemoveRequestId(null);
    try {
      const { error } = await supabase.rpc("remove_transfer_student", {
        p_request_id: removeRequestId,
        p_remover_id: userId,
        p_reason: reason,
      });
      if (error) throw error;
      toast.success("Student removed. Enrollment has been dropped and origin school notified.");
      fetchRequests();
    } catch {
      toast.error("Failed to remove student");
    } finally {
      setActionLoading(null);
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

  const viewerRecordRequest = selectedRequest
    ? {
        ...selectedRequest,
        student: selectedRequest.student ?? undefined,
        origin_school: selectedRequest.origin_school ?? undefined,
      }
    : null;

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
                <th className="app__table_th">Previous School</th>
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
                const hasRecordAccess =
                  request.status === "approved" && request.record_access_granted;

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
                          {request.origin_school?.name ?? "—"}
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmCancelId(request.id)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4 mr-1" />
                            )}
                            Cancel
                          </Button>
                        )}
                        {hasRecordAccess && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewRecords(request)}
                              disabled={isProcessing}
                            >
                              <BookOpen className="h-4 w-4 mr-1" />
                              View Records
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRemoveRequestId(request.id)}
                              disabled={isProcessing}
                              className="text-destructive border-destructive/40 hover:bg-destructive/5"
                            >
                              {isProcessing ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 mr-1" />
                              )}
                              Remove Student
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
            <h3 className="app__empty_state_title">No outgoing requests</h3>
            <p className="app__empty_state_description">
              No outgoing record requests found.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmCancelId}
        onClose={() => setConfirmCancelId(null)}
        onConfirm={handleCancelConfirm}
        title="Cancel Record Request"
        description="Are you sure you want to cancel this record request? The student's enrollment will remain active."
        confirmLabel="Cancel Request"
        confirmVariant="destructive"
      />

      <RejectReasonDialog
        isOpen={!!removeRequestId}
        onClose={() => setRemoveRequestId(null)}
        onConfirm={handleRemoveConfirm}
        title="Remove Transfer Student"
        description="This will drop the student's enrollment and revert them back to their previous school. Please provide a reason. This action cannot be undone."
      />

      <TransferRecordViewer
        recordRequest={viewerRecordRequest}
        isOpen={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setSelectedRequest(null);
        }}
      />
    </>
  );
}
