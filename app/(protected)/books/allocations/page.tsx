"use client";

import { ConfirmationModal } from "@/components/ConfirmationModal";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getEffectiveSchoolId } from "@/lib/utils/books";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { getGradeLevelLabel } from "@/lib/constants";
import { BookAllocation } from "@/types";
import { BookMarked, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AddModal, AllocationEditData } from "./AddModal";

interface IssuanceCounts {
  withStudents: number;
  heldByTeacher: number;
  returnedToManager: number;
}

type AllocationWithCounts = BookAllocation & {
  teacher?: { name?: string };
  book?: { title?: string; subject_area?: string; grade_level?: number };
  counts: IssuanceCounts;
};

export default function AllocationsPage() {
  const user = useAppSelector((state) => state.user.user);
  const [allocations, setAllocations] = useState<AllocationWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [editData, setEditData] = useState<AllocationEditData | null>(null);
  const [toDelete, setToDelete] = useState<AllocationWithCounts | null>(null);

  const effectiveSchoolId = getEffectiveSchoolId(user);

  const fetchAllocations = useCallback(async () => {
    if (!effectiveSchoolId) {
      setAllocations([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: allocData, error } = await supabase
      .from("sms_book_allocations")
      .select(
        `
        *,
        book:sms_books(id, title, subject_area, grade_level),
        teacher:sms_users!sms_book_allocations_teacher_id_fkey(id, name)
      `,
      )
      .eq("school_id", effectiveSchoolId)
      .eq("school_year", schoolYear)
      .order("teacher_id")
      .order("book_id");

    if (error || !allocData?.length) {
      setAllocations([]);
      setLoading(false);
      return;
    }

    // Fetch all issuances for these allocations in one query
    const teacherIds = [...new Set(allocData.map((a) => a.teacher_id))];
    const { data: issuances } = await supabase
      .from("sms_book_issuances")
      .select("book_id, issued_by, date_returned, returned_to_manager_at")
      .in("issued_by", teacherIds)
      .eq("school_year", schoolYear);

    // Build a lookup keyed by "teacher_id:book_id"
    const countsMap = new Map<string, IssuanceCounts>();
    for (const row of issuances ?? []) {
      const key = `${row.issued_by}:${row.book_id}`;
      if (!countsMap.has(key)) {
        countsMap.set(key, {
          withStudents: 0,
          heldByTeacher: 0,
          returnedToManager: 0,
        });
      }
      const c = countsMap.get(key)!;
      if (row.returned_to_manager_at) {
        c.returnedToManager += 1;
      } else if (row.date_returned) {
        c.heldByTeacher += 1;
      } else {
        c.withStudents += 1;
      }
    }

    const result: AllocationWithCounts[] = allocData.map((a) => {
      const key = `${a.teacher_id}:${a.book_id}`;
      return {
        ...(a as BookAllocation & {
          teacher?: { name?: string };
          book?: {
            title?: string;
            subject_area?: string;
            grade_level?: number;
          };
        }),
        counts: countsMap.get(key) ?? {
          withStudents: 0,
          heldByTeacher: 0,
          returnedToManager: 0,
        },
      };
    });

    setAllocations(result);
    setLoading(false);
  }, [effectiveSchoolId, schoolYear]);

  useEffect(() => {
    if (effectiveSchoolId) {
      fetchAllocations();
    } else {
      setAllocations([]);
      setLoading(false);
    }
  }, [effectiveSchoolId, schoolYear, fetchAllocations]);

  const copiesOut = (a: AllocationWithCounts) =>
    a.counts.withStudents + a.counts.heldByTeacher;

  const openAdd = () => {
    setEditData(null);
    setModalOpen(true);
  };

  const openEdit = (a: AllocationWithCounts) => {
    setEditData({
      id: a.id,
      teacher_id: a.teacher_id,
      book_id: a.book_id,
      quantity: a.quantity,
      teacherName: a.teacher?.name ?? "—",
      bookTitle: a.book?.title ?? "—",
      minQuantity: copiesOut(a),
    });
    setModalOpen(true);
  };

  const requestDelete = (a: AllocationWithCounts) => {
    const out = copiesOut(a);
    if (out > 0) {
      toast.error(
        `${out} cop${out === 1 ? "y is" : "ies are"} still out with this teacher or their learners. Have them returned to the manager before deleting this allocation.`,
      );
      return;
    }
    setToDelete(a);
  };

  const handleDelete = async () => {
    if (!toDelete || !effectiveSchoolId) return;
    const { error } = await supabase
      .from("sms_book_allocations")
      .delete()
      .eq("id", toDelete.id)
      .eq("school_id", effectiveSchoolId);
    if (error) {
      toast.error(error.message || "Failed to delete allocation");
      throw error;
    }
    toast.success("Allocation deleted");
    setToDelete(null);
    await fetchAllocations();
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BookMarked className="h-5 w-5" />
          Book Allocations
        </h1>
        <div className="app__title_actions">
          <Button variant="outline" size="sm" asChild>
            <Link href="/books">Back to Books</Link>
          </Button>
          <Button variant="green" size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Allocation
          </Button>
        </div>
      </div>

      <div className="app__content space-y-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">School Year</label>
            <select
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="flex h-10 w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {getSchoolYearOptions().map((sy) => (
                <option key={sy} value={sy}>
                  {sy}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <TableSkeleton />
        ) : allocations.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <BookMarked className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No allocations found</p>
            <p className="app__empty_state_description">
              Allocate book quantities to teachers and advisers for this school
              year.
            </p>
            <Button
              variant="green"
              size="sm"
              onClick={openAdd}
              className="mt-4"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Allocation
            </Button>
          </div>
        ) : (
          <div className="app__table_container">
            <div className="app__table_wrapper">
              <table className="app__table">
                <thead className="app__table_thead">
                  <tr>
                    <th className="app__table_th">Teacher / User</th>
                    <th className="app__table_th">Book</th>
                    <th className="app__table_th">Subject Area</th>
                    <th className="app__table_th">Grade Level</th>
                    <th className="app__table_th">Allocated</th>
                    <th className="app__table_th">With Students</th>
                    <th className="app__table_th">Held by Teacher</th>
                    <th className="app__table_th">Returned to Manager</th>
                    <th className="app__table_th"></th>
                  </tr>
                </thead>
                <tbody className="app__table_tbody">
                  {allocations.map((a) => (
                    <tr key={a.id} className="app__table_tr">
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_title">
                            {a.teacher?.name ?? "—"}
                          </div>
                        </div>
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_title">
                            {a.book?.title ?? "—"}
                          </div>
                        </div>
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_subtitle">
                            {a.book?.subject_area ?? "—"}
                          </div>
                        </div>
                      </td>
                      <td className="app__table_td">
                        {a.book?.grade_level != null ? (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                            {getGradeLevelLabel(a.book.grade_level)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="app__table_td">
                        <span className="font-medium">{a.quantity}</span>
                      </td>
                      <td className="app__table_td">
                        <span
                          className={
                            a.counts.withStudents > 0
                              ? "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800"
                              : "text-muted-foreground text-sm"
                          }
                        >
                          {a.counts.withStudents}
                        </span>
                      </td>
                      <td className="app__table_td">
                        <span
                          className={
                            a.counts.heldByTeacher > 0
                              ? "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800"
                              : "text-muted-foreground text-sm"
                          }
                        >
                          {a.counts.heldByTeacher}
                        </span>
                      </td>
                      <td className="app__table_td">
                        <span
                          className={
                            a.counts.returnedToManager > 0
                              ? "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800"
                              : "text-muted-foreground text-sm"
                          }
                        >
                          {a.counts.returnedToManager}
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
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                onClick={() => openEdit(a)}
                                className="cursor-pointer"
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => requestDelete(a)}
                                variant="destructive"
                                className="cursor-pointer"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AddModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditData(null);
        }}
        schoolYear={schoolYear}
        onSuccess={fetchAllocations}
        editData={editData}
      />

      <ConfirmationModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        destructive
        message={
          <p className="text-sm">
            Delete the allocation of{" "}
            <span className="font-medium">
              {toDelete?.book?.title ?? "this book"}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {toDelete?.teacher?.name ?? "this teacher"}
            </span>{" "}
            for {schoolYear}?
          </p>
        }
      />
    </div>
  );
}
