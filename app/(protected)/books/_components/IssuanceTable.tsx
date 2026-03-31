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
import { formatStudentName, formatDatePH } from "@/lib/utils/books";
import type { IssuanceRow, SectionOption } from "@/hooks/useBooks";
import { Loader2, RotateCcw } from "lucide-react";

interface IssuanceTableProps {
  issuances: IssuanceRow[];
  loading: boolean;
  sectionId: string;
  schoolYear: string;
  selectedSection?: SectionOption;
  isTeacher: boolean;
  currentUserId?: number;
  onReturnClick: (row: IssuanceRow) => void;
}

export function IssuanceTable({
  issuances,
  loading,
  sectionId,
  schoolYear,
  selectedSection,
  isTeacher,
  currentUserId,
  onReturnClick,
}: IssuanceTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Issuance Records</CardTitle>
        <CardDescription>
          {sectionId
            ? `Books issued and returned for ${selectedSection ? `${getGradeLevelLabel(selectedSection.grade_level)} - ${selectedSection.name}` : ""} (${schoolYear})`
            : "Select a section to view issuance records"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!sectionId ? (
          <div className="py-12 text-center text-muted-foreground">
            Select a section and school year to view book issuances.
          </div>
        ) : loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading...
          </div>
        ) : issuances.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            {isTeacher
              ? "No book issuances for this section yet."
              : 'No book issuances yet. Click "Issue Books" to record book issuance for this section.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="app__table">
              <thead className="app__table_thead">
                <tr>
                  <th className="app__table_th">No.</th>
                  <th className="app__table_th">Learner Name</th>
                  <th className="app__table_th">Grade</th>
                  <th className="app__table_th">Section</th>
                  <th className="app__table_th">Book Title</th>
                  <th className="app__table_th">Date Issued</th>
                  <th className="app__table_th">Date Returned</th>
                  <th className="app__table_th">Condition</th>
                  <th className="app__table_th">Return Code</th>
                  <th className="app__table_th_right">Actions</th>
                </tr>
              </thead>
              <tbody className="app__table_tbody">
                {issuances.map((row, idx) => (
                  <tr key={row.id} className="app__table_tr">
                    <td className="app__table_td">{idx + 1}</td>
                    <td className="app__table_td">
                      <div className="app__table_cell_text">
                        <div className="app__table_cell_title">
                          {formatStudentName(row.student)}
                        </div>
                      </div>
                    </td>
                    <td className="app__table_td">
                      {row.section
                        ? getGradeLevelLabel(row.section.grade_level)
                        : "—"}
                    </td>
                    <td className="app__table_td">
                      {row.section?.name ?? "—"}
                    </td>
                    <td className="app__table_td">
                      <div className="app__table_cell_text">
                        <div className="app__table_cell_title">
                          {row.book?.title ?? "—"}
                        </div>
                        {row.book?.subject_area && (
                          <div className="app__table_cell_subtitle">
                            {row.book.subject_area}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="app__table_td">
                      {formatDatePH(row.date_issued)}
                    </td>
                    <td className="app__table_td">
                      {row.date_returned
                        ? formatDatePH(row.date_returned)
                        : row.return_code || "—"}
                    </td>
                    <td className="app__table_td">
                      {row.condition_on_return || "—"}
                    </td>
                    <td className="app__table_td">
                      {row.return_code ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                          {row.return_code}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="app__table_td_actions">
                      {!row.date_returned &&
                        (!isTeacher ||
                          String(row.issued_by) ===
                            String(currentUserId)) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onReturnClick(row)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Return
                          </Button>
                        )}
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
