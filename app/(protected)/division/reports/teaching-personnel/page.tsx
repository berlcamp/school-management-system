"use client";

import {
  DivisionReportShell,
  EmptyReportState,
  ReportTableCard,
} from "@/components/division-reports/DivisionReportShell";
import { SchoolTypeFilter } from "@/components/division-reports/SchoolTypeFilter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SCHOOL_TYPES } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface Row {
  school_id: number;
  school_name: string;
  total: number;
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolType, setSchoolType] = useState<string>("all");

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        "division_teaching_personnel_summary",
        { p_school_type: schoolType === "all" ? null : schoolType },
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
  }, [schoolType]);

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.total || 0), 0),
    [rows],
  );

  const exportRows = () =>
    rows.map((r) => ({
      School: r.school_name,
      "Teaching Personnel": r.total,
    }));

  const activeFilters =
    schoolType !== "all"
      ? [
          {
            label: `Type: ${
              SCHOOL_TYPES.find((t) => t.value === schoolType)?.label ??
              schoolType
            }`,
            onClear: () => setSchoolType("all"),
          },
        ]
      : [];

  return (
    <DivisionReportShell
      title="Teaching Personnel"
      description="Count of active teachers per school."
      loading={loading}
      recordCount={rows.length}
      exportDisabled={rows.length === 0}
      onExportCsv={() =>
        exportCsv(
          exportRows(),
          ["School", "Teaching Personnel"],
          "teaching_personnel.csv",
        )
      }
      onExportExcel={() =>
        exportExcel(exportRows(), "teaching_personnel.xlsx", "Teaching Personnel")
      }
      activeFilters={activeFilters}
      onClearFilters={
        activeFilters.length > 0 ? () => setSchoolType("all") : undefined
      }
      filterBar={
        <SchoolTypeFilter value={schoolType} onChange={setSchoolType} />
      }
    >
      {rows.length === 0 ? (
        <EmptyReportState message="No teachers found for this filter." />
      ) : (
        <ReportTableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead className="text-right">Teaching Personnel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.school_id}>
                  <TableCell>
                    <Link
                      href={`/division/reports/schools/${r.school_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.school_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{r.total}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-bold bg-muted/40">
                <TableCell>Division Total</TableCell>
                <TableCell className="text-right">{total}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ReportTableCard>
      )}
    </DivisionReportShell>
  );
}
