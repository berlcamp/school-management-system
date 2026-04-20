"use client";

import {
  DivisionReportShell,
  EmptyReportState,
  ReportTableCard,
} from "@/components/division-reports/DivisionReportShell";
import { SchoolTypeFilter } from "@/components/division-reports/SchoolTypeFilter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSchoolTypeLabel, SCHOOL_TYPES } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface SchoolRow {
  id: number;
  school_id: string;
  name: string;
  school_type: string | null;
  district: string | null;
  municipality_city: string | null;
  region: string | null;
  barangay: string | null;
  street: string | null;
  address: string | null;
  email: string | null;
  telephone_number: string | null;
  mobile_number: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  principal_name: string | null;
  principal_email: string | null;
  principal_phone: string | null;
  user_count: number;
  teacher_count: number;
}

export default function Page() {
  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [schoolType, setSchoolType] = useState<string>("all");

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("division_school_list");
      if (!isMounted) return;
      if (error) {
        toast.error(error.message);
        setRows([]);
      } else {
        setRows((data as SchoolRow[]) || []);
      }
      setLoading(false);
    };
    fetch();
    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (schoolType !== "all" && r.school_type !== schoolType) return false;
      if (!k) return true;
      return (
        r.name.toLowerCase().includes(k) ||
        r.school_id.toLowerCase().includes(k) ||
        (r.district ?? "").toLowerCase().includes(k) ||
        (r.municipality_city ?? "").toLowerCase().includes(k)
      );
    });
  }, [rows, keyword, schoolType]);

  const toExportRows = () =>
    filtered.map((r) => ({
      "School ID": r.school_id,
      Name: r.name,
      Type: getSchoolTypeLabel(r.school_type),
      District: r.district ?? "",
      "Municipality/City": r.municipality_city ?? "",
      Region: r.region ?? "",
      Address: r.address ?? "",
      Email: r.email ?? "",
      Telephone: r.telephone_number ?? "",
      Mobile: r.mobile_number ?? "",
      Facebook: r.facebook_url ?? "",
      Principal: r.principal_name ?? "",
      "Users (Total)": r.user_count,
      Teachers: r.teacher_count,
    }));

  const headers = [
    "School ID",
    "Name",
    "Type",
    "District",
    "Municipality/City",
    "Region",
    "Address",
    "Email",
    "Telephone",
    "Mobile",
    "Facebook",
    "Principal",
    "Users (Total)",
    "Teachers",
  ];

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          user_count: acc.user_count + Number(r.user_count || 0),
          teacher_count: acc.teacher_count + Number(r.teacher_count || 0),
        }),
        { user_count: 0, teacher_count: 0 },
      ),
    [filtered],
  );

  const activeFilters = [
    ...(keyword.trim()
      ? [{ label: `Search: "${keyword.trim()}"`, onClear: () => setKeyword("") }]
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
      title="School List"
      description="Directory of all active schools in the division."
      loading={loading}
      recordCount={filtered.length}
      exportDisabled={filtered.length === 0}
      onExportCsv={() => exportCsv(toExportRows(), headers, "school_list.csv")}
      onExportExcel={() =>
        exportExcel(toExportRows(), "school_list.xlsx", "Schools")
      }
      activeFilters={activeFilters}
      onClearFilters={
        activeFilters.length > 0
          ? () => {
              setKeyword("");
              setSchoolType("all");
            }
          : undefined
      }
      filterBar={
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Name, school ID, district…"
              className="h-9 w-[260px]"
            />
          </div>
          <SchoolTypeFilter value={schoolType} onChange={setSchoolType} />
        </>
      }
    >
      {filtered.length === 0 ? (
        <EmptyReportState message="No schools match the current filter." />
      ) : (
        <ReportTableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>District</TableHead>
                <TableHead>Municipality/City</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Principal</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Teachers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.school_id}</TableCell>
                  <TableCell>
                    <Link
                      href={`/division/reports/schools/${r.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell>{getSchoolTypeLabel(r.school_type)}</TableCell>
                  <TableCell>{r.district ?? "-"}</TableCell>
                  <TableCell>{r.municipality_city ?? "-"}</TableCell>
                  <TableCell>{r.email ?? "-"}</TableCell>
                  <TableCell>{r.principal_name ?? "-"}</TableCell>
                  <TableCell className="text-right">{r.user_count}</TableCell>
                  <TableCell className="text-right">
                    {r.teacher_count}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-bold bg-muted/40">
                <TableCell colSpan={7}>Division Total</TableCell>
                <TableCell className="text-right">
                  {totals.user_count}
                </TableCell>
                <TableCell className="text-right">
                  {totals.teacher_count}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ReportTableCard>
      )}
    </DivisionReportShell>
  );
}
