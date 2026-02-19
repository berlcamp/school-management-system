"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Building2, MapPin, School } from "lucide-react";
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

function getSchoolTypeBadgeClass(type: string | null): string {
  const classes: Record<string, string> = {
    elementary:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    junior_high:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    senior_high:
      "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
    integrated:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };
  return type ? classes[type] ?? "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400";
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero Section */}
      <section className="mb-10">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-8 sm:p-12 shadow-2xl shadow-blue-500/25 dark:shadow-blue-900/30">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Public Schools
              </h1>
              <p className="mt-1 text-lg text-blue-100">
                Schools Division of Bayugan City
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* School List Card */}
      <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-900/50">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-500" />
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <School className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            School List
          </CardTitle>
          <CardDescription>
            List of all active schools in this division
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-4 w-32 hidden md:block" />
                  <Skeleton className="h-4 w-16 hidden lg:block" />
                </div>
              ))}
            </div>
          ) : schools.length === 0 ? (
            <p className="text-muted-foreground text-sm py-12 text-center rounded-xl bg-slate-50 dark:bg-slate-800/30">
              No schools found.
            </p>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                    <TableHead className="bg-slate-50 dark:bg-slate-800/50 font-semibold text-slate-700 dark:text-slate-300">
                      School ID
                    </TableHead>
                    <TableHead className="bg-slate-50 dark:bg-slate-800/50 font-semibold text-slate-700 dark:text-slate-300">
                      Name
                    </TableHead>
                    <TableHead className="bg-slate-50 dark:bg-slate-800/50 font-semibold text-slate-700 dark:text-slate-300">
                      Type
                    </TableHead>
                    <TableHead className="bg-slate-50 dark:bg-slate-800/50 font-semibold text-slate-700 dark:text-slate-300 hidden md:table-cell">
                      Address
                    </TableHead>
                    <TableHead className="bg-slate-50 dark:bg-slate-800/50 font-semibold text-slate-700 dark:text-slate-300 hidden lg:table-cell">
                      District
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schools.map((s) => (
                    <TableRow
                      key={s.id}
                      className="border-slate-100 dark:border-slate-800 transition-colors"
                    >
                      <TableCell className="font-mono font-medium text-blue-600 dark:text-blue-400">
                        {s.school_id}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-white">
                        {s.name}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getSchoolTypeBadgeClass(
                            s.school_type,
                          )}`}
                        >
                          {getSchoolTypeLabel(s.school_type)}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400 hidden md:table-cell">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          {s.address || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400 hidden lg:table-cell">
                        {s.district || "-"}
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
