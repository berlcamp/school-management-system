"use client";

/**
 * Absenteeism — the adviser's view: every learner in the advisory section with
 * their days absent, tardies and longest run of consecutive absences, boys
 * then girls. Scored with SF2's own functions, so a learner's figure here is
 * the one on their SF2 (see fetchSectionAbsences).
 */

import {
  AbsenteeismFootnote,
  AbsenteeismTable,
} from "@/components/reports/AbsenteeismTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { getGradeLevelLabel } from "@/lib/constants";
import { generateSectionAbsenteeismPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import { formatLrn } from "@/lib/utils";
import {
  AbsenteeismCounts,
  AbsenteeismFigures,
  CONSECUTIVE_ABSENCE_ALERT,
  fetchSectionAbsences,
  formatDays,
  isChronicallyAbsent,
  learnerRate,
  periodOptions,
  periodRange,
  SectionAbsences,
  WHOLE_YEAR,
} from "@/lib/utils/absenteeism";
import { groupLearnersBySex, learnerSexKey } from "@/lib/utils/learnerSex";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { CalendarX, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AdvisoryLearnerRow,
  advisoryLearnerName,
  useAdvisoryLearners,
} from "../useAdvisoryLearners";

const NO_ABSENCE = { daysAbsent: 0, tardy: 0, longestStreak: 0 };

function counts(
  learners: AdvisoryLearnerRow[],
  data: SectionAbsences,
): AbsenteeismCounts {
  let absentees = 0;
  let chronic = 0;
  let daysAbsent = 0;
  for (const l of learners) {
    const a = data.byStudent.get(String(l.id)) ?? NO_ABSENCE;
    daysAbsent += a.daysAbsent;
    if (a.daysAbsent > 0) absentees += 1;
    if (isChronicallyAbsent(a.daysAbsent, data.classDays)) chronic += 1;
  }
  return {
    enrolled: learners.length,
    absentees,
    chronic,
    daysAbsent,
    learnerDays: learners.length * data.classDays,
  };
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const { rows: learners, loading: learnersLoading, schoolId } =
    useAdvisoryLearners(schoolYear);

  const periods = useMemo(() => periodOptions(schoolYear), [schoolYear]);
  const [period, setPeriod] = useState<string>(WHOLE_YEAR);
  const [sectionId, setSectionId] = useState<string>("");
  const [data, setData] = useState<SectionAbsences | null>(null);
  const [loading, setLoading] = useState(false);

  const { settings } = useSchoolSettings(Boolean(schoolId), schoolId);

  const sections = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; grade: number | null }>();
    learners.forEach((l) => {
      if (!l.section_id || seen.has(l.section_id)) return;
      seen.set(l.section_id, {
        id: l.section_id,
        grade: l.section_grade_level,
        label: `${
          l.section_grade_level != null
            ? `${getGradeLevelLabel(l.section_grade_level)} – `
            : ""
        }${l.section_name ?? "Section"}`,
      });
    });
    return [...seen.values()].sort(
      (a, b) => (a.grade ?? 99) - (b.grade ?? 99) || a.label.localeCompare(b.label),
    );
  }, [learners]);

  useEffect(() => {
    setPeriod(WHOLE_YEAR);
  }, [schoolYear]);

  useEffect(() => {
    if (sections.length === 0) setSectionId("");
    else if (!sections.some((s) => s.id === sectionId)) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  useEffect(() => {
    let isMounted = true;
    if (!sectionId) {
      setData(null);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const result = await fetchSectionAbsences(
          sectionId,
          schoolId,
          schoolYear,
          periodRange(period),
        );
        if (isMounted) setData(result);
      } catch (err) {
        if (!isMounted) return;
        toast.error(err instanceof Error ? err.message : "Failed to load attendance");
        setData(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [sectionId, schoolId, schoolYear, period]);

  const sectionLearners = useMemo(
    () => learners.filter((l) => l.section_id === sectionId),
    [learners, sectionId],
  );
  const section = sections.find((s) => s.id === sectionId);
  const periodLabel =
    periods.find((p) => p.value === period)?.label ?? "Whole school year";

  const summary: AbsenteeismFigures | null = useMemo(() => {
    if (!data) return null;
    const male = sectionLearners.filter((l) => learnerSexKey(l.gender) === "male");
    const female = sectionLearners.filter((l) => learnerSexKey(l.gender) === "female");
    return {
      male: counts(male, data),
      female: counts(female, data),
      total: counts(sectionLearners, data),
    };
  }, [data, sectionLearners]);

  const absenceOf = (l: AdvisoryLearnerRow) =>
    data?.byStudent.get(String(l.id)) ?? NO_ABSENCE;

  const handlePrint = async () => {
    if (!data || !section || schoolId == null) return;
    try {
      await generateSectionAbsenteeismPrint({
        schoolId,
        schoolYear,
        periodLabel,
        sectionLabel: section.label,
        classDays: data.classDays,
        learners: sectionLearners.map((l) => ({
          name: advisoryLearnerName(l),
          lrn: l.lrn ? formatLrn(l.lrn) : null,
          sex: l.gender,
          ...absenceOf(l),
        })),
        adviserName: user?.name ?? "",
        principalName: settings.principal_name,
        principalTitle: settings.principal_title,
      });
    } catch (err) {
      console.error("Error printing absenteeism:", err);
      toast.error("Failed to generate PDF");
    }
  };

  const groups = groupLearnersBySex(sectionLearners, (l) => l.gender);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <CalendarX className="h-5 w-5" />
          Absenteeism
        </h1>
        <p className="text-sm text-muted-foreground">
          Absences of each learner in your advisory section, from the daily
          attendance you encode.
        </p>
      </div>

      <div className="app__content space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <label className="mb-1.5 block text-sm font-medium">School Year</label>
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
          <div className="w-64">
            <label className="mb-1.5 block text-sm font-medium">Section</label>
            <Select
              value={sectionId || undefined}
              onValueChange={setSectionId}
              disabled={learnersLoading || sections.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={learnersLoading ? "Loading…" : "No advisory section"}
                />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <label className="mb-1.5 block text-sm font-medium">Period</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={loading || !data || sectionLearners.length === 0}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>

        {learnersLoading || loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !section || !data || !summary ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            You have no advisory section with enrolled learners in SY {schoolYear}.
          </p>
        ) : (
          <>
            <AbsenteeismTable
              caption={`${section.label} — ${periodLabel} — ${formatDays(
                data.classDays,
              )} class days held`}
              labelHeader="Section"
              rows={[
                {
                  key: "section",
                  label: section.label,
                  kind: "total",
                  figures: summary,
                },
              ]}
            />

            <div className="app__table_shell [&_tbody_td]:tabular-nums">
              <div className="app__table_wrapper overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="w-10 text-left font-medium">#</th>
                      <th className="text-left font-medium">Learner</th>
                      <th className="text-left font-medium">LRN</th>
                      <th className="text-center font-medium">Days Absent</th>
                      <th className="text-center font-medium">Absence Rate</th>
                      <th className="text-center font-medium">Times Tardy</th>
                      <th className="text-center font-medium">
                        Longest Consecutive Absence
                      </th>
                      <th className="text-left font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <GroupRows
                        key={g.key}
                        label={g.label}
                        rows={g.rows}
                        absenceOf={absenceOf}
                        classDays={data.classDays}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              A learner absent {CONSECUTIVE_ABSENCE_ALERT} or more consecutive
              class days is due a home visitation (SF2, instruction 5).
            </p>
            <AbsenteeismFootnote />
          </>
        )}
      </div>
    </div>
  );
}

function GroupRows({
  label,
  rows,
  absenceOf,
  classDays,
}: {
  label: string;
  rows: AdvisoryLearnerRow[];
  absenceOf: (l: AdvisoryLearnerRow) => {
    daysAbsent: number;
    tardy: number;
    longestStreak: number;
  };
  classDays: number;
}) {
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={8} className="text-xs font-semibold tracking-wide">
          {label} ({rows.length})
        </td>
      </tr>
      {rows.map((l, i) => {
        const a = absenceOf(l);
        const chronic = isChronicallyAbsent(a.daysAbsent, classDays);
        const streak = a.longestStreak >= CONSECUTIVE_ABSENCE_ALERT;
        return (
          <tr key={l.id}>
            <td>{i + 1}</td>
            <td className="font-medium">{advisoryLearnerName(l)}</td>
            <td className="font-mono text-xs">{l.lrn ? formatLrn(l.lrn) : "—"}</td>
            <td className="text-center">{formatDays(a.daysAbsent)}</td>
            <td className="text-center">{learnerRate(a.daysAbsent, classDays)}</td>
            <td className="text-center">{a.tardy}</td>
            <td className="text-center">{a.longestStreak}</td>
            <td>
              <div className="flex flex-wrap gap-1">
                {chronic && <Badge variant="destructive">Chronic</Badge>}
                {streak && (
                  <Badge variant="outline">
                    {a.longestStreak} days in a row
                  </Badge>
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
