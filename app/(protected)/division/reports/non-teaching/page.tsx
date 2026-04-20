"use client";

import {
  DivisionReportShell,
  EmptyReportState,
} from "@/components/division-reports/DivisionReportShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface Row {
  school_id: number;
  school_name: string;
  staff_category_code: string;
  staff_category_label: string;
  total: number;
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        "division_non_teaching_summary",
      );
      if (!isMounted) return;
      if (error) {
        toast.error(error.message);
        setRows([]);
      } else {
        setRows((data as Row[]) || []);
      }
      setLoading(false);
    };
    fetch();
    return () => {
      isMounted = false;
    };
  }, []);

  // Pivot: schools × categories
  const { schools, categories, matrix, rowTotals, colTotals, grandTotal } =
    useMemo(() => {
      const schoolMap = new Map<
        number,
        { id: number; name: string }
      >();
      const categorySet = new Map<string, string>(); // code → label
      const counts = new Map<string, number>(); // key: "schoolId|code"

      for (const r of rows) {
        schoolMap.set(Number(r.school_id), {
          id: Number(r.school_id),
          name: r.school_name,
        });
        categorySet.set(r.staff_category_code, r.staff_category_label);
        const key = `${r.school_id}|${r.staff_category_code}`;
        counts.set(key, (counts.get(key) ?? 0) + Number(r.total || 0));
      }

      const schoolArr = Array.from(schoolMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const categoryArr = Array.from(categorySet.entries())
        .filter(([code]) => code !== "teacher")
        .sort(([, a], [, b]) => a.localeCompare(b));

      const matrix: number[][] = schoolArr.map((s) =>
        categoryArr.map(([code]) => counts.get(`${s.id}|${code}`) ?? 0),
      );

      const rowTotals = matrix.map((row) =>
        row.reduce((a, b) => a + b, 0),
      );
      const colTotals = categoryArr.map((_, ci) =>
        matrix.reduce((sum, row) => sum + row[ci], 0),
      );
      const grandTotal = rowTotals.reduce((a, b) => a + b, 0);

      return {
        schools: schoolArr,
        categories: categoryArr,
        matrix,
        rowTotals,
        colTotals,
        grandTotal,
      };
    }, [rows]);

  const exportRows = () =>
    schools.map((s, ri) => {
      const row: Record<string, string | number> = { School: s.name };
      categories.forEach(([, label], ci) => {
        row[label] = matrix[ri][ci];
      });
      row.Total = rowTotals[ri];
      return row;
    });

  const headers = [
    "School",
    ...categories.map(([, label]) => label),
    "Total",
  ];

  return (
    <DivisionReportShell
      title="Non-Teaching Personnel"
      description="Count of non-teaching staff per school, broken down by category."
      loading={loading}
      exportDisabled={schools.length === 0}
      onExportCsv={() =>
        exportCsv(exportRows(), headers, "non_teaching_personnel.csv")
      }
      onExportExcel={() =>
        exportExcel(
          exportRows(),
          "non_teaching_personnel.xlsx",
          "Non-Teaching",
        )
      }
    >
      {schools.length === 0 ? (
        <EmptyReportState message="No non-teaching staff recorded yet." />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                {categories.map(([code, label]) => (
                  <TableHead key={code} className="text-right">
                    {label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.map((s, ri) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  {matrix[ri].map((v, ci) => (
                    <TableCell key={ci} className="text-right">
                      {v}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium">
                    {rowTotals[ri]}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-semibold bg-muted/30">
                <TableCell>Division Total</TableCell>
                {colTotals.map((v, ci) => (
                  <TableCell key={ci} className="text-right">
                    {v}
                  </TableCell>
                ))}
                <TableCell className="text-right">{grandTotal}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </DivisionReportShell>
  );
}
