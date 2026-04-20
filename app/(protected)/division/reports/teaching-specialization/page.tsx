"use client";

import {
  DivisionReportShell,
  EmptyReportState,
  ReportTableCard,
} from "@/components/division-reports/DivisionReportShell";
import { SchoolYearFilter } from "@/components/division-reports/SchoolYearFilter";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LEARNING_AREAS, getLearningAreaLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface Row {
  school_id: number;
  school_name: string;
  learning_area: string;
  male: number;
  female: number;
  total: number;
  status: "draft" | "submitted" | "locked" | "missing";
}

export default function Page() {
  const [sy, setSy] = useState(getCurrentSchoolYear());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        "division_teaching_specialization_summary",
        { p_school_year: sy },
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
  }, [sy]);

  const { schools, areasInUse, matrix, rowTotals, colTotals, grandTotal } =
    useMemo(() => {
      const schoolMap = new Map<
        number,
        { id: number; name: string; status: Row["status"] }
      >();
      const counts = new Map<string, number>(); // key: schoolId|area -> male+female
      const areaSet = new Set<string>();

      for (const r of rows) {
        schoolMap.set(Number(r.school_id), {
          id: Number(r.school_id),
          name: r.school_name,
          status: r.status,
        });
        if (r.learning_area) {
          areaSet.add(r.learning_area);
          const key = `${r.school_id}|${r.learning_area}`;
          counts.set(key, (counts.get(key) ?? 0) + Number(r.total || 0));
        }
      }

      const schools = Array.from(schoolMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const areasInUse = LEARNING_AREAS.map((a) => a.code).filter((c) =>
        areaSet.has(c),
      );
      const matrix: number[][] = schools.map((s) =>
        areasInUse.map((a) => counts.get(`${s.id}|${a}`) ?? 0),
      );
      const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));
      const colTotals = areasInUse.map((_, ci) =>
        matrix.reduce((sum, row) => sum + row[ci], 0),
      );
      const grandTotal = rowTotals.reduce((a, b) => a + b, 0);

      return {
        schools,
        areasInUse,
        matrix,
        rowTotals,
        colTotals,
        grandTotal,
      };
    }, [rows]);

  const exportRows = () =>
    schools.map((s, ri) => {
      const row: Record<string, string | number> = { School: s.name };
      areasInUse.forEach((a, ci) => {
        row[getLearningAreaLabel(a)] = matrix[ri][ci];
      });
      row.Total = rowTotals[ri];
      return row;
    });

  const headers = [
    "School",
    ...areasInUse.map(getLearningAreaLabel),
    "Total",
  ];

  const statusBadge = (s: Row["status"]) => {
    if (s === "missing")
      return <Badge variant="outline">Not submitted</Badge>;
    if (s === "draft") return <Badge variant="outline">Draft</Badge>;
    if (s === "submitted") return <Badge>Submitted</Badge>;
    return <Badge variant="secondary">Locked</Badge>;
  };

  return (
    <DivisionReportShell
      title="Teaching Specialization"
      description="Teachers per school by primary learning area (Filipino, English, Math, etc.)."
      loading={loading}
      recordCount={schools.length}
      exportDisabled={schools.length === 0}
      onExportCsv={() =>
        exportCsv(exportRows(), headers, `teaching_specialization_${sy}.csv`)
      }
      onExportExcel={() =>
        exportExcel(
          exportRows(),
          `teaching_specialization_${sy}.xlsx`,
          "Teaching Specialization",
        )
      }
      filterBar={<SchoolYearFilter value={sy} onChange={setSy} />}
    >
      {schools.length === 0 || areasInUse.length === 0 ? (
        <EmptyReportState message="No schools have submitted Teaching Specialization data for this SY." />
      ) : (
        <ReportTableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Status</TableHead>
                {areasInUse.map((a) => (
                  <TableHead key={a} className="text-right">
                    {getLearningAreaLabel(a)}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.map((s, ri) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{statusBadge(s.status)}</TableCell>
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
              <TableRow className="border-t-2 font-bold bg-muted/40">
                <TableCell>Division Total</TableCell>
                <TableCell />
                {colTotals.map((v, ci) => (
                  <TableCell key={ci} className="text-right">
                    {v}
                  </TableCell>
                ))}
                <TableCell className="text-right">{grandTotal}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ReportTableCard>
      )}
    </DivisionReportShell>
  );
}
