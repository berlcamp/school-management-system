"use client";

import { Skeleton } from "@/components/ui/skeleton";
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
import { Building2, MapPin, School } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface School {
  id: string;
  school_id: string;
  slug: string;
  name: string;
  school_type: string | null;
  address: string | null;
  district: string | null;
}

function getSchoolTypeBadgeClass(type: string | null): string {
  const classes: Record<string, string> = {
    elementary: "bg-amber-50 text-amber-700 border-amber-200",
    junior_high: "bg-emerald-50 text-emerald-700 border-emerald-200",
    senior_high: "bg-violet-50 text-violet-700 border-violet-200",
    complete_secondary: "bg-rose-50 text-rose-700 border-rose-200",
    integrated: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return type
    ? (classes[type] ?? "bg-gray-50 text-gray-700 border-gray-200")
    : "bg-gray-50 text-gray-500 border-gray-200";
}

export default function SchoolListPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_schools")
        .select("id, school_id, slug, name, school_type, address, district")
        .neq("id", 9)
        .neq("id", 10)
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
                <Building2 className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Public Schools
                </h1>
                <p className="text-sm text-gray-500">
                  Schools Division of Bayugan City
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content card */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <School className="h-5 w-5 text-blue-600" />
              School List
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              List of all active schools in this division
            </p>
          </div>
          {loading ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0"
                >
                  <Skeleton className="h-4 w-20 bg-gray-100" />
                  <Skeleton className="h-4 flex-1 bg-gray-100" />
                  <Skeleton className="h-6 w-24 rounded-full bg-gray-100" />
                  <Skeleton className="h-4 w-32 hidden md:block bg-gray-100" />
                  <Skeleton className="h-4 w-16 hidden lg:block bg-gray-100" />
                </div>
              ))}
            </div>
          ) : schools.length === 0 ? (
            <p className="text-gray-500 text-sm py-12 text-center rounded-2xl bg-gray-50">
              No schools found.
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
                      Name
                    </TableHead>
                    <TableHead className="bg-gray-50 font-semibold text-gray-900">
                      Type
                    </TableHead>
                    <TableHead className="bg-gray-50 font-semibold text-gray-900 hidden md:table-cell">
                      Address
                    </TableHead>
                    <TableHead className="bg-gray-50 font-semibold text-gray-900 hidden lg:table-cell">
                      District
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schools.map((s) => (
                    <TableRow
                      key={s.id}
                      className="border-gray-100 transition-colors hover:bg-gray-50/80 cursor-pointer"
                      onClick={() => router.push(`/schools/${s.slug}`)}
                    >
                      <TableCell className="font-mono font-medium text-blue-600">
                        {s.school_id}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {s.name}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border ${getSchoolTypeBadgeClass(
                            s.school_type,
                          )}`}
                        >
                          {getSchoolTypeLabel(s.school_type)}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-600 hidden md:table-cell">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          {s.address || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-600 hidden lg:table-cell">
                        {s.district || "-"}
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
