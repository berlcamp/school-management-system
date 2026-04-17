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
import { MPSEntry } from "@/types";
import { BarChart3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { EditMpsModal } from "./components/EditMpsModal";
import { MpsBarChart, MpsBarItem } from "./components/MpsBarChart";
import { MpsFilters, MpsFilterValue } from "./components/MpsFilters";
import {
  MpsQuarterRow,
  MpsQuarterTable,
  MpsSingleRow,
  MpsTable,
} from "./components/MpsTable";

interface MpsRow extends MPSEntry {
  subject?: { id: string; name: string } | null;
  section?: { id: string; name: string; grade_level: number } | null;
}

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
}

interface SubjectOption {
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
  const [rows, setRows] = useState<MpsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MPSEntry | null>(null);
  const [sectionSubjectMap, setSectionSubjectMap] = useState<
    Record<string, string[]>
  >({});

  const canManage = useMemo(() => {
    const t = user?.type;
    return (
      t === "school_head" ||
      t === "super admin" ||
      t === "admin" ||
      t === "registrar"
    );
  }, [user?.type]);

  const [filters, setFilters] = useState<MpsFilterValue>({
    schoolYear: getCurrentSchoolYear(),
    gradeLevel: "",
    sectionId: "",
    subjectId: "",
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

    const { data: subjectsData } = await supabase
      .from("sms_subjects")
      .select("id, name, grade_level")
      .order("grade_level")
      .order("name");
    setSubjectOptions(
      (subjectsData ?? []).map((s) => ({
        id: String(s.id),
        name: s.name,
        grade_level: s.grade_level,
      }))
    );

    const { data: schedulesData } = await supabase
      .from("sms_subject_schedules")
      .select("section_id, subject_id")
      .eq("school_year", filters.schoolYear);
    const map: Record<string, Set<string>> = {};
    (schedulesData ?? []).forEach((row) => {
      if (row.section_id == null || row.subject_id == null) return;
      const secKey = String(row.section_id);
      if (!map[secKey]) map[secKey] = new Set();
      map[secKey].add(String(row.subject_id));
    });
    setSectionSubjectMap(
      Object.fromEntries(
        Object.entries(map).map(([k, v]) => [k, Array.from(v)])
      )
    );
  }, [user?.school_id, filters.schoolYear]);

