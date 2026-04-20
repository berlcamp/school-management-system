"use client";

import {
  DivisionReportShell,
  EmptyReportState,
  ReportTableCard,
} from "@/components/division-reports/DivisionReportShell";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        exportExcel(
          exportRows(),
          "teaching_personnel.xlsx",
          "Teaching Personnel",
        )
      }
      filterBar={
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">School Type</Label>
          <Select value={schoolType} onValueChange={setSchoolType}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {SCHOOL_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                  <TableCell className="font-medium">{r.school_name}</TableCell>
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
