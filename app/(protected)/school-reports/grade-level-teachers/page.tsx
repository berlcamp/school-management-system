"use client";

/**
 * Grade Level Teachers — this school's own cut of the SDO report.
 *
 * Same question, one scope down: "who teaches Grade 5 here". The roster is the
 * division report's (migration 156/157) with `p_school_id` pinned to the
 * signed-in user's school, so a school head never sees another school's
 * staffing and the sheet needs no school picker or School column. 157's guard
 * already admits a school's own staff and its migration-134 assignees, so
 * nothing new is granted here.
 */

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { getGradeLevelLabel, GRADE_LEVELS } from "@/lib/constants";
import { generateGradeLevelTeachersPrint } from "@/lib/pdf";
import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import { useAppSelector } from "@/lib/redux/hook";
import {
  ALL_GRADE_LEVELS,
  fetchGradeLevelTeachers,
  GradeLevelTeacherGroup,
  learningAreaLabel,
  listOrDash,
  roleLabel,
  sexLabel,
} from "@/lib/utils/gradeLevelTeachers";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  ReportAccessDenied,
  ReportNeedsSchool,
  ReportShell,
  useCanViewReports,
} from "../components/ReportShell";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const canView = useCanViewReports();
  const { schoolId } = useReportSchool();

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [gradeLevel, setGradeLevel] = useState<string>(ALL_GRADE_LEVELS);
  const [groups, setGroups] = useState<GradeLevelTeacherGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const { settings } = useSchoolSettings(Boolean(schoolId), schoolId);

  useEffect(() => {
    let isMounted = true;
    if (!canView || !schoolId) {
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
        console.error("Error loading grade level teachers:", err);
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
  }, [canView, schoolId, schoolYear, gradeLevel]);

  const gradeLabel =
    gradeLevel === ALL_GRADE_LEVELS
      ? "All Grade Levels"
      : getGradeLevelLabel(Number(gradeLevel));

  const totalTeachers = useMemo(
    () => groups.reduce((sum, g) => sum + g.rows.length, 0),
    [groups],
  );

  const handlePrint = async () => {
    if (!schoolId) return;
    try {
      await generateGradeLevelTeachersPrint({
        schoolId,
        schoolYear,
        gradeLabel,
        groups,
        preparedBy: user?.name ?? "",
        principalName: settings.principal_name,
        principalTitle: settings.principal_title,
      });
    } catch (err) {
      console.error("Error printing grade level teachers:", err);
      toast.error("Failed to generate PDF");
    }
  };

  if (!canView) return <ReportAccessDenied />;
  if (!schoolId) return <ReportNeedsSchool />;

  return (
    <ReportShell
      title="Grade Level Teachers"
      description="Teachers assigned to a grade level in this school — derived from section advisorship and subject schedules."
      onPrint={handlePrint}
      printDisabled={loading || totalTeachers === 0}
      filters={
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5 w-full sm:w-48">
              <Label className="text-xs text-muted-foreground">
                School Year
              </Label>
              <Select value={schoolYear} onValueChange={setSchoolYear}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="School Year" />
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
            <div className="space-y-1.5 w-full sm:w-48">
              <Label className="text-xs text-muted-foreground">
                Grade Level
              </Label>
              <Select value={gradeLevel} onValueChange={setGradeLevel}>
                <SelectTrigger className="w-full">
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
          </div>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : `${totalTeachers} teaching assignment${
                  totalTeachers === 1 ? "" : "s"
                } across ${groups.length} grade level${
                  groups.length === 1 ? "" : "s"
                } for SY ${schoolYear}.`}
          </p>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No teaching assignments for {gradeLabel} in SY {schoolYear}.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.gradeLevel} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {group.label}{" "}
                <span className="font-normal text-muted-foreground">
                  — {group.rows.length} teacher
                  {group.rows.length === 1 ? "" : "s"}
                </span>
              </h3>
              <div className="app__table_shell">
                <div className="app__table_wrapper">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left font-medium w-8">#</th>
                        <th className="text-left font-medium">Teacher</th>
                        <th className="text-center font-medium w-12">Sex</th>
                        <th className="text-left font-medium">Position</th>
                        <th className="text-left font-medium">Role</th>
                        <th className="text-left font-medium">
                          Specialization
                        </th>
                        <th className="text-left font-medium">
                          Advisory Section
                        </th>
                        <th className="text-left font-medium">
                          Subjects Handled
                        </th>
                        <th className="text-left font-medium">
                          Sections Taught
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((r, i) => (
                        <tr key={`${group.gradeLevel}-${r.teacher_id}`}>
                          <td className="text-muted-foreground">{i + 1}</td>
                          <td className="font-medium">
                            <div className="flex items-center gap-2">
                              {r.teacher_name}
                              {r.is_adviser && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  Adviser
                                </Badge>
                              )}
                              {!r.teacher_is_active && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="text-center">
                            {sexLabel(r.teacher_gender)}
                          </td>
                          <td>{r.teacher_position || "—"}</td>
                          <td>{roleLabel(r.user_type)}</td>
                          <td>{learningAreaLabel(r.learning_area)}</td>
                          <td>{listOrDash(r.advisory_sections)}</td>
                          <td>{listOrDash(r.subject_names)}</td>
                          <td>{listOrDash(r.section_names)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            A teacher assigned to more than one grade level appears under each.
            This is a roster of teaching assignments, not a plantilla personnel
            count — membership comes from the assignment, so a volunteer teacher
            or a school head who kept a load is listed here and is deliberately
            not counted in the DepEd teaching-personnel figures.
          </p>
        </div>
      )}
    </ReportShell>
  );
}
