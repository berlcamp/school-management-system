"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { updateRequestStatus } from "@/lib/requests/actions";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";

import { escapeIlikePattern } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { FileText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { DetailModal } from "./DetailModal";
import { RejectReasonDialog } from "../shared/RejectReasonDialog";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { DocumentRequestsFilter, type RequestsFilter } from "./DocumentRequestsFilter";
import { DocumentRequestsList } from "./DocumentRequestsList";

const PER_PAGE = 10;

export function DocumentRequestsTab() {
  const user = useAppSelector((state) => state.user.user);
  const dispatch = useAppDispatch();

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState<RequestsFilter>({
    keyword: "",
    status: "all",
    requester_type: "all",
    request_type: "all",
  });

  const [detailId, setDetailId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<{ id: string; previousStatus: string } | null>(null);
  const [confirmUnderReviewId, setConfirmUnderReviewId] = useState<string | null>(null);
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const keywordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    let isMounted = true;

    let query = supabase
      .from("sms_requests")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

    if (user?.school_id != null) {
      query = query.eq("school_id", user.school_id);
    }
    if (filter.status !== "all") {
      query = query.eq("status", filter.status);
    }
    if (filter.requester_type !== "all") {
      query = query.eq("requester_type", filter.requester_type);
    }
    if (filter.request_type !== "all") {
      query = query.eq("request_type", filter.request_type);
    }
    if (filter.keyword.trim()) {
      const escaped = escapeIlikePattern(filter.keyword.trim());
      query = query.or(
        `tracking_number.ilike.%${escaped}%,requester_name.ilike.%${escaped}%,student_name.ilike.%${escaped}%,student_lrn.ilike.%${escaped}%`
      );
    }

    const { data, count } = await query;

    if (isMounted) {
      dispatch(addList(data ?? []));
      setTotalCount(count ?? 0);
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [page, filter, user, dispatch]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleFilterChange = (f: RequestsFilter) => {
    if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
    keywordTimerRef.current = setTimeout(() => {
      setPage(1);
      setFilter(f);
    }, 300);
  };

  const handleMarkUnderReviewConfirm = async () => {
    if (!user?.system_user_id || !confirmUnderReviewId) return;
    const id = confirmUnderReviewId;
    setConfirmUnderReviewId(null);
    const result = await updateRequestStatus(id, "under_review", {
      userId: user.system_user_id,
      userName: user.name ?? "Staff",
    });
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Marked as Under Review.");
      fetchRequests();
    }
  };

  const handleApproveConfirm = async () => {
    if (!user?.system_user_id || !confirmApproveId) return;
    const id = confirmApproveId;
    setConfirmApproveId(null);
    const result = await updateRequestStatus(id, "approved", {
      userId: user.system_user_id,
      userName: user.name ?? "Staff",
    });
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Request approved.");
      fetchRequests();
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectId || !user?.system_user_id) return;
    const { id } = rejectId;
    const result = await updateRequestStatus(id, "rejected", {
      reason,
      userId: user.system_user_id,
      userName: user.name ?? "Staff",
    });
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Request rejected.");
      setRejectId(null);
      fetchRequests();
    }
  };

  const totalPages = Math.ceil(totalCount / PER_PAGE);

  const getPageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <DocumentRequestsFilter value={filter} onChange={handleFilterChange} />
      </div>

      {loading ? (
        <TableSkeleton />
      ) : totalCount === 0 ? (
        <div className="app__empty_state">
          <div className="app__empty_state_icon">
            <FileText className="h-8 w-8" />
          </div>
          <h3 className="app__empty_state_title">No requests found</h3>
          <p className="app__empty_state_description">
            {filter.keyword || filter.status !== "all"
              ? "Try adjusting the filters."
              : "No document requests have been submitted yet."}
          </p>
        </div>
      ) : (
        <>
          <DocumentRequestsList
            onViewDetail={setDetailId}
            onMarkUnderReview={setConfirmUnderReviewId}
            onApprove={setConfirmApproveId}
            onReject={(id, status) => setRejectId({ id, previousStatus: status })}
          />

          {totalPages > 1 && (
            <div className="app__pagination">
              <span className="text-sm text-muted-foreground">
                {(page - 1) * PER_PAGE + 1}–
                {Math.min(page * PER_PAGE, totalCount)} of {totalCount}
              </span>
              <div className="app__pagination_controls">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <div className="app__pagination_page_numbers">
                  {getPageNumbers().map((n) => (
                    <Button
                      key={n}
                      variant={n === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <DetailModal
        requestId={detailId}
        onClose={() => setDetailId(null)}
        onRefresh={fetchRequests}
      />

      <ConfirmDialog
        isOpen={!!confirmUnderReviewId}
        onClose={() => setConfirmUnderReviewId(null)}
        onConfirm={handleMarkUnderReviewConfirm}
        title="Mark as Under Review"
        description="Mark this request as under review? The requester will be notified."
        confirmLabel="Mark Under Review"
      />

      <ConfirmDialog
        isOpen={!!confirmApproveId}
        onClose={() => setConfirmApproveId(null)}
        onConfirm={handleApproveConfirm}
        title="Approve Request"
        description="Are you sure you want to approve this request?"
        confirmLabel="Approve"
      />

      <RejectReasonDialog
        isOpen={!!rejectId}
        onClose={() => setRejectId(null)}
        onConfirm={handleRejectConfirm}
      />
    </div>
  );
}
