"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import { Calendar, Filter, GraduationCap, Users } from "lucide-react";
import Link from "next/link";
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

    const unique = [
      ...new Set(
        (data || []).map((d) => d.district as string).filter(Boolean),
      ),
    ].sort();
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

  const totalLearners = rows.reduce(
    (acc, r) =>
      acc +
      r.total_kinder +
      r.total_elementary +
      r.total_junior_high +
      r.total_senior_high,
    0,
  );

  return (
    <div className="bg-slate-50 min-h-screen pt-20 sm:pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors shrink-0"
            >
              ← Back
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white border border-gray-200 shadow-sm">
                <GraduationCap className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Learners
                </h1>
                <p className="text-sm text-gray-500">
                  Enrollment by school — Division-wide
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content card */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Learners by School
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Total enrollment per level by school (Kinder, Elementary, Junior
              High, Senior High)
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4 p-4 rounded-xl bg-gray-50 border border-gray-200 mb-6">
            <div className="flex items-center gap-2 text-gray-700">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filters</span>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium flex items-center gap-2 text-gray-700">
                  <Calendar className="h-4 w-4" />
                  School Year
                </label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger className="w-[160px] bg-white border-gray-200 text-gray-900">
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
                <label className="text-sm font-medium text-gray-700">
                  District
                </label>
                <Select value={district} onValueChange={setDistrict}>
                  <SelectTrigger className="w-[180px] bg-white border-gray-200 text-gray-900">
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
            {!loading && rows.length > 0 && (
              <div className="ml-auto text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{totalLearners}</span>{" "}
                total learners
              </div>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 py-3 border-b border-gray-100"
                >
                  <Skeleton className="h-4 w-20 bg-gray-100" />
                  <Skeleton className="h-4 flex-1 bg-gray-100" />
                  <Skeleton className="h-4 w-12 bg-gray-100" />
                  <Skeleton className="h-4 w-12 bg-gray-100" />
                  <Skeleton className="h-4 w-12 bg-gray-100" />
                  <Skeleton className="h-4 w-12 bg-gray-100" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-gray-500 text-sm py-12 text-center rounded-2xl bg-gray-50">
              No data found for the selected filters.
            </p>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200 hover:bg-transparent">
                    <TableHead className="bg-gray-50 font-semibold text-gray-900">
                      School ID
                    </TableHead>
                    <TableHead className="bg-gray-50 font-semibold text-gray-900">
                      School Name
                    </TableHead>
                    <TableHead className="bg-gray-50 font-semibold text-gray-900 text-right">
                      Kinder
                    </TableHead>
                    <TableHead className="bg-gray-50 font-semibold text-gray-900 text-right">
                      Elementary
                    </TableHead>
                    <TableHead className="bg-gray-50 font-semibold text-gray-900 text-right">
                      Junior High
                    </TableHead>
                    <TableHead className="bg-gray-50 font-semibold text-gray-900 text-right">
                      Senior High
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow
                      key={`${r.school_id}-${i}`}
                      className="border-gray-100 transition-colors hover:bg-gray-50/80"
                    >
                      <TableCell className="font-mono font-medium text-blue-600">
                        {r.school_id}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {r.school_name}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-700">
                        {r.total_kinder}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-700">
                        {r.total_elementary}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-700">
                        {r.total_junior_high}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-700">
                        {r.total_senior_high}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
