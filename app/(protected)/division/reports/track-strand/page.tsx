"use client";

import {
  DivisionReportShell,
  EmptyReportState,
  ReportTableCard,
} from "@/components/division-reports/DivisionReportShell";
import { SchoolYearFilter } from "@/components/division-reports/SchoolYearFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface Row {
  school_id: number;
  school_name: string;
  track: string;
  strand: string;
  grade_level: number;
  male: number;
  female: number;
  total: number;
  status: "draft" | "submitted" | "locked" | "missing";
}

interface SchoolAgg {
  school_id: number;
  school_name: string;
  status: Row["status"];
  male: number;
  female: number;
  total: number;
  byStrand: Map<string, { male: number; female: number; total: number }>;
  byStrandGrade: Map<string, Row>; // key: `${strand}|${grade}`
}

export default function Page() {
  const [sy, setSy] = useState(getCurrentSchoolYear());
  const [semester, setSemester] = useState<1 | 2>(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        "division_track_strand_summary",
        {
          p_school_year: sy,
          p_semester: semester,
          p_grade_level: null,
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
  }, [sy, semester]);

  const { schools, strandsInUse } = useMemo(() => {
    const map = new Map<number, SchoolAgg>();
    const strandSet = new Set<string>();

    for (const r of rows) {
      const id = Number(r.school_id);
      let agg = map.get(id);
      if (!agg) {
        agg = {
          school_id: id,
          school_name: r.school_name,
          status: r.status,
          male: 0,
          female: 0,
          total: 0,
          byStrand: new Map(),
          byStrandGrade: new Map(),
        };
        map.set(id, agg);
      }
      if (r.strand) {
        strandSet.add(r.strand);
        agg.male += Number(r.male || 0);
        agg.female += Number(r.female || 0);
        agg.total += Number(r.total || 0);
        const prev = agg.byStrand.get(r.strand) ?? {
          male: 0,
          female: 0,
          total: 0,
        };
        prev.male += Number(r.male || 0);
        prev.female += Number(r.female || 0);
        prev.total += Number(r.total || 0);
        agg.byStrand.set(r.strand, prev);
        agg.byStrandGrade.set(`${r.strand}|${r.grade_level}`, r);
      }
    }

    const schools = Array.from(map.values()).sort((a, b) =>
      a.school_name.localeCompare(b.school_name),
    );
    // Use SHS_STRANDS ordering so columns read left→right in canonical order
    const strandsInUse = SHS_STRANDS.map((s) => s.code).filter((c) =>
      strandSet.has(c),
    );
    return { schools, strandsInUse };
  }, [rows]);

  const grandTotals = useMemo(() => {
    const byStrand = new Map<string, number>();
    let grand = 0;
    for (const s of schools) {
      for (const code of strandsInUse) {
        const v = s.byStrand.get(code)?.total ?? 0;
        byStrand.set(code, (byStrand.get(code) ?? 0) + v);
      }
      grand += s.total;
    }
    return { byStrand, grand };
  }, [schools, strandsInUse]);

  const exportRows = () =>
    schools.map((s) => {
      const row: Record<string, string | number> = { School: s.school_name };
      for (const code of strandsInUse) {
        row[getStrandLabel(code)] = s.byStrand.get(code)?.total ?? 0;
      }
      row.Total = s.total;
      return row;
    });

  const headers = [
    "School",
    ...strandsInUse.map(getStrandLabel),
    "Total",
  ];

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const statusBadge = (s: Row["status"]) => {
    if (s === "missing")
      return <Badge variant="outline">Not submitted</Badge>;
    if (s === "draft") return <Badge variant="outline">Draft</Badge>;
    if (s === "submitted") return <Badge>Submitted</Badge>;
    return <Badge variant="secondary">Locked</Badge>;
  };

  return (
    <DivisionReportShell
      title="Track & Strand"
      description="SHS learners per school, grouped by strand. Click a school to expand Grade 11 / Grade 12 breakdown."
      loading={loading}
      recordCount={schools.length}
      exportDisabled={schools.length === 0}
      onExportCsv={() =>
        exportCsv(exportRows(), headers, `track_strand_${sy}_sem${semester}.csv`)
      }
      onExportExcel={() =>
        exportExcel(
          exportRows(),
          `track_strand_${sy}_sem${semester}.xlsx`,
          "Track & Strand",
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
        </>
      }
    >
      {schools.length === 0 || strandsInUse.length === 0 ? (
        <EmptyReportState message="No schools have submitted Track & Strand data for this semester." />
      ) : (
        <ReportTableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>School</TableHead>
                <TableHead>Status</TableHead>
                {strandsInUse.map((code) => (
                  <TableHead key={code} className="text-right">
                    {getStrandLabel(code)}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.map((s) => (
                <Fragment key={s.school_id}>
                  <TableRow>
                    <TableCell>
                      {s.total > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => toggle(s.school_id)}
                        >
                          {expanded.has(s.school_id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {s.school_name}
                    </TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    {strandsInUse.map((code) => (
                      <TableCell key={code} className="text-right">
                        {s.byStrand.get(code)?.total ?? 0}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">
                      {s.total}
                    </TableCell>
                  </TableRow>
                  {expanded.has(s.school_id) && (
                    <TableRow className="bg-muted/20">
                      <TableCell />
                      <TableCell colSpan={3 + strandsInUse.length}>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Strand</TableHead>
                              <TableHead>Grade</TableHead>
                              <TableHead className="text-right">
                                Male
                              </TableHead>
                              <TableHead className="text-right">
                                Female
                              </TableHead>
                              <TableHead className="text-right">
                                Total
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {strandsInUse.flatMap((code) =>
                              [11, 12].map((gl) => {
                                const r = s.byStrandGrade.get(
                                  `${code}|${gl}`,
                                );
                                if (!r || r.total === 0) return null;
                                return (
                                  <TableRow key={`${code}-${gl}`}>
                                    <TableCell>
                                      {getStrandLabel(code)}
                                    </TableCell>
                                    <TableCell>G{gl}</TableCell>
                                    <TableCell className="text-right">
                                      {r.male}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {r.female}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {r.total}
                                    </TableCell>
                                  </TableRow>
                                );
                              }),
                            )}
                          </TableBody>
                        </Table>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              <TableRow className="border-t-2 font-bold bg-muted/40">
                <TableCell />
                <TableCell>Division Total</TableCell>
                <TableCell />
                {strandsInUse.map((code) => (
                  <TableCell key={code} className="text-right">
                    {grandTotals.byStrand.get(code) ?? 0}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {grandTotals.grand}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ReportTableCard>
      )}
    </DivisionReportShell>
  );
}
