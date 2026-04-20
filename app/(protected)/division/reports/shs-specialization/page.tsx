"use client";

import {
  DivisionReportShell,
  EmptyReportState,
  ReportTableCard,
} from "@/components/division-reports/DivisionReportShell";
import { SchoolYearFilter } from "@/components/division-reports/SchoolYearFilter";
import { Badge } from "@/components/ui/badge";
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
import { SHS_STRANDS, getStrandLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { Fragment, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface Row {
  school_id: number;
  school_name: string;
  strand: string;
  specialization: string;
  grade_level: number;
  male: number;
  female: number;
  total: number;
  status: "draft" | "submitted" | "locked" | "missing";
}

export default function Page() {
  const [sy, setSy] = useState(getCurrentSchoolYear());
  const [semester, setSemester] = useState<1 | 2>(1);
  const [strand, setStrand] = useState<string>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        "division_shs_specialization_summary",
        {
          p_school_year: sy,
          p_semester: semester,
          p_grade_level: null,
          p_strand: strand === "all" ? null : strand,
        },
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
  }, [sy, semester, strand]);

  const { grouped, statusBySchool, grandTotals } = useMemo(() => {
    // Group by (strand, specialization) → rows per school.
    // Each row in the UI: one strand+specialization with schools aggregated.
    interface Bucket {
      strand: string;
      specialization: string;
      bySchool: Map<
        number,
        { school_name: string; male: number; female: number; total: number }
      >;
      male: number;
      female: number;
      total: number;
    }
    const buckets = new Map<string, Bucket>();
    const statusBySchool = new Map<number, Row["status"]>();

    for (const r of rows) {
      statusBySchool.set(Number(r.school_id), r.status);
      if (!r.strand || !r.specialization) continue;
      const key = `${r.strand}|${r.specialization}`;
      let b = buckets.get(key);
      if (!b) {
        b = {
          strand: r.strand,
          specialization: r.specialization,
          bySchool: new Map(),
          male: 0,
          female: 0,
          total: 0,
        };
        buckets.set(key, b);
      }
      const prev = b.bySchool.get(Number(r.school_id)) ?? {
        school_name: r.school_name,
        male: 0,
        female: 0,
        total: 0,
      };
      prev.male += Number(r.male || 0);
      prev.female += Number(r.female || 0);
      prev.total += Number(r.total || 0);
      b.bySchool.set(Number(r.school_id), prev);
      b.male += Number(r.male || 0);
      b.female += Number(r.female || 0);
      b.total += Number(r.total || 0);
    }

    // Sort buckets by canonical strand order then specialization A→Z
    const strandOrder = new Map(
      SHS_STRANDS.map((s, i) => [s.code, i] as const),
    );
    const sorted = Array.from(buckets.values()).sort((a, b) => {
      const sa = strandOrder.get(a.strand) ?? 999;
      const sb = strandOrder.get(b.strand) ?? 999;
      if (sa !== sb) return sa - sb;
      return a.specialization.localeCompare(b.specialization);
    });

    const grandTotals = sorted.reduce(
      (acc, b) => ({
        male: acc.male + b.male,
        female: acc.female + b.female,
        total: acc.total + b.total,
      }),
      { male: 0, female: 0, total: 0 },
    );

    return { grouped: sorted, statusBySchool, grandTotals };
  }, [rows]);

  const exportRows = () =>
    grouped.flatMap((b) =>
      Array.from(b.bySchool.entries()).map(([, v]) => ({
        Strand: getStrandLabel(b.strand),
        Specialization: b.specialization,
        School: v.school_name,
        Male: v.male,
        Female: v.female,
        Total: v.total,
      })),
    );

  const headers = [
    "Strand",
    "Specialization",
    "School",
    "Male",
    "Female",
    "Total",
  ];

  const submittedCount = useMemo(() => {
    let n = 0;
    for (const s of statusBySchool.values()) {
      if (s === "submitted" || s === "locked") n++;
    }
    return n;
  }, [statusBySchool]);

  return (
    <DivisionReportShell
      title="SHS Specialization"
      description="Senior High learners per specialization, grouped by strand."
      loading={loading}
      recordCount={grouped.length}
      exportDisabled={grouped.length === 0}
      onExportCsv={() =>
        exportCsv(
          exportRows(),
          headers,
          `shs_specialization_${sy}_sem${semester}.csv`,
        )
      }
      onExportExcel={() =>
        exportExcel(
          exportRows(),
          `shs_specialization_${sy}_sem${semester}.xlsx`,
          "SHS Specialization",
        )
      }
      filterBar={
        <>
          <SchoolYearFilter value={sy} onChange={setSy} />
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Semester</Label>
            <Select
              value={String(semester)}
              onValueChange={(v) => setSemester(Number(v) as 1 | 2)}
            >
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Sem 1</SelectItem>
                <SelectItem value="2">Sem 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Strand</Label>
            <Select value={strand} onValueChange={setStrand}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All strands</SelectItem>
                {SHS_STRANDS.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="pb-1 text-xs text-muted-foreground">
            {submittedCount} school{submittedCount !== 1 ? "s" : ""} submitted
          </div>
        </>
      }
    >
      {grouped.length === 0 ? (
        <EmptyReportState message="No SHS specialization data for this filter yet." />
      ) : (
        <ReportTableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strand / Specialization</TableHead>
                <TableHead>School</TableHead>
                <TableHead className="text-right">Male</TableHead>
                <TableHead className="text-right">Female</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((b) => (
                <Fragment key={`${b.strand}|${b.specialization}`}>
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell colSpan={2}>
                      <span className="text-xs uppercase text-muted-foreground">
                        {getStrandLabel(b.strand)}
                      </span>
                      <div>{b.specialization}</div>
                    </TableCell>
                    <TableCell className="text-right">{b.male}</TableCell>
                    <TableCell className="text-right">{b.female}</TableCell>
                    <TableCell className="text-right">{b.total}</TableCell>
                  </TableRow>
                  {Array.from(b.bySchool.entries()).map(([id, v]) => (
                    <TableRow key={`${b.strand}-${b.specialization}-${id}`}>
                      <TableCell />
                      <TableCell>
                        <div>{v.school_name}</div>
                        <StatusLine status={statusBySchool.get(id)} />
                      </TableCell>
                      <TableCell className="text-right">{v.male}</TableCell>
                      <TableCell className="text-right">{v.female}</TableCell>
                      <TableCell className="text-right">{v.total}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              <TableRow className="border-t-2 font-bold bg-muted/40">
                <TableCell colSpan={2}>Division Total</TableCell>
                <TableCell className="text-right">{grandTotals.male}</TableCell>
                <TableCell className="text-right">
                  {grandTotals.female}
                </TableCell>
                <TableCell className="text-right">
                  {grandTotals.total}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ReportTableCard>
      )}
    </DivisionReportShell>
  );
}

function StatusLine({ status }: { status: Row["status"] | undefined }) {
  if (!status || status === "missing") return null;
  if (status === "draft")
    return (
      <Badge variant="outline" className="mt-1 text-[10px]">
        Draft
      </Badge>
    );
  if (status === "submitted")
    return (
      <Badge className="mt-1 text-[10px]" variant="default">
        Submitted
      </Badge>
    );
  return (
    <Badge className="mt-1 text-[10px]" variant="secondary">
      Locked
    </Badge>
  );
}
