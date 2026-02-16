"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import { Download, FileBarChart } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface SchoolRecord {
  id: string;
  school_id: string;
  name: string;
  school_type: string | null;
  address: string | null;
  district: string | null;
}

interface PersonnelRecord {
  name: string;
  email: string;
  type: string;
  school_name: string;
}

export default function Page() {
  const [schoolList, setSchoolList] = useState<SchoolRecord[]>([]);
  const [personnelList, setPersonnelList] = useState<PersonnelRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: schools } = await supabase
        .from("sms_schools")
        .select("id, school_id, name, school_type, address, district")
        .eq("is_active", true)
        .order("name");

      setSchoolList(schools || []);

      const { data: users } = await supabase
        .from("sms_users")
        .select("name, email, type, school_id")
        .neq("type", "division_admin");

      const schoolMap = new Map<string, string>();
      schools?.forEach((s) => schoolMap.set(String(s.id), s.name));

      const personnel: PersonnelRecord[] = (users || []).map((u) => ({
        name: u.name || "-",
        email: u.email || "-",
        type: u.type || "-",
        school_name: u.school_id
          ? schoolMap.get(String(u.school_id)) || u.school_id
          : "-",
      }));

      setPersonnelList(personnel);
    } catch (error) {
      console.error("Error fetching reports data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportToCsv = (data: Record<string, string>[], headers: string[], filename: string) => {
    const headerRow = headers.join(",");
    const rows = data.map((row) =>
      headers.map((h) => {
        const val = row[h] ?? "";
        const escaped = String(val).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(",")
    );
    const csv = [headerRow, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleExportSchoolList = () => {
    const data = schoolList.map((s) => ({
      "School ID": s.school_id,
      "Name": s.name,
      "Type": s.school_type || "",
      "Address": s.address || "",
      "District": s.district || "",
    }));
    exportToCsv(data, ["School ID", "Name", "Type", "Address", "District"], "school_list.csv");
  };

  const handleExportPersonnel = () => {
    const data = personnelList.map((p) => ({
      "Name": p.name,
      "Email": p.email,
      "Type": p.type,
      "School": p.school_name,
    }));
    exportToCsv(data, ["Name", "Email", "Type", "School"], "personnel_by_school.csv");
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <FileBarChart className="h-5 w-5" />
          Reports
        </h1>
      </div>
      <div className="app__content space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>School List</CardTitle>
            <CardDescription>
              List of all schools in this division
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportSchoolList}
              disabled={loading || schoolList.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            {loading ? (
              <p className="text-sm text-muted-foreground mt-4">Loading...</p>
            ) : schoolList.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-4">
                No schools found.
              </p>
            ) : (
              <div className="mt-4 border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>School ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>District</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schoolList.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.school_id}</TableCell>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>{s.school_type || "-"}</TableCell>
                        <TableCell>{s.address || "-"}</TableCell>
                        <TableCell>{s.district || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personnel by School</CardTitle>
            <CardDescription>
              Users grouped by school in this division
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPersonnel}
              disabled={loading || personnelList.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            {loading ? (
              <p className="text-sm text-muted-foreground mt-4">Loading...</p>
            ) : personnelList.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-4">
                No personnel found.
              </p>
            ) : (
              <div className="mt-4 border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>School</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {personnelList.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.email}</TableCell>
                        <TableCell>{p.type}</TableCell>
                        <TableCell>{p.school_name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enrollment Summary</CardTitle>
            <CardDescription>
              Per-school enrollment data (placeholder). Requires school_id on
              sections/students for full support.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This report will show enrollment counts by school once the schema
              supports school-level data.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