  const fetchRows = useCallback(async () => {
    if (!user?.school_id) {
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from("sms_mps")
        .select(
          `*, subject:sms_subjects(id, name), section:sms_sections(id, name, grade_level)`
        )
        .eq("school_id", Number(user.school_id))
        .eq("school_year", filters.schoolYear);

      if (filters.gradeLevel) {
        query = query.eq("grade_level", Number(filters.gradeLevel));
      }
      if (filters.sectionId) {
        query = query.eq("section_id", Number(filters.sectionId));
      }
      if (filters.subjectId) {
        query = query.eq("subject_id", Number(filters.subjectId));
      }
      if (filters.quarter) {
        query = query.eq("grading_period", Number(filters.quarter));
      }

      const { data, error } = await query;
      if (error) throw error;

      const normalized: MpsRow[] = (data ?? []).map((r) => {
        const subjectRaw = r.subject as
          | { id: string | number; name: string }
          | Array<{ id: string | number; name: string }>
          | null
          | undefined;
        const sectionRaw = r.section as
          | { id: string | number; name: string; grade_level: number }
          | Array<{ id: string | number; name: string; grade_level: number }>
          | null
          | undefined;
        const subject = Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw;
        const section = Array.isArray(sectionRaw) ? sectionRaw[0] : sectionRaw;
        return {
          ...(r as MPSEntry),
          subject: subject
            ? { id: String(subject.id), name: subject.name }
            : null,
          section: section
            ? {
                id: String(section.id),
                name: section.name,
                grade_level: section.grade_level,
              }
            : null,
        };
      });
      setRows(normalized);
    } catch (err) {
      console.error("Error loading MPS:", err);
      toast.error("Failed to load MPS");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.school_id, filters]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // By Subject tab: group rows by (subject_id, section_id) — shows quarters as columns
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
      const key = `${r.subject_id}__${r.section_id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          subjectName: r.subject?.name ?? "Unknown subject",
          sectionName: r.section?.name ?? "Unknown section",
          gradeLevel: r.section?.grade_level ?? r.grade_level ?? null,
          q: { 1: null, 2: null, 3: null, 4: null },
        };
        groups.set(key, g);
      }
      g.q[r.grading_period] = r.mps;
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
        return s !== 0 ? s : (a.secondaryLabel ?? "").localeCompare(b.secondaryLabel ?? "");
      });
  }, [rows]);

  // By Section tab: same grouping, but primary is section
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
      const key = `${r.section_id}__${r.subject_id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          sectionName: r.section?.name ?? "Unknown section",
          subjectName: r.subject?.name ?? "Unknown subject",
          gradeLevel: r.section?.grade_level ?? r.grade_level ?? null,
          q: { 1: null, 2: null, 3: null, 4: null },
        };
        groups.set(key, g);
      }
      g.q[r.grading_period] = r.mps;
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
        return s !== 0 ? s : (a.secondaryLabel ?? "").localeCompare(b.secondaryLabel ?? "");
      });
  }, [rows]);

  const byQuarterRows: MpsSingleRow[] = useMemo(
    () =>
      rows
        .map((r) => ({
          key: String(r.id),
          subject: r.subject?.name ?? "Unknown subject",
          section: r.section?.name ?? "Unknown section",
          gradeLevel: r.section?.grade_level ?? r.grade_level ?? null,
          quarter: r.grading_period,
          mps: Number(r.mps),
          onEdit: canManage
            ? () => {
                setEditTarget(r);
                setEditOpen(true);
              }
            : undefined,
          onDelete: canManage
            ? async () => {
                if (!confirm("Delete this MPS record?")) return;
                const { error } = await supabase
                  .from("sms_mps")
                  .delete()
                  .eq("id", r.id);
                if (error) {
                  toast.error("Failed to delete");
                  return;
                }
                toast.success("MPS deleted");
                fetchRows();
              }
            : undefined,
        }))
        .sort((a, b) => {
          const s = a.subject.localeCompare(b.subject);
          if (s !== 0) return s;
          const sec = a.section.localeCompare(b.section);
          if (sec !== 0) return sec;
          return a.quarter - b.quarter;
        }),
    [rows, canManage, fetchRows]
  );

  const chartItems: MpsBarItem[] = useMemo(() => {
    if (filters.subjectId && !filters.sectionId) {
      // one subject, all sections — chart per section
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
    // default: top-level — one bar per subject average across all rows
    const bySubject = new Map<string, number[]>();
    for (const r of rows) {
      const name = r.subject?.name ?? "Unknown";
      const list = bySubject.get(name) ?? [];
      list.push(Number(r.mps));
      bySubject.set(name, list);
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
        const s = (a.subject?.name ?? "").localeCompare(b.subject?.name ?? "");
        if (s !== 0) return s;
        const sec = (a.section?.name ?? "").localeCompare(b.section?.name ?? "");
        if (sec !== 0) return sec;
        return a.grading_period - b.grading_period;
      })
      .map((r, idx) => ({
        "#": idx + 1,
        "School Year": r.school_year,
        "Grade Level":
          r.section?.grade_level != null
            ? getGradeLevelLabel(r.section.grade_level)
            : getGradeLevelLabel(r.grade_level),
        Section: r.section?.name ?? "",
        Subject: r.subject?.name ?? "",
        Quarter: `Q${r.grading_period}`,
        MPS: Number(r.mps).toFixed(2),
      }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MPS");
    XLSX.writeFile(wb, `MPS_${filters.schoolYear.replace(/\s+/g, "_")}.xlsx`);
  };

  const handleDeleteFromTable = async (id: string) => {
    if (!confirm("Delete this MPS record?")) return;
    const { error } = await supabase.from("sms_mps").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("MPS deleted");
    fetchRows();
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
              Track MPS per subject, section, quarter, and school year with
              mastery-level classification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <MpsFilters
              value={filters}
              onChange={setFilters}
              schoolYearOptions={getSchoolYearOptions()}
              sectionOptions={sectionOptions}
              subjectOptions={subjectOptions}
              sectionSubjectMap={sectionSubjectMap}
              canAdd={canManage}
              onAddClick={() => {
                setEditTarget(null);
                setEditOpen(true);
              }}
              onExportClick={handleExport}
            />

            <MpsBarChart
              title="MPS Overview"
              items={chartItems}
              emptyText={
                loading
                  ? "Loading..."
                  : "No MPS records match the current filters."
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
                    loading ? "Loading..." : "No MPS entries for these filters."
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
                    loading ? "Loading..." : "No MPS entries for these filters."
                  }
                />
              </TabsContent>
              <TabsContent value="quarter" className="mt-4">
                <MpsQuarterTable
                  rows={byQuarterRows.map((r) => ({
                    ...r,
                    onDelete: canManage
                      ? () => handleDeleteFromTable(r.key)
                      : undefined,
                  }))}
                  showActions={canManage}
                  emptyText={
                    loading ? "Loading..." : "No MPS entries for these filters."
                  }
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <EditMpsModal
          isOpen={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditTarget(null);
          }}
          onSaved={fetchRows}
          editData={editTarget && editTarget.id ? editTarget : null}
          sectionOptions={sectionOptions}
          subjectOptions={subjectOptions}
          defaultSchoolYear={filters.schoolYear}
        />
      </div>
    </div>
  );
}
