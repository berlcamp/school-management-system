"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { BookOpen, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface HeldIssuance {
  id: string;
  student_id: string;
  book_id: string;
  date_returned: string;
  book?: { id: string; title: string; subject_area: string };
  student?: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
  };
}

export default function ReturnToManagerPage() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [issuances, setIssuances] = useState<HeldIssuance[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const teacherId = user?.system_user_id;

  const fetchHeldIssuances = useCallback(async () => {
    if (!teacherId) {
      setIssuances([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("sms_book_issuances")
      .select(
        `
        id,
        student_id,
        book_id,
        date_returned,
        book:sms_books(id, title, subject_area),
        student:sms_students!sms_book_issuances_student_id_fkey(first_name, middle_name, last_name, suffix)
      `,
      )
      .eq("issued_by", teacherId)
      .eq("school_year", schoolYear)
      .not("date_returned", "is", null)
      .is("returned_to_manager_at", null)
      .order("date_returned", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Failed to load held books");
      setIssuances([]);
    } else {
      const normalized = (data || []).map((r: Record<string, unknown>) => ({
        ...r,
        book: Array.isArray(r.book) ? r.book[0] : r.book,
        student: Array.isArray(r.student) ? r.student[0] : r.student,
      }));
      setIssuances(normalized as HeldIssuance[]);
      setSelectedIds(new Set());
    }
    setLoading(false);
  }, [teacherId, schoolYear]);

  useEffect(() => {
    if (teacherId) {
      fetchHeldIssuances();
    } else {
      setIssuances([]);
      setLoading(false);
    }
  }, [teacherId, schoolYear, fetchHeldIssuances]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === issuances.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(issuances.map((i) => i.id)));
    }
  };

  const getStudentName = (i: HeldIssuance) => {
    const s = i.student;
    if (!s) return "—";
    return `${s.last_name}, ${s.first_name}${s.middle_name ? ` ${s.middle_name}` : ""}${s.suffix ? ` ${s.suffix}` : ""}`.trim();
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one book to return");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("sms_book_issuances")
        .update({
          returned_to_manager_at: new Date().toISOString(),
        })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast.success(
        `Successfully returned ${selectedIds.size} book(s) to book manager`,
      );
      fetchHeldIssuances();
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to return books",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <RotateCcw className="h-5 w-5" />
          Return to Book Manager
        </h1>
        <div className="app__title_actions">
          <Button variant="outline" size="sm" asChild>
            <Link href="/teacher/books">Back to Books</Link>
          </Button>
        </div>
      </div>

      <div className="app__content space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Books Returned by Students (Held by You)</CardTitle>
            <CardDescription>
              Select books that students have returned to you, then submit them
              back to the book manager.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
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
              <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading...
              </div>
            ) : issuances.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No books currently held. Students return books to you first,
                then you can submit them here.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                  >
                    {selectedIds.size === issuances.length
                      ? "Deselect all"
                      : "Select all"}
                  </Button>
                  <Button
                    variant="green"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={selectedIds.size === 0 || submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Returning...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Return {selectedIds.size} to Book Manager
                      </>
                    )}
                  </Button>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="app__table">
                    <thead className="app__table_thead">
                      <tr>
                        <th className="app__table_th w-12"></th>
                        <th className="app__table_th">Student</th>
                        <th className="app__table_th">Book</th>
                        <th className="app__table_th">Date Returned</th>
                      </tr>
                    </thead>
                    <tbody className="app__table_tbody">
                      {issuances.map((i) => (
                        <tr key={i.id} className="app__table_tr">
                          <td className="app__table_td">
                            <Checkbox
                              checked={selectedIds.has(i.id)}
                              onChange={() => toggleSelect(i.id)}
                            />
                          </td>
                          <td className="app__table_td">
                            <div className="app__table_cell_text">
                              <div className="app__table_cell_title">
                                {getStudentName(i)}
                              </div>
                            </div>
                          </td>
                          <td className="app__table_td">
                            <div className="app__table_cell_text">
                              <div className="app__table_cell_title">
                                {i.book?.title ?? "—"}
                              </div>
                              {i.book?.subject_area && (
                                <div className="app__table_cell_subtitle">
                                  {i.book.subject_area}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="app__table_td">
                            {formatDate(i.date_returned)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
