"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGradeLevelLabel } from "@/lib/constants";
import type { BookAvailabilityRow } from "@/lib/utils/books";
import { Loader2, RotateCcw, UserPlus } from "lucide-react";
import Link from "next/link";

interface AllocationTableProps {
  rows: BookAvailabilityRow[];
  loading: boolean;
  schoolYear: string;
}

export function AllocationTable({ rows, loading, schoolYear }: AllocationTableProps) {
  return (
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
                  <th className="app__table_th text-right">Allocated</th>
                  <th className="app__table_th text-right">With Students</th>
                  <th className="app__table_th text-right">Held</th>
                  <th className="app__table_th text-right">Available</th>
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
  );
}
