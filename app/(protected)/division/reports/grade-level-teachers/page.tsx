"use client";

/**
 * Grade Level Teachers — the roster of teachers assigned to one grade level at
 * one school, for one school year. Derived from section advisorship and
 * subject schedules (migration 156); see the RPC header for why it is not a
 * read of `sms_users`.
 */

import {
  DivisionReportShell,
  EmptyReportState,
  ReportTableCard,
} from "@/components/division-reports/DivisionReportShell";
import {
  SchoolFilter,
  SchoolOption,
} from "@/components/division-reports/SchoolFilter";
import { SchoolYearFilter } from "@/components/division-reports/SchoolYearFilter";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getGradeLevelLabel, GRADE_LEVELS } from "@/lib/constants";
import { generateGradeLevelTeachersPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import {
  ALL_GRADE_LEVELS,
  fetchGradeLevelTeachers,
  GradeLevelTeacherGroup,
  learningAreaLabel,
  listOrDash,
  roleLabel,
  sexLabel,
} from "@/lib/utils/gradeLevelTeachers";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface SchoolHead {
  name: string;
  position: string | null;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);

  const [schoolId, setSchoolId] = useState("");
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [gradeLevel, setGradeLevel] = useState<string>(ALL_GRADE_LEVELS);

  const [groups, setGroups] = useState<GradeLevelTeacherGroup[]>([]);
  const [schoolHead, setSchoolHead] = useState<SchoolHead | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSchoolsLoaded = useCallback((options: SchoolOption[]) => {
    setSchools(options);
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!schoolId) {
      setGroups([]);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchGradeLevelTeachers(
          schoolId,
          schoolYear,
          gradeLevel === ALL_GRADE_LEVELS ? null : Number(gradeLevel),
        );
        if (!isMounted) return;
        setGroups(data);
      } catch (err) {
        if (!isMounted) return;
        toast.error(
          err instanceof Error ? err.message : "Failed to load the roster",
        );
        setGroups([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [schoolId, schoolYear, gradeLevel]);

  // Signatory for the printable. The division office prepares the sheet; the
  // school head of the school being reported on notes it.
  useEffect(() => {
    let isMounted = true;

    if (!schoolId) {
      setSchoolHead(null);
      return;
    }

    supabase
      .from("sms_users")
      .select("name, position")
      .eq("school_id", Number(schoolId))
      .eq("type", "school_head")
      .eq("is_active", true)
      .limit(1)
      .then(({ data, error }) => {
        if (!isMounted || error) return;
        const head = data?.[0];
        setSchoolHead(
          head
            ? { name: head.name as string, position: head.position as string }
            : null,
        );
      });

    return () => {
      isMounted = false;
    };
  }, [schoolId]);

  const schoolName = useMemo(
    () => schools.find((s) => s.id === schoolId)?.name ?? "",
    [schools, schoolId],
  );

  const gradeLabel =
    gradeLevel === ALL_GRADE_LEVELS
      ? "All Grade Levels"
      : getGradeLevelLabel(Number(gradeLevel));

  const totalTeachers = useMemo(
    () => groups.reduce((sum, g) => sum + g.rows.length, 0),
    [groups],
  );

  const exportRows = () =>
    groups.flatMap((g) =>
      g.rows.map((r) => ({
        "Grade Level": g.label,
        Teacher: r.teacher_name,
        Sex: sexLabel(r.teacher_gender),
        Position: r.teacher_position ?? "",
        Role: roleLabel(r.user_type),
        Specialization: learningAreaLabel(r.learning_area),
        "Advisory Section": listOrDash(r.advisory_sections),
        "Subjects Handled": listOrDash(r.subject_names),
        "Sections Taught": listOrDash(r.section_names),
        Status: r.teacher_is_active ? "Active" : "Inactive",
      })),
    );

  const EXPORT_HEADERS = [
    "Grade Level",
    "Teacher",
    "Sex",
    "Position",
    "Role",
    "Specialization",
    "Advisory Section",
    "Subjects Handled",
    "Sections Taught",
    "Status",
  ];

  const handlePrint = async () => {
    if (!schoolId) return;
    try {
      await generateGradeLevelTeachersPrint({
        schoolId,
        schoolYear,
        gradeLabel,
        groups,
        preparedBy: user?.name ?? "",
        principalName: schoolHead?.name ?? null,
        principalTitle: schoolHead?.position ?? "School Head",
      });
    } catch (err) {
      console.error("Error printing grade level teachers:", err);
      toast.error("Failed to generate the printout");
    }
  };

  const activeFilters = [
    ...(schoolName
      ? [{ label: `School: ${schoolName}`, onClear: () => setSchoolId("") }]
      : []),
    { label: `SY ${schoolYear}`, onClear: () => setSchoolYear(getCurrentSchoolYear()) },
    ...(gradeLevel !== ALL_GRADE_LEVELS
      ? [
          {
            label: gradeLabel,
            onClear: () => setGradeLevel(ALL_GRADE_LEVELS),
          },
        ]
      : []),
  ];

  return (
    <DivisionReportShell
      title="Grade Level Teachers"
      description="Teachers assigned to a grade level at one school — from section advisorship and subject schedules."
      loading={loading}
      recordCount={schoolId ? totalTeachers : undefined}
      exportDisabled={totalTeachers === 0}
      onExportCsv={() =>
        exportCsv(
          exportRows(),
          EXPORT_HEADERS,
          "grade_level_teachers.csv",
        )
      }
      onExportExcel={() =>
        exportExcel(
          exportRows(),
          "grade_level_teachers.xlsx",
          "Grade Level Teachers",
        )
      }
      onPrint={handlePrint}
      activeFilters={activeFilters}
      onClearFilters={() => {
        setSchoolId("");
        setSchoolYear(getCurrentSchoolYear());
        setGradeLevel(ALL_GRADE_LEVELS);
      }}
      filterBar={
        <>
          <SchoolFilter
            value={schoolId}
            onChange={setSchoolId}
            onLoaded={handleSchoolsLoaded}
          />
          <SchoolYearFilter value={schoolYear} onChange={setSchoolYear} />
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Grade Level</Label>
            <Select value={gradeLevel} onValueChange={setGradeLevel}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_GRADE_LEVELS}>
                  All grade levels
                </SelectItem>
                {GRADE_LEVELS.map((level) => (
                  <SelectItem key={level} value={String(level)}>
                    {getGradeLevelLabel(level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      }
    >
      {!schoolId ? (
        <EmptyReportState message="Select a school to see its grade level teachers." />
      ) : groups.length === 0 ? (
        <EmptyReportState
          message={`No teaching assignments for ${gradeLabel} in SY ${schoolYear}.`}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <ReportTableCard
              key={group.gradeLevel}
              caption={`${group.label} — ${group.rows.length} teacher${
                group.rows.length === 1 ? "" : "s"
              }`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead className="w-12 text-center">Sex</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead>Advisory Section</TableHead>
                    <TableHead>Subjects Handled</TableHead>
                    <TableHead>Sections Taught</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((r, i) => (
                    <TableRow key={`${group.gradeLevel}-${r.teacher_id}`}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {r.teacher_name}
                          {r.is_adviser && (
                            <Badge variant="secondary" className="text-[10px]">
                              Adviser
                            </Badge>
                          )}
                          {!r.teacher_is_active && (
                            <Badge variant="outline" className="text-[10px]">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {sexLabel(r.teacher_gender)}
                      </TableCell>
                      <TableCell>{r.teacher_position || "—"}</TableCell>
                      <TableCell>{roleLabel(r.user_type)}</TableCell>
                      <TableCell>
                        {learningAreaLabel(r.learning_area)}
                      </TableCell>
                      <TableCell>{listOrDash(r.advisory_sections)}</TableCell>
                      <TableCell>{listOrDash(r.subject_names)}</TableCell>
                      <TableCell>{listOrDash(r.section_names)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ReportTableCard>
          ))}

          <p className="text-xs text-muted-foreground">
            A teacher assigned to more than one grade level appears under each.
            This is a roster of teaching assignments, not a plantilla personnel
            count — see Teaching Personnel for the DepEd headcount.
          </p>
        </div>
      )}
    </DivisionReportShell>
  );
}
