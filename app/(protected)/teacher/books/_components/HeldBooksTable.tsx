"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatStudentName, formatDatePH } from "@/lib/utils/books";
import type { HeldIssuance } from "@/hooks/useBooks";

interface HeldBooksTableProps {
  issuances: HeldIssuance[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

export function HeldBooksTable({
  issuances,
  selectedIds,
  onToggle,
}: HeldBooksTableProps) {
  return (
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
                  onChange={() => onToggle(i.id)}
                />
              </td>
              <td className="app__table_td">
                <div className="app__table_cell_text">
                  <div className="app__table_cell_title">
                    {formatStudentName(i.student)}
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
                {formatDatePH(i.date_returned)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
