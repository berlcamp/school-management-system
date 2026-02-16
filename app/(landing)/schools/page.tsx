"use client";

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
import { Building2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface School {
  id: string;
  school_id: string;
  name: string;
  school_type: string | null;
  address: string | null;
  district: string | null;
}

function getSchoolTypeLabel(type: string | null | undefined): string {
  const typeMap: Record<string, string> = {
    elementary: "Elementary",
    junior_high: "Junior High",
    senior_high: "Senior High",
    integrated: "Integrated",
  };
  return type ? typeMap[type] || type : "-";
}

export default function SchoolListPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_schools")
        .select("id, school_id, name, school_type, address, district")
        .eq("is_active", true)
        .order("name");

      if (error) {
        console.error("Schools fetch error:", error);
        setSchools([]);
        return;
      }
      console.log("schools data", data);
      setSchools((data as School[]) || []);
    } catch (err) {
      console.error("Schools fetch error:", err);
      setSchools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Building2 className="h-8 w-8" />
          Public Schools
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Schools Division of Bayugan City
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>School List</CardTitle>
          <CardDescription>
            List of all schools in this division
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-8">Loading...</p>
          ) : schools.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8">
              No schools found.
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
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
                  {schools.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.school_id}
                      </TableCell>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{getSchoolTypeLabel(s.school_type)}</TableCell>
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
    </div>
  );
}
