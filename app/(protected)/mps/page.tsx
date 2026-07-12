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
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { BarChart3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { MpsBarChart, MpsBarItem } from "./components/MpsBarChart";
import { MpsFilters, MpsFilterValue } from "./components/MpsFilters";
import {
  MpsQuarterRow,
  MpsQuarterTable,
  MpsSingleRow,
  MpsTable,
} from "./components/MpsTable";

/** One MPS value per subject + section + quarter (averaged across exam versions). */
interface MpsAgg {
  key: string;
  subjectName: string;
  section: { id: string; name: string; grade_level: number } | null;
  gradeLevel: number;
  quarter: number;
  mps: number;
}

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
}

function avg(values: Array<number | null | undefined>): number | null {
  const present = values.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  if (present.length === 0) return null;
  return present.reduce((acc, v) => acc + v, 0) / present.length;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [allRows, setAllRows] = useState<MpsAgg[]>([]);
  const [loading, setLoading] = useState(false);
  const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);

  const [filters, setFilters] = useState<MpsFilterValue>({
    schoolYear: getCurrentSchoolYear(),
    gradeLevel: "",
    sectionId: "",
    subjectId: "", // holds subject NAME now (MPS is keyed by TOS subject name)
    quarter: "",
  });

  const fetchOptions = useCallback(async () => {
    if (!user?.school_id) return;
    const { data: sectionsData } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level")
      .eq("school_id", Number(user.school_id))
      .eq("school_year", filters.schoolYear)
      .order("grade_level")
      .order("name");
    setSectionOptions(
      (sectionsData ?? []).map((s) => ({
        id: String(s.id),
        name: s.name,
        grade_level: s.grade_level,
      }))
    );
  }, [user?.school_id, filters.schoolYear]);

  const fetchRows = useCallback(async () => {
    if (!user?.school_id) {
      setAllRows([]);
      return;
    }
    setLoading(true);
    try {
      // MPS is always derived from actual exam results (Item Analysis).
      const { data, error } = await supabase
        .from("sms_exam_results")
        .select(
          "id, mps, section_id, section:section_id(id, name, grade_level), exam:exam_id!inner(tos:tos_id!inner(subject_name, grade_level, grading_period))"
        )
        .eq("school_id", Number(user.school_id))
        .eq("school_year", filters.schoolYear);
      if (error) throw error;

      // Aggregate results into one MPS per (subject name, section, quarter).
      const groups = new Map<
        string,
        {
          subjectName: string;
          section: MpsAgg["section"];
          gradeLevel: number;
          quarter: number;
          values: number[];
        }
      >();
      (data ?? []).forEach((r) => {
        if (r.mps == null) return;
        const examRaw = Array.isArray(r.exam) ? r.exam[0] : r.exam;
        const tosRaw = examRaw
          ? Array.isArray(examRaw.tos)
            ? examRaw.tos[0]
            : examRaw.tos
          : null;
        if (!tosRaw) return;
        const sectionRaw = Array.isArray(r.section) ? r.section[0] : r.section;
        const subjectName = tosRaw.subject_name as string;
        const quarter = tosRaw.grading_period as number;
        const gradeLevel = (sectionRaw?.grade_level ??
          tosRaw.grade_level) as number;
        const key = `${subjectName}__${r.section_id}__${quarter}`;
        let g = groups.get(key);
        if (!g) {
          g = {
            subjectName,
            section: sectionRaw
              ? {
                  id: String(sectionRaw.id),
                  name: sectionRaw.name,
                  grade_level: sectionRaw.grade_level,
                }
              : null,
            gradeLevel,
            quarter,
            values: [],
          };
          groups.set(key, g);
        }
        g.values.push(Number(r.mps));
      });

      setAllRows(
        Array.from(groups.entries()).map(([key, g]) => ({
          key,
          subjectName: g.subjectName,
          section: g.section,
          gradeLevel: g.gradeLevel,
          quarter: g.quarter,
          mps: g.values.reduce((a, v) => a + v, 0) / g.values.length,
        }))
      );
    } catch (err) {
      console.error("Error loading MPS:", err);
      toast.error("Failed to load MPS");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.school_id, filters.schoolYear]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Client-side filters (grade / section / subject name / quarter).
  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (filters.gradeLevel && r.gradeLevel !== Number(filters.gradeLevel))
          return false;
        if (filters.sectionId && r.section?.id !== filters.sectionId)
          return false;
        if (filters.subjectId && r.subjectName !== filters.subjectId)
          return false;
        if (filters.quarter && r.quarter !== Number(filters.quarter))
          return false;
        return true;
      }),
    [allRows, filters]
  );

  // Subject filter options — the subjects that actually have exam results.
  const subjectOptions = useMemo(() => {
    const map = new Map<string, number>();
    allRows.forEach((r) => {
      if (!map.has(r.subjectName)) map.set(r.subjectName, r.gradeLevel);
    });
    return Array.from(map.entries())
      .map(([name, grade_level]) => ({ id: name, name, grade_level }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows]);

  const bySubjectRows: MpsQuarterRow[] = useMemo(() => {
    const groups = new Map<
      string,
      {
        subjectName: string;
        sectionName: string;
        gradeLevel: number | null;
        q: Record<number, number | null>;
      }
    >();
    for (const r of rows) {
      const key = `${r.subjectName}__${r.section?.id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          subjectName: r.subjectName,
          sectionName: r.section?.name ?? "Unknown section",
          gradeLevel: r.gradeLevel,
          q: { 1: null, 2: null, 3: null, 4: null },
        };
        groups.set(key, g);
      }
      g.q[r.quarter] = r.mps;
    }
    return Array.from(groups.entries())
      .map(([key, g]) => ({
        key,
        primaryLabel: g.subjectName,
        secondaryLabel: g.sectionName,
        gradeLevel: g.gradeLevel,
        q1: g.q[1],
        q2: g.q[2],
        q3: g.q[3],
        q4: g.q[4],
      }))
      .sort((a, b) => {
        const s = a.primaryLabel.localeCompare(b.primaryLabel);
        return s !== 0
          ? s
          : (a.secondaryLabel ?? "").localeCompare(b.secondaryLabel ?? "");
      });
  }, [rows]);

  const bySectionRows: MpsQuarterRow[] = useMemo(() => {
    const groups = new Map<
      string,
      {
        sectionName: string;
        subjectName: string;
        gradeLevel: number | null;
        q: Record<number, number | null>;
      }
    >();
    for (const r of rows) {
      const key = `${r.section?.id}__${r.subjectName}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          sectionName: r.section?.name ?? "Unknown section",
          subjectName: r.subjectName,
          gradeLevel: r.gradeLevel,
          q: { 1: null, 2: null, 3: null, 4: null },
        };
        groups.set(key, g);
      }
      g.q[r.quarter] = r.mps;
    }
    return Array.from(groups.entries())
      .map(([key, g]) => ({
        key,
        primaryLabel: g.sectionName,
        secondaryLabel: g.subjectName,
        gradeLevel: g.gradeLevel,
        q1: g.q[1],
        q2: g.q[2],
        q3: g.q[3],
        q4: g.q[4],
      }))
      .sort((a, b) => {
        const s = a.primaryLabel.localeCompare(b.primaryLabel);
        return s !== 0
          ? s
          : (a.secondaryLabel ?? "").localeCompare(b.secondaryLabel ?? "");
      });
  }, [rows]);

  const byQuarterRows: MpsSingleRow[] = useMemo(
    () =>
      rows
        .map((r) => ({
          key: r.key,
          subject: r.subjectName,
          section: r.section?.name ?? "Unknown section",
          gradeLevel: r.gradeLevel,
          quarter: r.quarter,
          mps: r.mps,
        }))
        .sort((a, b) => {
          const s = a.subject.localeCompare(b.subject);
          if (s !== 0) return s;
          const sec = a.section.localeCompare(b.section);
          if (sec !== 0) return sec;
          return a.quarter - b.quarter;
        }),
    [rows]
  );

  const chartItems: MpsBarItem[] = useMemo(() => {
    if (filters.subjectId && !filters.sectionId) {
      return bySubjectRows
        .filter((r) => avg([r.q1, r.q2, r.q3, r.q4]) != null)
        .map((r) => ({
          label: r.secondaryLabel ?? r.primaryLabel,
          value: avg([r.q1, r.q2, r.q3, r.q4]) ?? 0,
        }));
    }
    if (filters.sectionId && !filters.subjectId) {
      return bySectionRows
        .filter((r) => avg([r.q1, r.q2, r.q3, r.q4]) != null)
        .map((r) => ({
          label: r.secondaryLabel ?? r.primaryLabel,
          value: avg([r.q1, r.q2, r.q3, r.q4]) ?? 0,
        }));
    }
    const bySubject = new Map<string, number[]>();
    for (const r of rows) {
      const list = bySubject.get(r.subjectName) ?? [];
      list.push(r.mps);
      bySubject.set(r.subjectName, list);
    }
    return Array.from(bySubject.entries())
      .map(([label, values]) => ({
        label,
        value: values.reduce((a, v) => a + v, 0) / values.length,
      }))
      .sort((a, b) => b.value - a.value);
  }, [rows, bySubjectRows, bySectionRows, filters.subjectId, filters.sectionId]);

  const handleExport = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const data = rows
      .slice()
      .sort((a, b) => {
        const s = a.subjectName.localeCompare(b.subjectName);
        if (s !== 0) return s;
        const sec = (a.section?.name ?? "").localeCompare(b.section?.name ?? "");
        if (sec !== 0) return sec;
        return a.quarter - b.quarter;
      })
      .map((r, idx) => ({
        "#": idx + 1,
        "School Year": filters.schoolYear,
        "Grade Level": getGradeLevelLabel(r.gradeLevel),
        Section: r.section?.name ?? "",
        Subject: r.subjectName,
        Quarter: `Q${r.quarter}`,
        MPS: r.mps.toFixed(2),
      }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MPS");
    XLSX.writeFile(wb, `MPS_${filters.schoolYear.replace(/\s+/g, "_")}.xlsx`);
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Mean Percentage Score (MPS)
        </h1>
      </div>
      <div className="app__content space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>MPS Dashboard</CardTitle>
            <CardDescription>
              MPS is computed automatically from actual exam results recorded in
              Item Analysis (Examinations → Item Analysis). Track it per subject,
              section, quarter, and school year with mastery-level classification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <MpsFilters
              value={filters}
              onChange={setFilters}
              schoolYearOptions={getSchoolYearOptions()}
              sectionOptions={sectionOptions}
              subjectOptions={subjectOptions}
              onExportClick={handleExport}
            />

            <MpsBarChart
              title="MPS Overview"
              items={chartItems}
              emptyText={
                loading
                  ? "Loading..."
                  : "No exam results match the current filters."
              }
            />

            <Tabs defaultValue="subject">
              <TabsList>
                <TabsTrigger value="subject">By Subject</TabsTrigger>
                <TabsTrigger value="section">By Section</TabsTrigger>
                <TabsTrigger value="quarter">By Quarter</TabsTrigger>
              </TabsList>
              <TabsContent value="subject" className="mt-4">
                <MpsTable
                  primaryHeader="Subject"
                  secondaryHeader="Section"
                  showGradeLevel
                  rows={bySubjectRows}
                  emptyText={
                    loading ? "Loading..." : "No exam results for these filters."
                  }
                />
              </TabsContent>
              <TabsContent value="section" className="mt-4">
                <MpsTable
                  primaryHeader="Section"
                  secondaryHeader="Subject"
                  showGradeLevel
                  rows={bySectionRows}
                  emptyText={
                    loading ? "Loading..." : "No exam results for these filters."
                  }
                />
              </TabsContent>
              <TabsContent value="quarter" className="mt-4">
                <MpsQuarterTable
                  rows={byQuarterRows}
                  emptyText={
                    loading ? "Loading..." : "No exam results for these filters."
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
