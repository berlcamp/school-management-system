"use client";

import {
  DashboardHeader,
  Panel,
  RowsSkeleton,
} from "@/components/dashboards/DashboardKit";
import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDesignations } from "@/hooks/useDesignations";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  buildCoverage,
  coverageTotals,
  filterCoverageRows,
  periodColumns,
  resolveCurrentPeriod,
  type CoverageSchedule,
} from "@/lib/utils/departmentMps";
import {
  aggregateExamMps,
  EXAM_RESULT_SELECT,
  type ExamResultRow,
  type MpsGroup,
} from "@/lib/utils/mpsAggregate";
import { fetchTermDates, type TermDates } from "@/lib/utils/termDates";
import { getCurrentSchoolYear, getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { MpsBarChart } from "../mps/components/MpsBarChart";
import { CoverageGrid } from "./components/CoverageGrid";
import { CoverageTiles } from "./components/CoverageTiles";

interface ScheduleRow {
  subject_id: number | string;
  subject: { name: string } | { name: string }[] | null;
  section: { id: number | string; name: string; grade_level: number } | { id: number | string; name: string; grade_level: number }[] | null;
  teacher: { name: string } | { name: string }[] | null;
}

function first<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function DepartmentPage() {
  const user = useAppSelector((state) => state.user.user);
  const { loading: designationsLoading, has, subjectIds } = useDesignations();
  const currentSY = getCurrentSchoolYear();
  const [schoolYear, setSchoolYear] = useState(currentSY);
  const [subjectId, setSubjectId] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [periodPick, setPeriodPick] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<CoverageSchedule[]>([]);
  const [mps, setMps] = useState<MpsGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [termDates, setTermDates] = useState<TermDates | null>(null);

  const idsKey = useMemo(() => Array.from(subjectIds).sort().join(","), [subjectIds]);
  const schoolId = user?.school_id;

  useEffect(() => {
    if (!schoolId || idsKey === "") {
      setSchedules([]);
      setMps([]);
      return;
    }
    let isMounted = true;
    setLoading(true);
    (async () => {
      try {
        const ids = idsKey.split(",").map(Number);
        const [schedRes, mpsRes] = await Promise.all([
          supabase
            .from("sms_subject_schedules")
            .select(
              "subject_id, subject:subject_id(name), section:section_id(id, name, grade_level), teacher:teacher_id(name)"
            )
            .in("subject_id", ids)
            .eq("school_year", schoolYear)
            .eq("school_id", Number(schoolId)),
          supabase
            .from("sms_exam_results")
            .select(EXAM_RESULT_SELECT)
            .eq("school_id", Number(schoolId))
            .eq("school_year", schoolYear),
        ]);
        if (schedRes.error) throw schedRes.error;
        if (mpsRes.error) throw mpsRes.error;
        if (!isMounted) return;
        const sched: CoverageSchedule[] = [];
        for (const r of (schedRes.data ?? []) as unknown as ScheduleRow[]) {
          const section = first(r.section);
          const subject = first(r.subject);
          if (!section || !subject) continue;
          sched.push({
            subject_id: String(r.subject_id),
            subject_name: subject.name,
            grade_level: Number(section.grade_level),
            section_id: String(section.id),
            section_name: section.name,
            teacher_name: first(r.teacher)?.name ?? null,
          });
        }
        setSchedules(sched);
        setMps(aggregateExamMps((mpsRes.data ?? []) as unknown as ExamResultRow[]));
      } catch (err) {
        console.error("Error loading department MPS:", err);
        toast.error("Failed to load department MPS");
        if (isMounted) {
          setSchedules([]);
          setMps([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolId, idsKey, schoolYear]);

  useEffect(() => {
    if (!schoolId) {
      setTermDates(null);
      return;
    }
    let isMounted = true;
    fetchTermDates(schoolId, schoolYear).then((d) => {
      if (isMounted) setTermDates(d);
    });
    return () => {
      isMounted = false;
    };
  }, [schoolId, schoolYear]);

  const columns = useMemo(() => periodColumns(schoolYear), [schoolYear]);
  const currentPeriod = useMemo(
    () => resolveCurrentPeriod(schoolYear, currentSY, new Date(), termDates),
    [schoolYear, currentSY, termDates]
  );
  const period =
    periodPick != null && columns.some((c) => c.period === periodPick)
      ? periodPick
      : currentPeriod;
  const periodLabel = columns.find((c) => c.period === period)?.label ?? "";

  const allRows = useMemo(
    () => buildCoverage({ schedules, mps, schoolYear, currentPeriod }),
    [schedules, mps, schoolYear, currentPeriod]
  );
  const subjectRows = useMemo(
    () => filterCoverageRows(allRows, { subjectId, missingOnly: false }),
    [allRows, subjectId]
  );
  const shownRows = useMemo(
    () => filterCoverageRows(allRows, { subjectId, missingOnly }),
    [allRows, subjectId, missingOnly]
  );
  const totals = coverageTotals(subjectRows, period);

  const subjectOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) m.set(r.subjectId, r.subjectName);
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [allRows]);

  const chartItems = useMemo(
    () =>
      subjectId === ""
        ? []
        : subjectRows.flatMap((r) => {
            const c = r.cells[period];
            return typeof c === "number"
              ? [{ label: r.sectionName, value: c }]
              : [];
          }),
    [subjectRows, subjectId, period]
  );

  if (designationsLoading) return null;
  if (!has("department_head")) return <ModuleAccessDenied />;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <DashboardHeader
        title="Department MPS"
        context="MPS per subject, section and term for the subjects you head."
      />

      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4 shadow-xs">
        <div className="space-y-1">
          <Label>School year</Label>
          <Select value={schoolYear} onValueChange={setSchoolYear}>
            <SelectTrigger className="h-10 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {getSchoolYearOptions().map((sy) => (
                <SelectItem key={sy} value={sy}>{sy}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Subject</Label>
          <Select
            value={subjectId === "" ? "all" : subjectId}
            onValueChange={(v) => setSubjectId(v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All my subjects</SelectItem>
              {subjectOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Term</Label>
          <Select value={String(period)} onValueChange={(v) => setPeriodPick(Number(v))}>
            <SelectTrigger className="h-10 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {columns.map((c) => (
                <SelectItem key={c.period} value={String(c.period)}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex h-10 items-center gap-2">
          <Checkbox
            id="missing-only"
            checked={missingOnly}
            onChange={(e) => setMissingOnly(e.target.checked)}
          />
          <Label htmlFor="missing-only">Show missing only</Label>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[118px] w-full rounded-xl" />
            ))}
          </div>
          <RowsSkeleton rows={6} />
        </div>
      ) : (
        <>
          <CoverageTiles totals={totals} periodLabel={periodLabel} />
          <Panel
            title="Coverage"
            description={
              missingOnly
                ? "Classes still missing MPS for a term that has started."
                : "Every class running your subjects, terms across."
            }
            icon={LayoutGrid}
            bodyClassName="p-0"
          >
            <CoverageGrid rows={shownRows} columns={columns} />
          </Panel>
          {subjectId !== "" && (
            <MpsBarChart
              title={`MPS by section, ${periodLabel}`}
              items={chartItems}
              emptyText="No MPS encoded for this subject and term."
            />
          )}
        </>
      )}
    </div>
  );
}
