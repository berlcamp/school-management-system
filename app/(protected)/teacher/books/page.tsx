"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { supabase } from "@/lib/supabase/client";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  BookMarked,
  BookOpen,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface AllocatedBookRow {
  allocationId: string;
  bookId: string;
  title: string;
  subjectArea: string;
  gradeLevel: number;
  quantity: number;
  withStudents: number;
  held: number;
  available: number;
}

interface SummaryStats {
  totalAllocated: number;
  withStudents: number;
  held: number;
  available: number;
}

export default function TeacherBooksPage() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [rows, setRows] = useState<AllocatedBookRow[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({
    totalAllocated: 0,
    withStudents: 0,
    held: 0,
    available: 0,
  });
  const [loading, setLoading] = useState(true);

  const teacherId = user?.system_user_id;
  const effectiveSchoolId =
    user?.school_id != null ? String(user.school_id) : "";

  const fetchAllocations = useCallback(async () => {
    if (!teacherId || !effectiveSchoolId) {
      setRows([]);
      setSummary({ totalAllocated: 0, withStudents: 0, held: 0, available: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);

    const [allocResult, issuancesResult] = await Promise.all([
      supabase
        .from("sms_book_allocations")
        .select(
          `
          id,
          quantity,
          book:sms_books(id, title, subject_area, grade_level)
        `,
        )
        .eq("teacher_id", teacherId)
        .eq("school_year", schoolYear),
      supabase
        .from("sms_book_issuances")
        .select("book_id, date_returned, returned_to_manager_at")
        .eq("issued_by", teacherId)
        .eq("school_year", schoolYear),
    ]);

    const allocations = allocResult.data;
    const issuances = issuancesResult.data ?? [];

    if (allocResult.error || !allocations?.length) {
      setRows([]);
      setSummary({ totalAllocated: 0, withStudents: 0, held: 0, available: 0 });
      setLoading(false);
      return;
    }

    const byBook: Record<
      string,
      { withStudents: number; held: number }
    > = {};
    for (const i of issuances) {
      const bid = String(i.book_id);
      if (!byBook[bid]) byBook[bid] = { withStudents: 0, held: 0 };
      if (i.date_returned == null) {
        byBook[bid].withStudents += 1;
      } else if (i.returned_to_manager_at == null) {
        byBook[bid].held += 1;
      }
    }

    const rowsData: AllocatedBookRow[] = [];
    let totalWithStudents = 0;
    let totalHeld = 0;
    let totalAvailable = 0;

    for (const alloc of allocations) {
      const book = Array.isArray(alloc.book) ? alloc.book[0] : alloc.book;
      if (!book) continue;

      const bookId = String((book as { id: string }).id);
      const quantity = (alloc as { quantity: number }).quantity;
      const counts = byBook[bookId] ?? { withStudents: 0, held: 0 };
      const withStudents = counts.withStudents;
      const held = counts.held;
      const available = quantity - withStudents;

      totalWithStudents += withStudents;
      totalHeld += held;
      totalAvailable += available;

      rowsData.push({
        allocationId: String((alloc as { id: string }).id),
        bookId,
        title: (book as { title: string }).title,
        subjectArea: (book as { subject_area: string }).subject_area ?? "",
        gradeLevel: (book as { grade_level: number }).grade_level ?? 0,
        quantity,
        withStudents,
        held,
        available,
      });
    }

    setRows(rowsData);
    setSummary({
      totalAllocated: rowsData.reduce((s, r) => s + r.quantity, 0),
      withStudents: totalWithStudents,
      held: totalHeld,
      available: totalAvailable,
    });
    setLoading(false);
  }, [teacherId, effectiveSchoolId, schoolYear]);

  useEffect(() => {
    if (teacherId && effectiveSchoolId) {
      fetchAllocations();
    } else {
      setRows([]);
      setSummary({ totalAllocated: 0, withStudents: 0, held: 0, available: 0 });
      setLoading(false);
    }
  }, [teacherId, effectiveSchoolId, schoolYear, fetchAllocations]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BookMarked className="h-5 w-5" />
          My Allocated Books
        </h1>
        <div className="app__title_actions">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">School Year</span>
            <Select value={schoolYear} onValueChange={setSchoolYear}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getSchoolYearOptions().map((sy) => (
                  <SelectItem key={sy} value={sy}>
                    {sy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="app__content space-y-6">
        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Allocated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalAllocated}</div>
              <p className="text-xs text-muted-foreground">
                Books from book manager
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                With Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {summary.withStudents}
              </div>
              <p className="text-xs text-muted-foreground">
                Currently issued to learners
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Held (to return)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {summary.held}
              </div>
              <p className="text-xs text-muted-foreground">
                Returned by students, ready to return to manager
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Available to Issue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {summary.available}
              </div>
              <p className="text-xs text-muted-foreground">
                Can issue to students
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="transition-colors hover:bg-muted/50">
            <Link href="/teacher/books/issue">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserPlus className="h-4 w-4" />
                  Issue to Students
                </CardTitle>
                <CardDescription>
                  Issue allocated books to learners in your sections.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm">
                  <BookOpen className="h-4 w-4 mr-1.5" />
                  Go to Issue
                </Button>
              </CardContent>
            </Link>
          </Card>

          <Card className="transition-colors hover:bg-muted/50">
            <Link href="/books/issuances">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="h-4 w-4" />
                  Record Student Returns
                </CardTitle>
                <CardDescription>
                  Record when students return books to you.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm">
                  Record Returns
                </Button>
              </CardContent>
            </Link>
          </Card>

          <Card className="transition-colors hover:bg-muted/50">
            <Link href="/teacher/books/return-to-manager">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <RotateCcw className="h-4 w-4" />
                  Return to Book Manager
                </CardTitle>
                <CardDescription>
                  Submit books returned by students back to the book manager.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm">
                  {summary.held > 0 ? (
                    <>
                      Return {summary.held} books
                    </>
                  ) : (
                    "Go to Return"
                  )}
                </Button>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* Allocated books table */}
        <Card>
          <CardHeader>
            <CardTitle>Books Allocated to You</CardTitle>
            <CardDescription>
              All books assigned by the book manager for {schoolYear}. Issue to
              students or return to manager as needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading allocated books...
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-muted-foreground">
                  No books allocated to you for this school year.
                </p>
                <p className="text-sm text-muted-foreground">
                  Ask the book manager to allocate books to you.
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="app__table">
                  <thead className="app__table_thead">
                    <tr>
                      <th className="app__table_th">Book</th>
                      <th className="app__table_th">Subject</th>
                      <th className="app__table_th">Grade</th>
                      <th className="app__table_th text-right">
                        Allocated
                      </th>
                      <th className="app__table_th text-right">
                        With Students
                      </th>
                      <th className="app__table_th text-right">Held</th>
                      <th className="app__table_th text-right">
                        Available
                      </th>
                      <th className="app__table_th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="app__table_tbody">
                    {rows.map((row) => (
                      <tr key={row.allocationId} className="app__table_tr">
                        <td className="app__table_td">
                          <div className="app__table_cell_text">
                            <div className="app__table_cell_title">
                              {row.title}
                            </div>
                          </div>
                        </td>
                        <td className="app__table_td">
                          <span className="text-muted-foreground">
                            {row.subjectArea || "—"}
                          </span>
                        </td>
                        <td className="app__table_td">
                          {getGradeLevelLabel(row.gradeLevel)}
                        </td>
                        <td className="app__table_td text-right">
                          {row.quantity}
                        </td>
                        <td className="app__table_td text-right">
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {row.withStudents}
                          </span>
                        </td>
                        <td className="app__table_td text-right">
                          {row.held > 0 ? (
                            <span className="font-medium text-amber-600 dark:text-amber-400">
                              {row.held}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="app__table_td text-right">
                          <span className="font-medium text-green-600 dark:text-green-400">
                            {row.available}
                          </span>
                        </td>
                        <td className="app__table_td text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              disabled={row.available <= 0}
                            >
                              <Link
                                href="/teacher/books/issue"
                                className={
                                  row.available <= 0
                                    ? "pointer-events-none opacity-50"
                                    : ""
                                }
                              >
                                <UserPlus className="h-4 w-4 mr-1" />
                                Issue
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              disabled={row.available <= 0}
                            >
                              <Link
                                href="/teacher/books/return-to-manager"
                                className={
                                  row.available <= 0
                                    ? "pointer-events-none opacity-50"
                                    : ""
                                }
                              >
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Return
                                {row.available > 0 ? ` (${row.available})` : ""}
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
