"use client";

import type { CoverageRow } from "@/lib/utils/departmentMps";

export function CoverageGrid({
  rows,
  columns,
}: {
  rows: CoverageRow[];
  columns: { period: number; label: string }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Subject</th>
            <th className="px-3 py-2 text-left font-medium">Section</th>
            <th className="px-3 py-2 text-left font-medium">Teacher</th>
            {columns.map((c) => (
              <th key={c.period} className="px-3 py-2 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={3 + columns.length}
                className="px-3 py-6 text-center text-muted-foreground"
              >
                No classes to show.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={`${r.subjectId}-${r.sectionId}`} className="border-t">
              <td className="px-3 py-2">{r.subjectName}</td>
              <td className="px-3 py-2">{r.sectionName}</td>
              <td className="px-3 py-2">{r.teachers.join(", ") || "—"}</td>
              {columns.map(({ period }) => {
                const cell = r.cells[period];
                if (cell === "missing")
                  return (
                    <td
                      key={period}
                      className="px-3 py-2 text-center bg-red-100 text-red-700 font-semibold dark:bg-red-950 dark:text-red-300"
                    >
                      Missing
                    </td>
                  );
                if (cell === "future" || cell === undefined)
                  return (
                    <td key={period} className="px-3 py-2 text-center text-muted-foreground">
                      —
                    </td>
                  );
                return (
                  <td key={period} className="px-3 py-2 text-center font-medium text-green-700 dark:text-green-400">
                    {cell.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
