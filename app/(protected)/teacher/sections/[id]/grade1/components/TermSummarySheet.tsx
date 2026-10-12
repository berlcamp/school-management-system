"use client";

import { LearnerSexGroupRow } from "@/components/LearnerSexGroupHeader";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GRADE1_NARRATIVE_BLOCKS } from "@/lib/constants/pace";
import { formatLrn } from "@/lib/utils";
import { ageYearsMonths, grade1AgeReferenceDates } from "@/lib/utils/grade1Workbook";
import { groupLearnersBySex, learnerSexKey } from "@/lib/utils/learnerSex";
import type { PaceTerm } from "@/types";
import { CheckCircle2, Circle } from "lucide-react";
import { Fragment, useId, useState } from "react";
import { narrativeKey, type NarrativeKey, type WorkbookLearner } from "../useGrade1Workbook";
import { formatDob } from "./format";

/**
 * TERM 1 / 2 / 3 SUMMARY — the class list with each learner's two narrative
 * blocks for the term, which is what the Progress Card (SF9) prints. Age at
 * BoSY / EoSY is computed against the same dates the card uses.
 *
 * Below `xl` the reference columns (LRN, birthdate, ages, sex) fold into a
 * line under the learner's name, so the two blocks being written stay on
 * screen.
 */

/** Reference columns shown only on wide screens. */
const WIDE = "hidden xl:table-cell";

export function isNarrativeComplete(n: Record<NarrativeKey, string> | undefined): boolean {
  return !!n && !!n.can_do.trim() && !!n.to_improve.trim();
}

export function TermSummarySheet({
  term,
  schoolYear,
  learners,
  narratives,
  disabled,
  onChange,
}: {
  term: PaceTerm;
  schoolYear: string;
  learners: WorkbookLearner[];
  narratives: Record<string, Record<NarrativeKey, string>>;
  disabled: boolean;
  onChange: (studentId: string, term: PaceTerm, field: NarrativeKey, value: string) => void;
}) {
  const ages = grade1AgeReferenceDates(schoolYear);
  // Filter once on toggle, not on every keystroke: a learner whose second
  // block is just being finished must not vanish from under the cursor.
  const [incompleteIds, setIncompleteIds] = useState<Set<string> | null>(null);
  const switchId = useId();

  const visible = incompleteIds ? learners.filter((l) => incompleteIds.has(l.id)) : learners;
  const groups = groupLearnersBySex(visible, (l) => l.gender);
  const doneCount = learners.filter((l) => isNarrativeComplete(narratives[narrativeKey(l.id, term)])).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {doneCount} of {learners.length}
          </span>{" "}
          learners have both blocks written for Term {term}.
        </p>
        <label htmlFor={switchId} className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch
            id={switchId}
            checked={incompleteIds !== null}
            onCheckedChange={(on) =>
              setIncompleteIds(
                on
                  ? new Set(
                      learners
                        .filter((l) => !isNarrativeComplete(narratives[narrativeKey(l.id, term)]))
                        .map((l) => l.id),
                    )
                  : null,
              )
            }
          />
          Show only learners still to write
        </label>
      </div>

      <div className="max-h-[75dvh] min-h-0 flex-1 overflow-auto rounded-lg border bg-card lg:max-h-none">
        <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-20 border-b border-r bg-muted px-2 py-2 text-left font-medium sm:px-3">
                Learners&rsquo; Names
              </th>
              <th rowSpan={2} className={`${WIDE} border-b px-2 py-2 text-left font-medium`}>
                LRN
              </th>
              <th rowSpan={2} className={`${WIDE} border-b px-2 py-2 text-left font-medium`}>
                Date of Birth
              </th>
              <th colSpan={2} className={`${WIDE} px-2 pt-2 text-center font-medium`}>
                Age (BoSY)
              </th>
              <th colSpan={2} className={`${WIDE} px-2 pt-2 text-center font-medium`}>
                Age (EoSY)
              </th>
              <th rowSpan={2} className={`${WIDE} border-b px-2 py-2 text-center font-medium`}>
                Sex
              </th>
              {GRADE1_NARRATIVE_BLOCKS.map((b) => (
                <th key={b.key} rowSpan={2} className="min-w-[13rem] border-b px-2 py-2 text-left font-medium xl:min-w-[18rem]">
                  {b.title} <span className="font-normal text-muted-foreground">({b.filipino})</span>
                </th>
              ))}
            </tr>
            <tr className="text-muted-foreground">
              {["yrs", "mos", "yrs", "mos"].map((u, i) => (
                <th key={i} className={`${WIDE} border-b px-1 pb-1.5 text-center font-normal`}>
                  {u}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                  Every learner has both blocks written for Term {term}.
                </td>
              </tr>
            )}
            {visible.length > 0 &&
              groups.map((g) => (
                <Fragment key={g.key}>
                  <LearnerSexGroupRow label={g.label} count={g.rows.length} colSpan={10} />
                  {g.rows.map((l, i) => {
                    const bosy = ageYearsMonths(l.dateOfBirth, ages.bosy);
                    const eosy = ageYearsMonths(l.dateOfBirth, ages.eosy);
                    const n = narratives[narrativeKey(l.id, term)];
                    const done = isNarrativeComplete(n);
                    const sex = learnerSexKey(l.gender);
                    return (
                      <tr key={l.id} className="group align-top">
                        <td className="sticky left-0 z-10 max-w-[9.5rem] whitespace-nowrap border-b border-r bg-card px-2 py-2 group-hover:bg-muted sm:max-w-none sm:px-3">
                          <span className="flex items-center gap-2">
                            <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                            {done ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Both blocks written" />
                            ) : (
                              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-label="Not finished" />
                            )}
                            <span className="min-w-0 truncate" title={l.name}>
                              {l.name}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate pl-[3.25rem] text-xs text-muted-foreground tabular-nums xl:hidden">
                            {formatLrn(l.lrn)} · {bosy.years}y {bosy.months}m
                          </span>
                        </td>
                        <td className={`${WIDE} whitespace-nowrap border-b px-2 py-2 tabular-nums`}>{formatLrn(l.lrn)}</td>
                        <td className={`${WIDE} whitespace-nowrap border-b px-2 py-2 tabular-nums`}>{formatDob(l.dateOfBirth)}</td>
                        <td className={`${WIDE} border-b px-1 py-2 text-center tabular-nums`}>{bosy.years}</td>
                        <td className={`${WIDE} border-b px-1 py-2 text-center tabular-nums`}>{bosy.months}</td>
                        <td className={`${WIDE} border-b px-1 py-2 text-center tabular-nums`}>{eosy.years}</td>
                        <td className={`${WIDE} border-b px-1 py-2 text-center tabular-nums`}>{eosy.months}</td>
                        <td className={`${WIDE} border-b px-2 py-2 text-center`}>
                          {sex === "male" ? "M" : sex === "female" ? "F" : ""}
                        </td>
                        {GRADE1_NARRATIVE_BLOCKS.map((b) => (
                          <td key={b.key} className="border-b px-1.5 py-1.5">
                            <Textarea
                              value={n?.[b.key] ?? ""}
                              onChange={(e) => onChange(l.id, term, b.key, e.target.value)}
                              disabled={disabled}
                              rows={2}
                              placeholder={b.key === "can_do" ? "Your child can…" : "Your child is learning to…"}
                              className="field-sizing-content min-h-[3.25rem] resize-none text-sm"
                              aria-label={`${l.name}: ${b.title}`}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
