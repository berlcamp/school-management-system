"use client";

/**
 * Shared exams table for the Division and Teacher examination pages.
 *   - division mode: every row editable/deletable.
 *   - teacher mode: division rows are view/print-only with a "From Division"
 *     badge; a school-wide row (160) carries a "School-wide" badge and is
 *     editable by its author and by the school head; the teacher's own private
 *     rows are editable. A super admin additionally sees the active school's
 *     private rows, badged "Another teacher's" and read-only.
 * Rows carry a joined `tos` (subject/grade/period) for display.
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
import { getGradingPeriodLabel } from "@/lib/utils/schoolYear";
import { generateTosTitle } from "@/lib/utils/tos";
import type { Exam } from "@/types";
import { Eye, MoreVertical, Pencil, ScanLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { ExamBuilderModal } from "./ExamBuilderModal";
import { ExamViewModal } from "./ExamViewModal";

interface JoinedTos {
  subject_name: string;
  grade_level: number;
  exam_type: string;
  grading_period: number;
  school_year: string;
  title: string | null;
}

export type ExamRow = Exam & { tos?: JoinedTos | null };

interface ExamListProps {
  mode: "division" | "teacher";
  userId: string | number | null;
  schoolId: number | null;
}

export function ExamList({ mode, userId, schoolId }: ExamListProps) {
  const dispatch = useAppDispatch();
  const list = useSelector(
    (state: { list: { value: ExamRow[] } }) => state.list.value,
  );
  // The tier check needs the reader's role, which the page does not pass down.
  const userType = useAppSelector((state) => state.user.user?.type) ?? null;

  const [viewItem, setViewItem] = useState<Exam | null>(null);
  const [editItem, setEditItem] = useState<Exam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  /** sms_users.id -> name, for the rows this reader did not write. */
  const [authors, setAuthors] = useState<Record<string, string>>({});

  // Per-exam workspace: answer key, printable answer sheets, scanning, results.
  const workspaceBase =
    mode === "teacher"
      ? "/teacher/examinations/exam"
      : "/division/examinations/exam";

  // Division mode edits every division row. School-side, the author always may,
  // and a school-wide row (160) is additionally the school head's to edit —
  // somebody has to be able to fix the school's own paper when its author is
  // away. `can_manage_exam` in migration 161 is the enforced copy of this.
  const canEdit = (item: ExamRow) =>
    mode === "division" ||
    canManageTieredRow(item, { userId, schoolId, type: userType });

  const displayTitle = (item: ExamRow) =>
    item.title?.trim() || (item.tos ? generateTosTitle(item.tos) : "Exam");

  const isMine = (item: ExamRow) =>
    userId != null && String(item.created_by) === String(userId);

  // Authors are looked up here rather than embedded in each page's query: an
  // embed has to name the relationship, and the live schema is known to
  // disagree with the migration files about names (the 116/157 lesson), where
  // a second query cannot fail the list it annotates. One page of rows, so the
  // `in` list is at most PER_PAGE ids and usually a handful of distinct ones.
  const authorIds = Array.from(
    new Set(
      list
        .filter((item) => item.created_by != null && !isMine(item))
        .map((item) => String(item.created_by)),
    ),
  );
  const authorKey = authorIds.join(",");

  useEffect(() => {
    if (!authorKey) {
      setAuthors({});
      return;
    }
    let isMounted = true;
    (async () => {
      const { data } = await supabase
        .from("sms_users")
        .select("id, name")
        .in("id", authorKey.split(","));
      if (!isMounted) return;
      setAuthors(
        Object.fromEntries(
          (data ?? []).map((u) => [String(u.id), (u.name as string) ?? ""]),
        ),
      );
    })();
    return () => {
      isMounted = false;
    };
  }, [authorKey]);

  // Who wrote this paper, shown only when it is not the reader's own — on
  // their own list every row would carry their own name and say nothing. A
  // division row's author is the division office, which the badge already
  // says, so it is named too: "From Division" does not identify a person.
  const authorName = (item: ExamRow): string | null =>
    isMine(item) ? null : authors[String(item.created_by)] || null;

  // The reader's own private rows carry no badge either. A private row that is
  // NOT theirs only reaches the list at all for a super admin, who is shown
  // whose paper it is rather than left to assume the school shared it.
  const tierBadge = (item: ExamRow): string | null => {
    const tier = examTier(item);
    if (tier === "division") return "From Division";
    if (tier === "school") return "School-wide";
    return isMine(item) ? null : "Another teacher's";
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("sms_exams")
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
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">Exam</th>
              <th className="app__table_th">Version</th>
              <th className="app__table_th">Subject</th>
              <th className="app__table_th">Grade</th>
              <th className="app__table_th">Period</th>
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    {mode === "teacher" && tierBadge(item) && (
                      <span
                        className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${EXAM_TIER_BADGE_CLASS[examTier(item)]}`}
                      >
                        {tierBadge(item)}
                      </span>
                    )}
                    {authorName(item) && (
                      <span className="mt-0.5 text-[11px] text-muted-foreground">
                        by {authorName(item)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="app__table_td">{item.version_label}</td>
                <td className="app__table_td">{item.tos?.subject_name ?? "—"}</td>
                <td className="app__table_td">
                  {item.tos ? getGradeLevelLabel(item.tos.grade_level) : "—"}
                </td>
                <td className="app__table_td">
                  {item.tos
                    ? getGradingPeriodLabel(
                        item.tos.school_year,
                        item.tos.grading_period,
                      )
                    : "—"}
                </td>
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
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          onClick={() => setViewItem(item)}
                          className="cursor-pointer"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View / Print
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`${workspaceBase}/${item.id}`}>
                            <ScanLine className="mr-2 h-4 w-4" />
                            {mode === "teacher"
                              ? "Answer Key & Scanning"
                              : "Answer Key"}
                          </Link>
                        </DropdownMenuItem>
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
        message="Delete this exam? Its questions, choices and answer key will also be removed."
      />

      <ExamViewModal
        isOpen={!!viewItem}
        exam={viewItem}
        onClose={() => setViewItem(null)}
      />

      <ExamBuilderModal
        isOpen={!!editItem}
        editData={editItem}
        mode={mode}
        schoolId={schoolId}
        userId={userId}
        onClose={() => setEditItem(null)}
      />
    </div>
  );
}
