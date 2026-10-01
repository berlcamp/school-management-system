"use client";

/**
 * Shared TOS table for both the Division and Teacher examination pages.
 *   - division mode: status badge; a row is editable only by its QA-authorized
 *     author while draft/returned (194).
 *   - teacher mode: a division row is view/print-only and badged "From
 *     Division"; a school-wide row (160) is badged and editable by its author
 *     and by the school head; the teacher's own private rows are editable.
 * Mounts the edit builder and the view/print modal.
 */

import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getGradeLevelLabel } from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { deleteItem } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import {
  EXAM_TIER_BADGE_CLASS,
  canManageTieredRow,
  examTier,
} from "@/lib/utils/examVisibility";
import { canEditReviewRow } from "@/lib/utils/examReview";
import { getGradingPeriodLabel } from "@/lib/utils/schoolYear";
import { generateTosTitle } from "@/lib/utils/tos";
import type { Tos } from "@/types";
import { Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { TosBuilderModal } from "./TosBuilderModal";
import { ReviewHistoryDialogProvider } from "./review/ReviewHistoryDialogContext";
import { ReviewStatusBadge } from "./review/ReviewStatusBadge";
import { TosViewModal } from "./TosViewModal";

interface TosListProps {
  mode: "division" | "teacher";
  userId: string | number | null;
  schoolId: number | null;
  /** Division mode (194): may this reader edit their own draft / returned rows. */
  isAuthorizedAuthor?: boolean;
  /** Division mode: extra dropdown items per row (submit, history, ...). */
  renderReviewActions?: (item: Tos) => React.ReactNode;
}

export function TosList({
  mode,
  userId,
  schoolId,
  isAuthorizedAuthor,
  renderReviewActions,
}: TosListProps) {
  const dispatch = useAppDispatch();
  const list = useSelector(
    (state: { list: { value: Tos[] } }) => state.list.value,
  );
  // The tier check needs the reader's role, which the page does not pass down.
  const userType = useAppSelector((state) => state.user.user?.type) ?? null;

  const [viewItem, setViewItem] = useState<Tos | null>(null);
  const [editItem, setEditItem] = useState<Tos | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tos | null>(null);

  // Division rows are edited only by their QA-authorized author while a draft
  // or returned (194 enforces this). School-side, the author always may,
  // and a school-wide row (160) is additionally the school head's to edit —
  // somebody has to be able to fix the school's own paper when its author is
  // away. `can_manage_exam` in migration 161 is the enforced copy of this.
  const canEdit = (item: Tos) =>
    mode === "division"
      ? canEditReviewRow(item, {
          userId,
          isAuthorizedAuthor: !!isAuthorizedAuthor,
        })
      : canManageTieredRow(item, { userId, schoolId, type: userType });

  const displayTitle = (item: Tos) =>
    item.title?.trim() || generateTosTitle(item);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("sms_tos")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Successfully deleted!");
      dispatch(deleteItem(deleteTarget));
      setDeleteTarget(null);
    }
  };

  return (
    <ReviewHistoryDialogProvider>
      <div className="app__table_container">
        <div className="app__table_wrapper">
          <table className="app__table">
            <thead className="app__table_thead">
              <tr>
                <th className="app__table_th">Title</th>
                <th className="app__table_th">Subject</th>
                <th className="app__table_th">Grade</th>
                <th className="app__table_th">Period</th>
                <th className="app__table_th">Items</th>
                <th className="app__table_th">Status</th>
                <th className="app__table_th_right">Actions</th>
              </tr>
            </thead>
            <tbody className="app__table_tbody">
              {list.map((item) => (
                <tr key={item.id} className="app__table_tr">
                  <td className="app__table_td">
                    <div className="app__table_cell_title">
                      {displayTitle(item)}
                    </div>
                    {mode === "teacher" && examTier(item) !== "private" && (
                      <span
                        className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${EXAM_TIER_BADGE_CLASS[examTier(item)]}`}
                      >
                        {examTier(item) === "division"
                          ? "From Division"
                          : "School-wide"}
                      </span>
                    )}
                    {mode === "division" && (
                      <div className="mt-0.5">
                        <ReviewStatusBadge status={item.review_status} />
                      </div>
                    )}
                    {mode === "division" &&
                      item.review_status === "rejected" &&
                      item.review_comment && (
                        <p className="mt-0.5 text-xs text-red-700">
                          QA: {item.review_comment}
                        </p>
                      )}
                  </td>
                  <td className="app__table_td">{item.subject_name}</td>
                  <td className="app__table_td">
                    {getGradeLevelLabel(item.grade_level)}
                  </td>
                  <td className="app__table_td">
                    {getGradingPeriodLabel(
                      item.school_year,
                      item.grading_period,
                    )}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {item.school_year}
                    </span>
                  </td>
                  <td className="app__table_td">{item.total_items}</td>
                  <td className="app__table_td">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="app__table_td_actions">
                    <div className="app__table_action_container">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => setViewItem(item)}
                            className="cursor-pointer"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View / Print
                          </DropdownMenuItem>
                          {renderReviewActions?.(item)}
                          {canEdit(item) && (
                            <>
                              <DropdownMenuItem
                                onClick={() => setEditItem(item)}
                                className="cursor-pointer"
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(item)}
                                variant="destructive"
                                className="cursor-pointer"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ConfirmationModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          message="Delete this Table of Specification? Its competencies and item placement will also be removed."
        />

        <TosViewModal
          isOpen={!!viewItem}
          tos={viewItem}
          onClose={() => setViewItem(null)}
        />

        <TosBuilderModal
          isOpen={!!editItem}
          editData={editItem}
          mode={mode}
          schoolId={schoolId}
          userId={userId}
          onClose={() => setEditItem(null)}
        />
      </div>
    </ReviewHistoryDialogProvider>
  );
}
