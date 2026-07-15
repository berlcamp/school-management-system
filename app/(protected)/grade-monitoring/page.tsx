"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getGradeLevelLabel } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getGradingPeriodType,
  getGradingPeriods,
  getSchoolYearOptions,
  isTermBasedSchoolYear,
} from "@/lib/utils/schoolYear";
import { ClipboardCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  GradeMonitoringFilterValue,
  GradeMonitoringFilters,
} from "./components/GradeMonitoringFilters";
import { GradeMonitoringTable } from "./components/GradeMonitoringTable";
import { TeacherSummaryTable } from "./components/TeacherSummaryTable";
import {
  EncodingStatusRow,
  STATE_LABEL,
  toGridRows,
  toTeacherRows,
} from "./components/gradeEncoding";

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [allRows, setAllRows] = useState<EncodingStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);

  const [filters, setFilters] = useState<GradeMonitoringFilterValue>({
    schoolYear: getCurrentSchoolYear(),
    gradeLevel: "",
    sectionId: "",
    teacher: "",
    period: "",
    state: "",
  });

  const schoolId = user?.school_id;
  const schoolYear = filters.schoolYear;

  useEffect(() => {
    let isMounted = true;
    if (!schoolId) return;

    const fetchOptions = async () => {
      const { data } = await supabase
        .from("sms_sections")
        .select("id, name, grade_level")
        .eq("school_id", Number(schoolId))
        .eq("school_year", schoolYear)
        .order("grade_level")
        .order("name");
      if (!isMounted) return;
      setSectionOptions(
        (data ?? []).map((s) => ({
          id: String(s.id),
          name: s.name,
          grade_level: s.grade_level,
        }))
      );
    };

    fetchOptions();
    return () => {
      isMounted = false;
    };
  }, [schoolId, schoolYear]);

  useEffect(() => {
    let isMounted = true;
    if (!schoolId) {
      setAllRows([]);
      return;
    }

    const fetchRows = async () => {
      setLoading(true);
      try {
        // Aggregated in SQL — a school's raw sms_grades rows run past the
        // client's default row limit. See migration 107.
        const { data, error } = await supabase.rpc("get_grade_encoding_status", {
          p_school_id: Number(schoolId),
          p_school_year: schoolYear,
          p_periods: getGradingPeriods(schoolYear).length,
        });
        if (error) throw error;
        if (!isMounted) return;
        setAllRows((data ?? []) as EncodingStatusRow[]);
      } catch (err) {
        console.error("Error loading grade encoding status:", err);
        if (!isMounted) return;
        toast.error("Failed to load grade monitoring");
        setAllRows([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRows();
    return () => {
      isMounted = false;
    };
  }, [schoolId, schoolYear]);

  // Section/grade/teacher/period narrow the RPC rows before they are collapsed,
  // so a period filter rebuilds the grid around just that period.
  const filteredRpcRows = useMemo(
    () =>
      allRows.filter((r) => {
        if (filters.gradeLevel && r.grade_level !== Number(filters.gradeLevel))
          return false;
        if (filters.sectionId && String(r.section_id) !== filters.sectionId)
          return false;
        if (filters.period && r.grading_period !== Number(filters.period))
          return false;
        if (
          filters.teacher &&
          !(r.assigned_teachers ?? []).includes(filters.teacher)
        )
          return false;
        return true;
      }),
    [allRows, filters]
  );

  // Status filter applies after collapsing: it matches a row if ANY of its
  // visible periods is in that state.
  const gridRows = useMemo(() => {
    const rows = toGridRows(filteredRpcRows);
    if (!filters.state) return rows;
    return rows.filter((row) =>
      Object.values(row.periods).some((c) => c.state === filters.state)
    );
  }, [filteredRpcRows, filters.state]);

  const teacherRows = useMemo(() => toTeacherRows(gridRows), [gridRows]);

  // Every teacher assigned in Schedules, whether or not they have encoded yet.
  const teacherOptions = useMemo(() => {
    const names = new Set<string>();
    allRows.forEach((r) =>
      (r.assigned_teachers ?? []).forEach((t) => names.add(t))
    );
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const totals = useMemo(() => {
    let complete = 0;
    let partial = 0;
    let notStarted = 0;
    gridRows.forEach((row) =>
      Object.values(row.periods).forEach((c) => {
        if (c.state === "complete") complete += 1;
        else if (c.state === "partial") partial += 1;
        else if (c.state === "not_started") notStarted += 1;
      })
    );
    return { complete, partial, notStarted };
  }, [gridRows]);

  const periodNoun =
    getGradingPeriodType(filters.schoolYear) === "term" ? "Term" : "Quarter";

  const handleExport = () => {
    if (gridRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const periods = getGradingPeriods(filters.schoolYear);
    const data = gridRows.map((row, idx) => {
      const base: Record<string, string | number> = {
        "#": idx + 1,
        "School Year": filters.schoolYear,
        Teacher: row.assignedTeachers.join(", ") || "(no teacher assigned)",
        Subject: row.subjectName + (row.isMadrasah ? " (MEP)" : ""),
        Section: row.sectionName,
        "Grade Level": getGradeLevelLabel(row.gradeLevel),
      };
      periods.forEach((p) => {
        const cell = row.periods[p.value];
        base[p.short] = cell
          ? `${STATE_LABEL[cell.state]} (${cell.encoded}/${cell.expected})`
          : "—";
      });
      base["Encoded By"] = row.encoders.join(", ") || "—";
      base["Last Encoded"] = row.lastEncodedAt
        ? new Date(row.lastEncodedAt).toLocaleDateString()
        : "—";
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grade Monitoring");
    XLSX.writeFile(
      wb,
      `Grade_Monitoring_${filters.schoolYear.replace(/\s+/g, "_")}.xlsx`
    );
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Grade Monitoring
        </h1>
      </div>
      <div className="app__content space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Grade Encoding Status</CardTitle>
            <CardDescription>
              Which teachers have encoded grades, for which subjects and
              sections, and how far along each {periodNoun.toLowerCase()} is.
              Assignments come from Schedules; a learner counts as encoded once
              they have a grade above zero.
              {isTermBasedSchoolYear(filters.schoolYear) && (
                <>
                  {" "}
                  SY {filters.schoolYear} uses 3-term grading, so grades are
                  posted automatically from the teacher&apos;s Class Record.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <GradeMonitoringFilters
              value={filters}
              onChange={setFilters}
              schoolYearOptions={getSchoolYearOptions()}
              sectionOptions={sectionOptions}
              teacherOptions={teacherOptions}
              onExportClick={handleExport}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs text-muted-foreground">Complete</p>
                <p className="text-2xl font-semibold tabular-nums text-green-700">
                  {totals.complete}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs text-muted-foreground">Partial</p>
                <p className="text-2xl font-semibold tabular-nums text-amber-700">
                  {totals.partial}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs text-muted-foreground">Not Started</p>
                <p className="text-2xl font-semibold tabular-nums text-red-700">
                  {totals.notStarted}
                </p>
              </div>
            </div>

            <Tabs defaultValue="subject">
              <TabsList>
                <TabsTrigger value="subject">By Subject</TabsTrigger>
                <TabsTrigger value="teacher">By Teacher</TabsTrigger>
              </TabsList>
              <TabsContent value="subject" className="mt-4">
                <GradeMonitoringTable
                  rows={gridRows}
                  schoolYear={filters.schoolYear}
                  emptyText={
                    loading
                      ? "Loading..."
                      : "No subject assignments match the current filters. Assignments come from Schedules."
                  }
                />
              </TabsContent>
              <TabsContent value="teacher" className="mt-4">
                <TeacherSummaryTable
                  rows={teacherRows}
                  schoolYear={filters.schoolYear}
                  emptyText={
                    loading
                      ? "Loading..."
                      : "No teachers match the current filters."
                  }
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
