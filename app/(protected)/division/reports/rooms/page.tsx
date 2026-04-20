"use client";

import {
  DivisionReportShell,
  EmptyReportState,
  ReportTableCard,
} from "@/components/division-reports/DivisionReportShell";
import { SchoolTypeFilter } from "@/components/division-reports/SchoolTypeFilter";
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
import { useSchoolTypeMap } from "@/hooks/useSchoolTypeMap";
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
  school_type: string | null;
  room_type: string;
  condition: string;
  total: number;
}

const CONDITIONS = [
  { value: "good", label: "Good" },
  { value: "needs_minor_repair", label: "Needs Minor Repair" },
  { value: "needs_major_repair", label: "Needs Major Repair" },
  { value: "condemned", label: "Condemned" },
  { value: "unspecified", label: "Unspecified" },
];

const conditionLabel = (code: string) =>
  CONDITIONS.find((c) => c.value === code)?.label ?? code;

function prettyRoomType(code: string) {
  if (!code) return "-";
  return code
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [condition, setCondition] = useState<string>("all");
  const [schoolType, setSchoolType] = useState<string>("all");
  const schoolTypeMap = useSchoolTypeMap();

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("division_rooms_summary");
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

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (condition !== "all" && r.condition !== condition) return false;
        if (schoolType !== "all") {
          const t = r.school_type ?? schoolTypeMap.get(Number(r.school_id));
          if (t !== schoolType) return false;
        }
        return true;
      }),
    [rows, condition, schoolType, schoolTypeMap],
  );

  const { schools, byKey, totalsBySchool, grandTotal } = useMemo(() => {
    const schoolMap = new Map<number, string>();
    const byKey = new Map<string, number>();
    const totalsBySchool = new Map<number, number>();

    for (const r of filtered) {
      if (r.total === 0) continue;
      schoolMap.set(Number(r.school_id), r.school_name);
      const key = `${r.school_id}|${r.room_type}`;
      byKey.set(key, (byKey.get(key) ?? 0) + Number(r.total || 0));
      totalsBySchool.set(
        Number(r.school_id),
        (totalsBySchool.get(Number(r.school_id)) ?? 0) + Number(r.total || 0),
      );
    }
    const schools = Array.from(schoolMap.entries())
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([id, name]) => ({ id, name }));

    const grandTotal = Array.from(totalsBySchool.values()).reduce(
      (a, b) => a + b,
      0,
    );
    return { schools, byKey, totalsBySchool, grandTotal };
  }, [filtered]);

  const roomTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of filtered) {
      if (r.total > 0) set.add(r.room_type);
    }
    return Array.from(set).sort();
  }, [filtered]);

  const exportRows = () =>
    schools.map((s) => {
      const row: Record<string, string | number> = { School: s.name };
      for (const t of roomTypes) {
        row[prettyRoomType(t)] = byKey.get(`${s.id}|${t}`) ?? 0;
      }
      row.Total = totalsBySchool.get(s.id) ?? 0;
      return row;
    });

  const headers = ["School", ...roomTypes.map(prettyRoomType), "Total"];

  const activeFilters = [
    ...(condition !== "all"
      ? [
          {
            label: `Condition: ${conditionLabel(condition)}`,
            onClear: () => setCondition("all"),
          },
        ]
      : []),
    ...(schoolType !== "all"
      ? [
          {
            label: `Type: ${
              SCHOOL_TYPES.find((t) => t.value === schoolType)?.label ??
              schoolType
            }`,
            onClear: () => setSchoolType("all"),
          },
        ]
      : []),
  ];

  return (
    <DivisionReportShell
      title="Rooms"
      description="Room inventory per school."
      loading={loading}
      recordCount={schools.length}
      exportDisabled={schools.length === 0}
      onExportCsv={() => exportCsv(exportRows(), headers, "rooms.csv")}
      onExportExcel={() => exportExcel(exportRows(), "rooms.xlsx", "Rooms")}
      activeFilters={activeFilters}
      onClearFilters={
        activeFilters.length > 0
          ? () => {
              setCondition("all");
              setSchoolType("all");
            }
          : undefined
      }
      filterBar={
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Condition</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All conditions</SelectItem>
                {CONDITIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SchoolTypeFilter value={schoolType} onChange={setSchoolType} />
        </>
      }
    >
      {schools.length === 0 ? (
        <EmptyReportState message="No rooms recorded for the current filter." />
      ) : (
        <ReportTableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                {roomTypes.map((t) => (
                  <TableHead key={t} className="text-right">
                    {prettyRoomType(t)}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/division/reports/schools/${s.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {s.name}
                    </Link>
                  </TableCell>
                  {roomTypes.map((t) => (
                    <TableCell key={t} className="text-right">
                      {byKey.get(`${s.id}|${t}`) ?? 0}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium">
                    {totalsBySchool.get(s.id) ?? 0}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-bold bg-muted/40">
                <TableCell>Division Total</TableCell>
                {roomTypes.map((t) => {
                  const total = schools.reduce(
                    (sum, s) => sum + (byKey.get(`${s.id}|${t}`) ?? 0),
                    0,
                  );
                  return (
                    <TableCell key={t} className="text-right">
                      {total}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right">{grandTotal}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ReportTableCard>
      )}
    </DivisionReportShell>
  );
}
