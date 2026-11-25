"use client";

import { LearnerSexGroupRow } from "@/components/LearnerSexGroupHeader";
import {
  ClassRecordGradingScheme,
  DEFAULT_GRADING_SCHEME,
} from "@/lib/constants/classRecord";
import {
  getMapehComponent,
  getMapehComponentShortLabel,
  MAPEH_LABEL,
  type MapehComponent,
} from "@/lib/constants/mapeh";
import { isOldShsCurriculum } from "@/lib/constants/shs";
import { mapehTermGrades } from "@/lib/utils/mapehTermGrades";
import { supabase } from "@/lib/supabase/client";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import { fetchSectionOfferings, offeredFor } from "@/lib/utils/sectionOfferings";
import {
  getGradingPeriodsForSection,
  isTermBasedSchoolYear,
  gradingPeriodsOfSemester,
  SEMESTER_LABELS,
} from "@/lib/utils/schoolYear";
import { Student } from "@/types";
import { Loader2, Plus } from "lucide-react";
import { termSlot } from "@/lib/constants/gradeAdjustments";
import { pointsFor, withPoints, adjustmentMap } from "@/lib/utils/finalPoints";
import {
  fetchSectionAdjustments,
  type SectionAdjustment,
} from "@/lib/utils/gradeAdjustments";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { descriptor, learnerName } from "./classRecordUtils";
import { GradeAdjustmentModal } from "./GradeAdjustmentModal";
import { DescriptorSummary } from "./DescriptorSummary";

interface FinalGradeViewProps {
  subjectId: string;
  sectionId: string;
  schoolYear: string;
  students: Student[];
  /** Migration 189 — "old" makes this two semesters of two quarters. */
  shsCurriculum?: string | null;
  /** Migration 155 — set when this subject is one half of MAPEH. */
  mapehComponent?: string | null;
  /** School heads look, they do not ask for points. */
  readOnly?: boolean;
}

/** The other MAPEH component scheduled in this section, with its grades. */
interface MapehSibling {
  subjectId: string;
  component: MapehComponent;
  grades: TermGrades;
}

type TermGrades = Record<string, Record<number, number>>; // studentId -> period -> grade

/**
 * The grade the form actually reports, and the periods it is averaged from.
 *
 * On the MATATAG terms that is one Final Grade over all three. On the old SHS
 * curriculum it is a **Semester Final Grade per semester** — the two semesters
 * carry different subjects, so there is no annual figure to report and SF9 and
 * SF10 both print the semester as the final column.
 */
interface FinalColumn {
  /** 0 = the year, 1 / 2 = a semester (migration 239). */
  semester: 0 | 1 | 2;
  label: string;
  periods: number[];
}

