"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { getRequestSignedUrl, updateRequestStatus } from "@/lib/requests/actions";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { StatusBadge } from "../shared/StatusBadge";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { RejectReasonDialog } from "../shared/RejectReasonDialog";
import type {
  DocumentRequestWithRelations,
  RequestStatus,
} from "@/types/database";
import {
  Download,
  Eye,
  FileText,
  GraduationCap,
  Loader2,
  Paperclip,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { StatusTimeline } from "./StatusTimeline";
import { UploadSF10Modal } from "./UploadSF10Modal";

interface DetailModalProps {
  requestId: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

const statusLabel: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

export function DetailModal({ requestId, onClose, onRefresh }: DetailModalProps) {
  const user = useAppSelector((state) => state.user.user);
  const [request, setRequest] = useState<DocumentRequestWithRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<RequestStatus | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    const { data } = await supabase
      .from("sms_requests")
      .select("*, attachments:sms_request_attachments(*), logs:sms_request_logs(*)")
      .eq("id", requestId)
      .single();
    if (data) {
      const typedData = data as unknown as DocumentRequestWithRelations;
      if (typedData.logs) {
        typedData.logs = [...typedData.logs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      setRequest(typedData);
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    if (requestId) {
      fetchDetail();
    } else {
      setRequest(null);
    }
  }, [requestId, fetchDetail]);

  const handleStatusChange = async (
    newStatus: RequestStatus,
    reason?: string
  ) => {
    if (!requestId || !user?.system_user_id) return;
    setActionLoading(true);
    const result = await updateRequestStatus(requestId, newStatus, {
      reason,
      userId: user.system_user_id,
      userName: user.name ?? "Staff",
    });
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(
        `Request marked as ${statusLabel[newStatus] ?? newStatus}.`
      );
      onRefresh();
      fetchDetail();
    }
    setActionLoading(false);
  };

  const handleDownloadAttachment = async (
    filePath: string,
    bucket: "request-attachments" | "sf10-documents"
  ) => {
    const result = await getRequestSignedUrl(filePath, bucket);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      window.open(result.url, "_blank");
    }
  };

  if (!requestId) return null;

  return (
    <>
      <Dialog open={!!requestId} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {loading ? (
            <>
              <DialogTitle className="sr-only">Loading request</DialogTitle>
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </>
          ) : request ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 flex-wrap">
                  <DialogTitle className="font-mono text-base">
                    {request.tracking_number}
                  </DialogTitle>
                  <StatusBadge status={request.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Submitted {new Date(request.created_at).toLocaleString()}
                </p>
              </DialogHeader>

              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {request.request_type === "form137" ? (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  )}
                  {request.request_type === "form137"
                    ? "School Form 10"
                    : "Diploma"}
                </div>

                <Separator />

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Requester
                    </h4>
                    <InfoRow label="Name" value={request.requester_name} />
                    <InfoRow
                      label="Type"
                      value={
                        <span className="capitalize">{request.requester_type}</span>
                      }
                    />
                    <InfoRow
                      label="Relationship"
                      value={request.requester_relationship}
                    />
                    <InfoRow label="Contact" value={request.requester_contact} />
                    {request.requester_email && (
                      <InfoRow label="Email" value={request.requester_email} />
                    )}
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Student
                    </h4>
                    <InfoRow label="Name" value={request.student_name} />
                    <InfoRow label="LRN" value={request.student_lrn} />
                    {request.last_school_attended && (
                      <InfoRow
                        label="Last School"
                        value={request.last_school_attended}
                      />
                    )}
                    {request.year_graduated && (
                      <InfoRow
                        label="Year Graduated"
                        value={request.year_graduated}
                      />
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Purpose
                  </h4>
                  <p className="text-sm">{request.purpose}</p>
                </div>

                {request.rejection_reason && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-xs font-semibold text-destructive mb-1">
                      Rejection Reason
                    </p>
                    <p className="text-sm">{request.rejection_reason}</p>
                  </div>
                )}

                <Separator />

                {(request.attachments?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5" />
                      Attachments
                    </h4>
                    <div className="space-y-1.5">
                      {request.attachments!.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/50 border"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{att.file_name}</span>
                            {att.category === "sf10_delivery" && (
                              <Badge variant="green" className="text-[10px] shrink-0">
                                SF10
                              </Badge>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 gap-1"
                            onClick={() =>
                              handleDownloadAttachment(
                                att.file_path,
                                att.category === "sf10_delivery"
                                  ? "sf10-documents"
                                  : "request-attachments"
                              )
                            }
                          >
                            <Download className="h-3.5 w-3.5" />
                            View
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Activity
                  </h4>
                  <StatusTimeline logs={request.logs ?? []} />
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  {request.status === "pending" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmAction("under_review")}
                        disabled={actionLoading}
                        className="gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Mark Under Review
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRejectOpen(true)}
                        disabled={actionLoading}
                        className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </>
                  )}

                  {request.status === "under_review" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setConfirmAction("approved")}
                        disabled={actionLoading}
                        className="gap-1.5"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRejectOpen(true)}
                        disabled={actionLoading}
                        className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </>
                  )}

                  {request.status === "approved" && (
                    <Button
                      size="sm"
                      variant="green"
                      onClick={() => setUploadOpen(true)}
                      disabled={actionLoading}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Upload SF10 &amp; Complete
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogTitle className="sr-only">Request not found</DialogTitle>
              <p className="text-sm text-muted-foreground py-8 text-center">
                Request not found.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {request && (
        <>
          <ConfirmDialog
            isOpen={confirmAction === "under_review"}
            onClose={() => setConfirmAction(null)}
            onConfirm={async () => {
              setConfirmAction(null);
              await handleStatusChange("under_review");
            }}
            title="Mark as Under Review"
            description="Mark this request as under review? The requester will be notified."
            confirmLabel="Mark Under Review"
          />
          <ConfirmDialog
            isOpen={confirmAction === "approved"}
            onClose={() => setConfirmAction(null)}
            onConfirm={async () => {
              setConfirmAction(null);
              await handleStatusChange("approved");
            }}
            title="Approve Request"
            description="Are you sure you want to approve this request?"
            confirmLabel="Approve"
          />
          <RejectReasonDialog
            isOpen={rejectOpen}
            onClose={() => setRejectOpen(false)}
            onConfirm={(reason) => handleStatusChange("rejected", reason)}
          />
          <UploadSF10Modal
            isOpen={uploadOpen}
            onClose={() => setUploadOpen(false)}
            requestId={request.id}
            trackingNumber={request.tracking_number}
            onSuccess={() => {
              onRefresh();
              fetchDetail();
            }}
          />
        </>
      )}
    </>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
