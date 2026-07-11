"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  aralProgramLabel,
  ARAL_PROGRAMS,
  ARAL_STATUSES,
  ARAL_TIERS,
  getGradeLevelLabel,
} from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { AralEnrollment } from "@/types";
import { Loader2, Sprout } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface SectionRow {
  sectionName: string;
  gradeLevel: number;
  tiers: Record<string, number>;
  statuses: Record<string, number>;
  total: number;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [program, setProgram] = useState<string>("all");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SectionRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("sms_aral_enrollments")
        .select(
          "section_id, grade_level, tier, status, program, school_id, school_year",
        )
        .eq("school_year", schoolYear);
      if (user?.school_id != null) {
        query = query.eq("school_id", Number(user.school_id));
      }
      if (program !== "all") query = query.eq("program", program);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const records = (data || []) as Partial<AralEnrollment>[];

      // Resolve section names.
      const sectionIds = [
        ...new Set(
          records
            .map((r) => r.section_id)
            .filter((id): id is string => id != null),
        ),
      ];
      const sectionNames: Record<string, string> = {};
      if (sectionIds.length > 0) {
        const { data: sections } = await supabase
          .from("sms_sections")
          .select("id, name")
          .in("id", sectionIds);
        (sections || []).forEach((s) => {
          sectionNames[String(s.id)] = s.name as string;
        });
      }

      const bySection: Record<string, SectionRow> = {};
      records.forEach((r) => {
        const key = r.section_id != null ? String(r.section_id) : "unassigned";
        if (!bySection[key]) {
          bySection[key] = {
            sectionName:
              r.section_id != null
                ? (sectionNames[key] ?? `Section ${key}`)
                : "Unassigned",
            gradeLevel: r.grade_level ?? -1,
            tiers: {},
            statuses: {},
            total: 0,
          };
        }
        const row = bySection[key];
        if (r.tier) row.tiers[r.tier] = (row.tiers[r.tier] ?? 0) + 1;
        if (r.status)
          row.statuses[r.status] = (row.statuses[r.status] ?? 0) + 1;
        row.total += 1;
      });

      setRows(
        Object.values(bySection).sort(
          (a, b) =>
            a.gradeLevel - b.gradeLevel ||
            a.sectionName.localeCompare(b.sectionName),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load report.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [program, schoolYear, user?.school_id]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const tiers: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    let total = 0;
    rows.forEach((r) => {
      ARAL_TIERS.forEach((t) => {
        tiers[t.value] = (tiers[t.value] ?? 0) + (r.tiers[t.value] ?? 0);
      });
      ARAL_STATUSES.forEach((s) => {
        statuses[s.value] =
          (statuses[s.value] ?? 0) + (r.statuses[s.value] ?? 0);
      });
      total += r.total;
    });
    return { tiers, statuses, total };
  }, [rows]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Sprout className="h-5 w-5" />
          ARAL Intervention
        </h1>
        <p className="text-sm text-muted-foreground">
          School-wide roster of learners in the ARAL intervention program, by
          section, target tier and status.
        </p>
      </div>

      <div className="app__content space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="w-44">
                <label className="text-xs font-medium mb-1 block">Program</label>
                <Select value={program} onValueChange={setProgram}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All programs</SelectItem>
                    {ARAL_PROGRAMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <label className="text-xs font-medium mb-1 block">
                  School Year
                </label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getSchoolYearOptions().map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No ARAL enrollments for{" "}
                {program === "all" ? "any program" : aralProgramLabel(program)}{" "}
                in {schoolYear}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse min-w-full">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border px-3 py-2 text-left">Section</th>
                      <th className="border px-3 py-2 text-left">Grade</th>
                      {ARAL_TIERS.map((t) => (
                        <th key={t.value} className="border px-3 py-2 text-center">
                          {t.label}
                        </th>
                      ))}
                      {ARAL_STATUSES.map((s) => (
                        <th key={s.value} className="border px-3 py-2 text-center">
                          {s.label}
                        </th>
                      ))}
                      <th className="border px-3 py-2 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={`${r.sectionName}-${r.gradeLevel}`}
                        className="hover:bg-muted/30"
                      >
                        <td className="border px-3 py-1.5">{r.sectionName}</td>
                        <td className="border px-3 py-1.5">
                          {r.gradeLevel >= 0
                            ? getGradeLevelLabel(r.gradeLevel)
                            : "-"}
                        </td>
                        {ARAL_TIERS.map((t) => (
                          <td
                            key={t.value}
                            className="border px-3 py-1.5 text-center"
                          >
                            {r.tiers[t.value] ?? 0}
                          </td>
                        ))}
                        {ARAL_STATUSES.map((s) => (
                          <td
                            key={s.value}
                            className="border px-3 py-1.5 text-center"
                          >
                            {r.statuses[s.value] ?? 0}
                          </td>
                        ))}
                        <td className="border px-3 py-1.5 text-center font-semibold">
                          {r.total}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/40 font-semibold">
                      <td className="border px-3 py-1.5" colSpan={2}>
                        School Total
                      </td>
                      {ARAL_TIERS.map((t) => (
                        <td
                          key={t.value}
                          className="border px-3 py-1.5 text-center"
                        >
                          {totals.tiers[t.value] ?? 0}
                        </td>
                      ))}
                      {ARAL_STATUSES.map((s) => (
                        <td
                          key={s.value}
                          className="border px-3 py-1.5 text-center"
                        >
                          {totals.statuses[s.value] ?? 0}
                        </td>
                      ))}
                      <td className="border px-3 py-1.5 text-center">
                        {totals.total}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
