"use client";

import {
  DivisionReportShell,
  EmptyReportState,
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
import { getGradeLevelLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface Row {
  school_id: number;
  school_name: string;
  grade_level: number;
  enrolled: number;
  standard_class_size: number;
  classrooms_needed: number;
  classrooms_available: number;
  delta: number;
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sy, setSy] = useState(getCurrentSchoolYear());

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("division_classroom_needs", {
        p_school_year: sy,
      });
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

  // Group by school (one row per school summing all grade levels)
  const aggregated = useMemo(() => {
    const map = new Map<
      number,
      {
        school_id: number;
        school_name: string;
        enrolled: number;
        classrooms_needed: number;
        classrooms_available: number;
      }
    >();
    for (const r of rows) {
      const existing = map.get(Number(r.school_id));
      if (existing) {
        existing.enrolled += Number(r.enrolled || 0);
        existing.classrooms_needed += Number(r.classrooms_needed || 0);
      } else {
        map.set(Number(r.school_id), {
          school_id: Number(r.school_id),
          school_name: r.school_name,
          enrolled: Number(r.enrolled || 0),
          classrooms_needed: Number(r.classrooms_needed || 0),
          classrooms_available: Number(r.classrooms_available || 0),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.school_name.localeCompare(b.school_name),
    );
  }, [rows]);

  const totals = useMemo(
    () =>
      aggregated.reduce(
        (acc, r) => ({
          enrolled: acc.enrolled + r.enrolled,
          needed: acc.needed + r.classrooms_needed,
          available: acc.available + r.classrooms_available,
        }),
        { enrolled: 0, needed: 0, available: 0 },
      ),
    [aggregated],
  );

  const exportRows = () =>
    aggregated.map((r) => ({
      School: r.school_name,
      Enrolled: r.enrolled,
      "Classrooms Needed": r.classrooms_needed,
      "Classrooms Available": r.classrooms_available,
      Delta: r.classrooms_available - r.classrooms_needed,
    }));

  const headers = [
    "School",
    "Enrolled",
    "Classrooms Needed",
    "Classrooms Available",
    "Delta",
  ];

  const renderDelta = (available: number, needed: number) => {
    const delta = available - needed;
    if (delta >= 0) {
      return (
        <Badge variant="secondary">
          +{delta} (surplus)
        </Badge>
      );
    }
    return <Badge variant="destructive">{delta} (shortage)</Badge>;
  };

  return (
    <DivisionReportShell
      title="Classroom Needs Analysis"
      description="Classrooms needed vs available per school, based on enrollment and DepEd class size standards."
      loading={loading}
      exportDisabled={aggregated.length === 0}
      onExportCsv={() =>
        exportCsv(exportRows(), headers, "classroom_needs.csv")
      }
      onExportExcel={() =>
        exportExcel(exportRows(), "classroom_needs.xlsx", "Classroom Needs")
      }
      filterBar={<SchoolYearFilter value={sy} onChange={setSy} />}
    >
      {aggregated.length === 0 ? (
        <EmptyReportState message="No enrollment data for this school year yet." />
      ) : (
        <div className="space-y-6">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">
                    Classrooms Needed
                  </TableHead>
                  <TableHead className="text-right">
                    Classrooms Available
                  </TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregated.map((r) => (
                  <TableRow key={r.school_id}>
                    <TableCell className="font-medium">
                      {r.school_name}
                    </TableCell>
                    <TableCell className="text-right">{r.enrolled}</TableCell>
                    <TableCell className="text-right">
                      {r.classrooms_needed}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.classrooms_available}
                    </TableCell>
                    <TableCell className="text-right">
                      {renderDelta(
                        r.classrooms_available,
                        r.classrooms_needed,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold bg-muted/30">
                  <TableCell>Division Total</TableCell>
                  <TableCell className="text-right">
                    {totals.enrolled}
                  </TableCell>
                  <TableCell className="text-right">{totals.needed}</TableCell>
                  <TableCell className="text-right">
                    {totals.available}
                  </TableCell>
                  <TableCell className="text-right">
                    {renderDelta(totals.available, totals.needed)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <div className="border-b bg-muted/30 px-4 py-2 text-sm font-medium">
              Breakdown by grade level
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Grade Level</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">
                    Std. Class Size
                  </TableHead>
                  <TableHead className="text-right">Needed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows
                  .filter((r) => r.enrolled > 0)
                  .map((r, i) => (
                    <TableRow
                      key={`${r.school_id}-${r.grade_level}-${i}`}
                    >
                      <TableCell>{r.school_name}</TableCell>
                      <TableCell>
                        {getGradeLevelLabel(r.grade_level)}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.enrolled}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.standard_class_size}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.classrooms_needed}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </DivisionReportShell>
  );
}
