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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { GraduationCap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface SchoolLearnerRow {
  school_id: string;
  school_name: string;
  total_kinder: number;
  total_elementary: number;
  total_junior_high: number;
  total_senior_high: number;
}

function getSchoolYearOptions(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const options: string[] = [];
  for (let i = -2; i <= 2; i++) {
    const startYear = year + i;
    options.push(`${startYear}-${startYear + 1}`);
  }
  return options;
}

function getDefaultSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export default function LearnersPage() {
  const [schoolYear, setSchoolYear] = useState(getDefaultSchoolYear);
  const [district, setDistrict] = useState<string>("all");
  const [districts, setDistricts] = useState<string[]>([]);
  const [rows, setRows] = useState<SchoolLearnerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDistricts = useCallback(async () => {
    const { data } = await supabase
      .from("sms_schools")
      .select("district")
      .eq("is_active", true)
      .not("district", "is", null);

    const unique = [...new Set((data || []).map((d) => d.district as string).filter(Boolean))].sort();
    setDistricts(unique);
  }, []);

  const fetchLearners = useCallback(async () => {
    setLoading(true);
    try {
      let schoolQuery = supabase
        .from("sms_schools")
        .select("id, school_id, name, district")
        .eq("is_active", true);

      if (district && district !== "all") {
        schoolQuery = schoolQuery.eq("district", district);
      }

      const { data: schools, error: schoolError } = await schoolQuery.order(
        "name",
      );

      if (schoolError || !schools || schools.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: enrollments, error: enrollError } = await supabase
        .from("sms_enrollments")
        .select("school_id, grade_level")
        .eq("status", "approved")
        .eq("school_year", schoolYear);

      if (enrollError) {
        setRows([]);
        setLoading(false);
        return;
      }

      const schoolMap = new Map<string, { school_id: string; name: string }>();
      schools.forEach((s) => {
        schoolMap.set(String(s.id), {
          school_id: s.school_id,
          name: s.name,
        });
      });

      const countsBySchool = new Map<
        string,
        { kinder: number; elem: number; jhs: number; shs: number }
      >();

      for (const e of enrollments || []) {
        const sid = e.school_id ? String(e.school_id) : null;
        if (!sid) continue;

        if (!countsBySchool.has(sid)) {
          countsBySchool.set(sid, {
            kinder: 0,
            elem: 0,
            jhs: 0,
            shs: 0,
          });
        }
        const c = countsBySchool.get(sid)!;
        const gl = e.grade_level ?? 0;

        if (gl === 0) c.kinder++;
        else if (gl >= 1 && gl <= 6) c.elem++;
        else if (gl >= 7 && gl <= 10) c.jhs++;
        else if (gl >= 11 && gl <= 12) c.shs++;
      }

      const result: SchoolLearnerRow[] = schools.map((s) => {
        const info = schoolMap.get(String(s.id)) ?? {
          school_id: s.school_id,
          name: s.name,
        };
        const counts = countsBySchool.get(String(s.id)) ?? {
          kinder: 0,
          elem: 0,
          jhs: 0,
          shs: 0,
        };
        return {
          school_id: info.school_id,
          school_name: info.name,
          total_kinder: counts.kinder,
          total_elementary: counts.elem,
          total_junior_high: counts.jhs,
          total_senior_high: counts.shs,
        };
      });

      setRows(result);
    } catch (err) {
      console.error("Learners fetch error:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [schoolYear, district]);

  useEffect(() => {
    fetchDistricts();
  }, [fetchDistricts]);

  useEffect(() => {
    fetchLearners();
  }, [fetchLearners]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <GraduationCap className="h-8 w-8" />
          Learners
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Enrollment by school - Schools Division of Bayugan City
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Learners by School</CardTitle>
          <CardDescription>
            Total enrollment per level by school (Kinder, Elementary, Junior
            High, Senior High)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">School Year</label>
              <Select value={schoolYear} onValueChange={setSchoolYear}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getSchoolYearOptions().map((sy) => (
                    <SelectItem key={sy} value={sy}>
                      {sy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">District</label>
              <Select value={district} onValueChange={setDistrict}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All districts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All districts</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <p className="text-muted-foreground text-sm py-8">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8">
              No data found for the selected filters.
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>School ID</TableHead>
                    <TableHead>School Name</TableHead>
                    <TableHead className="text-right">Kinder</TableHead>
                    <TableHead className="text-right">Elementary</TableHead>
                    <TableHead className="text-right">Junior High</TableHead>
                    <TableHead className="text-right">Senior High</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.school_id}-${i}`}>
                      <TableCell className="font-medium">{r.school_id}</TableCell>
                      <TableCell>{r.school_name}</TableCell>
                      <TableCell className="text-right">
                        {r.total_kinder}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.total_elementary}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.total_junior_high}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.total_senior_high}
                      </TableCell>
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
