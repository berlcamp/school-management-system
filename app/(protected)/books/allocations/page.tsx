"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getEffectiveSchoolId } from "@/lib/utils/books";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { BookAllocation } from "@/types";
import { BookMarked, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AddModal } from "./AddModal";

export default function AllocationsPage() {
  const user = useAppSelector((state) => state.user.user);
  const [allocations, setAllocations] = useState<BookAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());

  const effectiveSchoolId = getEffectiveSchoolId(user);

  const fetchAllocations = useCallback(async () => {
    if (!effectiveSchoolId) {
      setAllocations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
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

    if (error) {
      console.error(error);
      setAllocations([]);
    } else {
      setAllocations(data as BookAllocation[]);
    }
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
          <Button variant="green" size="sm" onClick={() => setModalOpen(true)}>
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
              onClick={() => setModalOpen(true)}
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
                    <th className="app__table_th">Teacher / Adviser</th>
                    <th className="app__table_th">Book</th>
                    <th className="app__table_th">Subject Area</th>
                    <th className="app__table_th">Grade Level</th>
                    <th className="app__table_th">Quantity</th>
                  </tr>
                </thead>
                <tbody className="app__table_tbody">
                  {allocations.map((a: BookAllocation) => (
                    <tr key={a.id} className="app__table_tr">
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_title">
                            {(a as BookAllocation & { teacher?: { name?: string } })
                              .teacher?.name ?? "—"}
                          </div>
                        </div>
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_title">
                            {(a as BookAllocation & { book?: { title?: string } })
                              .book?.title ?? "—"}
                          </div>
                        </div>
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_subtitle">
                            {(a as BookAllocation & {
                              book?: { subject_area?: string };
                            }).book?.subject_area ?? "—"}
                          </div>
                        </div>
                      </td>
                      <td className="app__table_td">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                          Grade{" "}
                          {(a as BookAllocation & {
                            book?: { grade_level?: number };
                          }).book?.grade_level ?? "—"}
                        </span>
                      </td>
                      <td className="app__table_td">
                        <span className="font-medium">{a.quantity}</span>
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
        onClose={() => setModalOpen(false)}
        schoolYear={schoolYear}
        onSuccess={fetchAllocations}
      />
    </div>
  );
}