export function FinalGradeView({
  subjectId,
  sectionId,
  schoolYear,
  students,
  shsCurriculum,
  mapehComponent,
  readOnly = false,
}: FinalGradeViewProps) {
  const oldShs = isOldShsCurriculum(shsCurriculum);
  // MAPEH is Grades 1-10; an old-curriculum SHS section never carries it.
  const ownMapeh = oldShs
    ? null
    : getMapehComponent({ mapeh_component: mapehComponent ?? null });
  const periods = getGradingPeriodsForSection(schoolYear, shsCurriculum);
  const periodValues = periods.map((p) => p.value);
  // A Senior High subject offered in some terms of this section only (235):
  // its final is those terms. The database accepts an offering only for an
  // eligible section, so the read needs no grade-level test of its own.
  const [offered, setOffered] = useState<number[] | null>(null);
  useEffect(() => {
    if (oldShs) {
      setOffered(null);
      return;
    }
    let isMounted = true;
    fetchSectionOfferings(sectionId, schoolYear)
      .then((map) => {
        if (isMounted) setOffered(offeredFor(map, subjectId));
      })
      .catch((error) => console.error("FinalGradeView offerings:", error));
    return () => {
      isMounted = false;
    };
  }, [oldShs, sectionId, subjectId, schoolYear]);

  const finalColumns: FinalColumn[] = oldShs
    ? ([1, 2] as const).map((sem) => ({
        semester: sem,
        label: `${SEMESTER_LABELS[sem]} Final`,
        periods: gradingPeriodsOfSemester(sem),
      }))
    : [{ semester: 0, label: "Final Grade", periods: offered ?? periodValues }];
  const [grades, setGrades] = useState<TermGrades>({});
  // `student::period` of grades copied from a transferee's SF9 (200): they take
  // no additional points.
  const [carried, setCarried] = useState<Set<string>>(new Set());
  const termPointsAllowed = isTermBasedSchoolYear(schoolYear);
  const [scheme, setScheme] = useState<ClassRecordGradingScheme>(
    DEFAULT_GRADING_SCHEME
  );
  const [mixedSchemes, setMixedSchemes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mapehSiblings, setMapehSiblings] = useState<MapehSibling[]>([]);

  // Additional points (239) on this subject and on its MAPEH siblings. null =
  // not available (migration not applied, or the read failed): no button.
  const [adjustments, setAdjustments] = useState<SectionAdjustment[] | null>(null);
  const [adjusting, setAdjusting] = useState<{
    student: Student;
    semester: number;
    gradeLabel: string;
    base: number;
  } | null>(null);
  const siblingIdsKey = mapehSiblings.map((sib) => sib.subjectId).join(",");
  const loadAdjustments = useCallback(async () => {
    try {
      return await fetchSectionAdjustments(
        sectionId,
        [subjectId, ...siblingIdsKey.split(",").filter(Boolean)],
        schoolYear,
      );
    } catch (error) {
      console.error("FinalGradeView adjustments:", error);
      toast.error("Could not load additional points");
      return null;
    }
  }, [sectionId, subjectId, schoolYear, siblingIdsKey]);
  useEffect(() => {
    let isMounted = true;
    loadAdjustments().then((rows) => {
      if (isMounted) setAdjustments(rows);
    });
    return () => {
      isMounted = false;
    };
  }, [loadAdjustments]);
  const approved = useMemo(
    () => adjustmentMap((adjustments ?? []).filter((a) => a.status === "approved")),
    [adjustments],
  );
  /** The live request if any, else the latest rejected one (rows are newest first). */
  const requestOf = (studentId: string, semester: number) => {
    const own = (adjustments ?? []).filter(
      (a) =>
        String(a.student_id) === String(studentId) &&
        String(a.subject_id) === String(subjectId) &&
        a.semester === semester,
    );
    return own.find((a) => a.status !== "rejected") ?? own[0] ?? null;
  };

  // The other half of MAPEH (Music & Arts ↔ PE & Health) scheduled in this
  // section, so the MAPEH Final Grade can be shown beside this one. Read-only:
  // nothing here writes a grade.
  useEffect(() => {
    if (!ownMapeh) {
      setMapehSiblings([]);
      return;
    }
    let isMounted = true;
    const load = async () => {
      const { data: schedules, error } = await supabase
        .from("sms_subject_schedules")
        .select("subject_id, subjects:subject_id (id, mapeh_component)")
        .eq("section_id", Number(sectionId))
        .eq("school_year", schoolYear);
      if (error) {
        console.error("FinalGradeView MAPEH siblings:", error);
        return;
      }
      const siblingComponents = new Map<string, MapehComponent>();
      (schedules ?? []).forEach((row) => {
        const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
        if (!subject || String(subject.id) === subjectId) return;
        const component = getMapehComponent(subject);
        if (component) siblingComponents.set(String(subject.id), component);
      });
      if (siblingComponents.size === 0) {
        if (isMounted) setMapehSiblings([]);
        return;
      }
      const { data: rows, error: gradeError } = await supabase
        .from("sms_grades")
        .select("subject_id, student_id, grading_period, grade")
        .eq("section_id", Number(sectionId))
        .eq("school_year", schoolYear)
        .in("subject_id", [...siblingComponents.keys()].map(Number))
        .in("grading_period", periodValues);
      if (gradeError) {
        console.error("FinalGradeView MAPEH grades:", gradeError);
        return;
      }
      const bySubject = new Map<string, TermGrades>();
      siblingComponents.forEach((_, id) => bySubject.set(id, {}));
      (rows ?? []).forEach((row) => {
        const map = bySubject.get(String(row.subject_id));
        if (!map) return;
        const sid = String(row.student_id);
        if (!map[sid]) map[sid] = {};
        map[sid][row.grading_period] = Number(row.grade);
      });
      if (isMounted) {
        setMapehSiblings(
          [...siblingComponents.entries()].map(([id, component]) => ({
            subjectId: id,
            component,
            grades: bySubject.get(id) ?? {},
          })),
        );
      }
    };
    load();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownMapeh, subjectId, sectionId, schoolYear, shsCurriculum]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const [gradeRes, recordRes] = await Promise.all([
        supabase
          .from("sms_grades")
          .select("student_id, grading_period, grade, carried_from_school")
          .eq("subject_id", subjectId)
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear)
          .in("grading_period", periodValues),
        // The descriptor band depends on which grading scheme the terms were
        // graded under, which is pinned on the class record (migration 173).
        supabase
          .from("sms_class_records")
          .select("grading_period, grading_scheme")
          .eq("subject_id", subjectId)
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear)
          .in("grading_period", periodValues)
          .order("grading_period"),
      ]);
      if (!mounted) return;

      const map: TermGrades = {};
      const carriedKeys = new Set<string>();
      (gradeRes.data || []).forEach((row) => {
        const sid = String(row.student_id);
        if (!map[sid]) map[sid] = {};
        map[sid][row.grading_period] = Number(row.grade);
        if (row.carried_from_school) carriedKeys.add(`${sid}::${row.grading_period}`);
      });
      setGrades(map);
      setCarried(carriedKeys);

      // Before migration 173 the column does not exist and the select errors;
      // fall back to the old descriptors rather than relabelling old grades.
      const schemes = recordRes.error
        ? (["legacy"] as ClassRecordGradingScheme[])
        : ((recordRes.data || []).map((r) =>
            r.grading_scheme === "matatag" ? "matatag" : "legacy"
          ) as ClassRecordGradingScheme[]);
      // The latest term wins — a school that moved mid-year reports the year
      // under the scheme it finished on rather than the one it started on.
      setScheme(schemes.length ? schemes[schemes.length - 1] : DEFAULT_GRADING_SCHEME);
      setMixedSchemes(new Set(schemes).size > 1);

      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, sectionId, schoolYear, shsCurriculum]);

  /**
   * The average of the column's periods, rounded — and only once every one of
   * them is posted.
   *
   * The DepEd form is explicit about the completeness rule
   * (`IF(COUNT(TERM 1, TERM 2, TERM 3) < 3, "", ROUND(AVERAGE(...), 0))`):
   * averaging whatever periods happen to exist reports a mid-year figure as if
   * it were final. It holds a semester at a time on the old SHS curriculum,
   * where a first-semester grade is final in December and owes nothing to a
   * second semester that has not started.
   */
  const baseFinalOf = (studentId: string, column: FinalColumn): number | null => {
    const terms = grades[studentId];
    if (!terms) return null;
    const values = column.periods
      .map((p) => terms[p])
      .filter((g): g is number => g != null);
    if (values.length < column.periods.length) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  };

  /** With the approved additional points (239). */
  const finalOf = (studentId: string, column: FinalColumn): number | null =>
    withPoints(
      baseFinalOf(studentId, column),
      pointsFor(approved, studentId, subjectId, schoolYear, column.periods),
    );

  const showMapeh = ownMapeh !== null && mapehSiblings.length > 0;
  // One column group per sibling — normally exactly one.
  const siblingColumns = showMapeh
    ? mapehSiblings.map((sib, i) => ({
        key: `${sib.component}-${i}`,
        subjectId: sib.subjectId,
        label: getMapehComponentShortLabel(sib.component),
        grades: sib.grades,
      }))
    : [];

  const siblingFinal = (
    sibSubjectId: string,
    grades: TermGrades,
    studentId: string,
  ): number | null => {
    const terms = grades[studentId];
    if (!terms) return null;
    const values = periodValues.map((p) => terms[p]).filter((g): g is number => g != null);
    if (values.length < periodValues.length) return null;
    return withPoints(
      Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      pointsFor(approved, studentId, sibSubjectId, schoolYear, periodValues),
    );
  };

  const mapehOf = (studentId: string) =>
    ownMapeh === null
      ? null
      : mapehTermGrades(
          [
            {
              component: ownMapeh,
              terms: grades[studentId],
              finalPoints: pointsFor(approved, studentId, subjectId, schoolYear, periodValues),
            },
            ...mapehSiblings.map((sib) => ({
              component: sib.component,
              terms: sib.grades[studentId],
              finalPoints: pointsFor(approved, studentId, sib.subjectId, schoolYear, periodValues),
            })),
          ],
          periodValues,
        );

  // Each sibling, and MAPEH itself, takes a column per period plus its final.
  const extraColumns = showMapeh
    ? (siblingColumns.length + 1) * (periods.length + 1)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading final grades…
      </div>
    );
  }

  // Only the learners whose three terms are all posted have a Final Grade at
  // all, so those are the ones the summary counts — the same rule the column
  // above follows.
  const finalsOfColumn = (column: FinalColumn) =>
    students
      .map((s) => finalOf(s.id, column))
      .filter((g): g is number => g !== null);

  return (
    <div className="space-y-2">
      {mixedSchemes && (
        <p className="text-xs text-amber-600">
          The {oldShs ? "quarters" : "three terms"} were not all graded under
          the same DepEd grading scheme. The descriptor below follows the
          latest one&apos;s scheme.
        </p>
      )}
      <div className="overflow-x-auto border rounded-md">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-muted/60">
              <th className="border px-3 py-2 text-left min-w-56">
                Learners&apos; Names
              </th>
              {periods.map((p) => (
                <th
                  key={p.value}
                  className="border px-3 py-2 text-center w-24"
                >
                  {p.label}
                </th>
              ))}
              {finalColumns.map((c) => (
                <th
                  key={c.label}
                  className="border px-3 py-2 text-center w-28 text-green-700"
                >
                  {c.label}
                </th>
              ))}
              {siblingColumns.map((c) => (
                <Fragment key={c.key}>
                  {periods.map((p) => (
                    <th key={p.value} className="border px-3 py-2 text-center w-24">
                      {c.label} {p.label}
                    </th>
                  ))}
                  <th className="border px-3 py-2 text-center w-28">
                    {c.label} Final
                  </th>
                </Fragment>
              ))}
              {showMapeh && (
                <>
                  {periods.map((p) => (
                    <th
                      key={p.value}
                      className="border px-3 py-2 text-center w-24 text-blue-700"
                    >
                      {MAPEH_LABEL} {p.label}
                    </th>
                  ))}
                  <th className="border px-3 py-2 text-center w-28 text-blue-700">
                    {MAPEH_LABEL} Final Grade
                  </th>
                </>
              )}
              <th className="border px-3 py-2 text-center w-36">Descriptor</th>
            </tr>
          </thead>
          <tbody>
            {groupLearnersBySex(students, (st) => st.gender)
              .filter((group) => group.rows.length > 0)
              .map((group) => (
                <Fragment key={group.key}>
                  <LearnerSexGroupRow
                    label={group.label}
                    count={group.rows.length}
                    colSpan={periods.length + finalColumns.length + extraColumns + 2}
                  />
                  {group.rows.map((s) => {
                    const t = grades[s.id] || {};
                    const mapeh = showMapeh ? mapehOf(s.id) : null;
                    const finals = finalColumns.map((c) => finalOf(s.id, c));
                    // The descriptor names the latest figure the learner actually
                    // has — on a semestral record that is the semester just closed,
                    // not a year nobody has finished.
                    const latest = [...finals].reverse().find((g) => g !== null) ?? null;
                    return (
                      <tr key={s.id} className="hover:bg-muted/30">
                        <td className="border px-3 py-1.5 whitespace-nowrap">
                          {learnerName(s)}
                        </td>
                        {periods.map((p) => {
                          const grade = t[p.value];
                          const request = requestOf(s.id, termSlot(p.value));
                          const canAsk =
                            !readOnly &&
                            termPointsAllowed &&
                            adjustments !== null &&
                            grade > 0 &&
                            !carried.has(`${s.id}::${p.value}`);
                          return (
                            <td
                              key={p.value}
                              className="border px-3 py-1.5 text-center"
                            >
                              <PointsCell
                                value={grade ?? null}
                                request={request}
                                label={`${p.label} points for ${learnerName(s)}`}
                                onOpen={
                                  canAsk
                                    ? () =>
                                        setAdjusting({
                                          student: s,
                                          semester: termSlot(p.value),
                                          gradeLabel: `${p.label} grade`,
                                          // Approved term points are already in it.
                                          base:
                                            request?.status === "approved"
                                              ? grade - request.points
                                              : grade,
                                        })
                                    : null
                                }
                              />
                            </td>
                          );
                        })}
                        {finals.map((fin, i) => (
                          <td
                            key={finalColumns[i].label}
                            className="border px-3 py-1.5 text-center font-semibold text-green-700"
                          >
                            <PointsCell
                              value={fin}
                              request={requestOf(s.id, finalColumns[i].semester)}
                              label={`Additional points for ${learnerName(s)}`}
                              onOpen={
                                readOnly || adjustments === null || fin === null
                                  ? null
                                  : () => {
                                      const base = baseFinalOf(s.id, finalColumns[i]);
                                      if (base !== null) {
                                        setAdjusting({
                                          student: s,
                                          semester: finalColumns[i].semester,
                                          gradeLabel: oldShs
                                            ? finalColumns[i].label
                                            : "final grade",
                                          base,
                                        });
                                      }
                                    }
                              }
                            />
                          </td>
                        ))}
                        {siblingColumns.map((c) => (
                          <Fragment key={c.key}>
                            {periods.map((p) => (
                              <td
                                key={p.value}
                                className="border px-3 py-1.5 text-center"
                              >
                                {c.grades[s.id]?.[p.value] ?? "-"}
                              </td>
                            ))}
                            <td className="border px-3 py-1.5 text-center font-semibold">
                              {siblingFinal(c.subjectId, c.grades, s.id) ?? "-"}
                            </td>
                          </Fragment>
                        ))}
                        {showMapeh && (
                          <>
                            {periods.map((p) => (
                              <td
                                key={p.value}
                                className="border px-3 py-1.5 text-center text-blue-700"
                              >
                                {mapeh?.terms[p.value] ?? "-"}
                              </td>
                            ))}
                            <td className="border px-3 py-1.5 text-center font-semibold text-blue-700">
                              {mapeh?.final ?? "-"}
                            </td>
                          </>
                        )}
                        <td className="border px-3 py-1.5 text-center text-xs">
                          {latest === null ? "-" : descriptor(latest, scheme)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            {students.length === 0 && (
              <tr>
                <td
                  colSpan={periods.length + finalColumns.length + extraColumns + 2}
                  className="border px-3 py-6 text-center text-muted-foreground"
                >
                  No enrolled learners found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {adjusting && (
        <GradeAdjustmentModal
          studentId={String(adjusting.student.id)}
          studentName={learnerName(adjusting.student)}
          subjectId={subjectId}
          sectionId={sectionId}
          semester={adjusting.semester}
          gradeLabel={adjusting.gradeLabel}
          baseFinal={adjusting.base}
          current={requestOf(adjusting.student.id, adjusting.semester)}
          onClose={() => setAdjusting(null)}
          onChanged={() => void loadAdjustments().then(setAdjustments)}
        />
      )}
      {students.length > 0 &&
        finalColumns.map((c) => (
          <DescriptorSummary
            key={c.label}
            grades={finalsOfColumn(c)}
            scheme={scheme}
            learnerCount={students.length}
            label={`${c.label} descriptors`}
          />
        ))}

      <p className="text-xs text-muted-foreground">
        {oldShs
          ? "Each Semester Final Grade is the average of that semester's two quarters, and appears only once both are posted. The old SHS curriculum reports a grade per semester — the two semesters carry different subjects, so there is no annual final."
          : offered
            ? `This subject is offered in ${offered.map((t) => `Term ${t}`).join(" and ")} only in this section, so its Final Grade is ${offered.length === 1 ? "that term's grade" : "the average of those terms"} and appears once ${offered.length === 1 ? "it is" : "they are"} posted.`
            : "The Final Grade is the average of the three term grades, and appears only once all three terms have been posted."}
      </p>
      {showMapeh && (
        <p className="text-xs text-muted-foreground">
          The {MAPEH_LABEL} Final Grade averages this subject with{" "}
          {mapehSiblings
            .map((sib) => getMapehComponentShortLabel(sib.component))
            .join(" and ")}{" "}
          — each term&apos;s two grades are averaged, then the terms — exactly as
          the report card and SF9 compute it. A term&apos;s {MAPEH_LABEL} grade
          appears once every component has that term posted, and the final once
          every term is complete.
        </p>
      )}
      {ownMapeh && !showMapeh && (
        <p className="text-xs text-muted-foreground">
          No other {MAPEH_LABEL} component is scheduled in this section, so there
          is no {MAPEH_LABEL} Final Grade to show.
        </p>
      )}
    </div>
  );
}

/** A final or term grade, its additional points, and the button that asks for them. */
function PointsCell({
  value,
  request,
  label,
  onOpen,
}: {
  value: number | null;
  request: SectionAdjustment | null;
  label: string;
  /** null = no button: view only, or no grade yet. */
  onOpen: (() => void) | null;
}) {
  const tag =
    request?.status === "pending"
      ? `+${request.points} pending`
      : request?.status === "approved"
        ? `+${request.points}`
        : request?.status === "rejected"
          ? "rejected"
          : null;
  const tone =
    request?.status === "approved"
      ? "text-green-700"
      : request?.status === "pending"
        ? "text-amber-600"
        : "text-destructive";
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      {value ?? "-"}
      {tag && <span className={`text-xs font-normal ${tone}`}>{tag}</span>}
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={label}
          title="Additional points"
          className="rounded border p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
