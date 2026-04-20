"use client";

import {
  DivisionReportShell,
  EmptyReportState,
} from "@/components/division-reports/DivisionReportShell";
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
import { getSchoolTypeLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
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
    if (!k) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(k) ||
        r.school_id.toLowerCase().includes(k) ||
        (r.district ?? "").toLowerCase().includes(k) ||
        (r.municipality_city ?? "").toLowerCase().includes(k),
    );
  }, [rows, keyword]);

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

  const headers: (keyof ReturnType<typeof toExportRows>[number])[] = [
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

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        user_count: acc.user_count + Number(r.user_count || 0),
        teacher_count: acc.teacher_count + Number(r.teacher_count || 0),
      }),
      { user_count: 0, teacher_count: 0 },
    );
  }, [filtered]);

  return (
    <DivisionReportShell
      title="School List"
      description="Directory of all active schools in the division."
      loading={loading}
      exportDisabled={filtered.length === 0}
      onExportCsv={() =>
        exportCsv(toExportRows(), headers, "school_list.csv")
      }
      onExportExcel={() =>
        exportExcel(toExportRows(), "school_list.xlsx", "Schools")
      }
      filterBar={
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Name, school ID, district…"
            className="h-9 w-[260px]"
          />
        </div>
      }
    >
      {filtered.length === 0 ? (
        <EmptyReportState message="No schools match the current filter." />
      ) : (
        <div className="rounded-md border overflow-x-auto">
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
                  <TableCell className="font-medium">{r.name}</TableCell>
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
              <TableRow className="border-t-2 font-semibold bg-muted/30">
                <TableCell colSpan={7}>Division Total</TableCell>
                <TableCell className="text-right">{totals.user_count}</TableCell>
                <TableCell className="text-right">
                  {totals.teacher_count}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </DivisionReportShell>
  );
}
