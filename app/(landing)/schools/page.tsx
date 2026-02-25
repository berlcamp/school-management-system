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
  name: string;
  school_type: string | null;
  address: string | null;
  district: string | null;
}

function getSchoolTypeBadgeClass(type: string | null): string {
  const classes: Record<string, string> = {
    elementary: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    junior_high: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    senior_high: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    complete_secondary: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    integrated: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  };
  return type
    ? (classes[type] ?? "bg-white/10 text-white/80 border-white/20")
    : "bg-white/10 text-white/60 border-white/20";
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
        .select("id, school_id, name, school_type, address, district")
        .neq("id", 9)
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
    <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-8 py-16 sm:py-20">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-12">
        <Link
          href="/"
          className="text-sm font-medium text-white/80 hover:text-white transition-colors"
        >
          ← Back
        </Link>
      </div>

      {/* Hero */}
      <header className="mb-12">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight">
              Public Schools
            </h1>
            <p className="mt-1 text-lg text-white/80">
              Schools Division of Bayugan City
            </p>
          </div>
        </div>
      </header>

      {/* School List Card */}
      <div className="rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 sm:p-8 transition-all duration-300 hover:bg-white/15 hover:border-white/30">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <School className="h-5 w-5 text-blue-300" />
            School List
          </h2>
          <p className="text-sm text-white/60 mt-1">
            List of all active schools in this division
          </p>
        </div>
        {loading ? (
          <div className="space-y-4 py-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-3 border-b border-white/10 last:border-0"
              >
                <Skeleton className="h-4 w-20 bg-white/20" />
                <Skeleton className="h-4 flex-1 bg-white/20" />
                <Skeleton className="h-6 w-24 rounded-full bg-white/20" />
                <Skeleton className="h-4 w-32 hidden md:block bg-white/20" />
                <Skeleton className="h-4 w-16 hidden lg:block bg-white/20" />
              </div>
            ))}
          </div>
        ) : schools.length === 0 ? (
          <p className="text-white/60 text-sm py-12 text-center rounded-2xl bg-white/5">
            No schools found.
          </p>
        ) : (
          <div className="rounded-xl border border-white/20 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/20 hover:bg-transparent">
                  <TableHead className="bg-white/10 font-semibold text-white/90">
                    School ID
                  </TableHead>
                  <TableHead className="bg-white/10 font-semibold text-white/90">
                    Name
                  </TableHead>
                  <TableHead className="bg-white/10 font-semibold text-white/90">
                    Type
                  </TableHead>
                  <TableHead className="bg-white/10 font-semibold text-white/90 hidden md:table-cell">
                    Address
                  </TableHead>
                  <TableHead className="bg-white/10 font-semibold text-white/90 hidden lg:table-cell">
                    District
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((s) => (
                  <TableRow
                    key={s.id}
                    className="border-white/10 transition-colors hover:bg-white/5 cursor-pointer"
                    onClick={() => router.push(`/schools/${s.id}`)}
                  >
                    <TableCell className="font-mono font-medium text-blue-300">
                      {s.school_id}
                    </TableCell>
                    <TableCell className="font-medium text-white">
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
                    <TableCell className="text-white/70 hidden md:table-cell">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-white/50" />
                        {s.address || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-white/70 hidden lg:table-cell">
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
  );
}
