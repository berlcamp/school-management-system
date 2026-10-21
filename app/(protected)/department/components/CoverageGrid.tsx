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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">
          MPS per class and term; Missing marks a started term with no MPS encoded
        </caption>
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-2.5 text-left font-medium">Subject</th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">Section</th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">Teacher</th>
            {columns.map((c) => (
              <th key={c.period} scope="col" className="px-3 py-2.5 text-center font-medium">
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
                className="px-5 py-10 text-center text-muted-foreground"
              >
                No classes to show.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={`${r.subjectId}-${r.sectionId}`} className="border-t hover:bg-muted/40">
              <th scope="row" className="px-5 py-2 text-left font-medium">{r.subjectName}</th>
              <td className="px-3 py-2">{r.sectionName}</td>
              <td className="px-3 py-2">{r.teachers.join(", ") || "—"}</td>
              {columns.map(({ period }) => {
                const cell = r.cells[period];
                if (cell === "missing")
                  return (
                    <td
                      key={period}
                      className="px-3 py-2 text-center"
                    >
                      <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        Missing
                      </span>
                    </td>
                  );
                if (cell === "future" || cell === undefined)
                  return (
                    <td key={period} className="px-3 py-2 text-center text-muted-foreground">
                      —
                    </td>
                  );
                return (
                  <td key={period} className="px-3 py-2 text-center font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
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
