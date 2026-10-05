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
 */

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

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full min-w-[68rem] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-20 border-b border-r bg-muted px-3 py-2 text-left font-medium">
                Learners&rsquo; Names
              </th>
              <th rowSpan={2} className="border-b px-2 py-2 text-left font-medium">
                LRN
              </th>
              <th rowSpan={2} className="border-b px-2 py-2 text-left font-medium">
                Date of Birth
              </th>
              <th colSpan={2} className="px-2 pt-2 text-center font-medium">
                Age (BoSY)
              </th>
              <th colSpan={2} className="px-2 pt-2 text-center font-medium">
                Age (EoSY)
              </th>
              <th rowSpan={2} className="border-b px-2 py-2 text-center font-medium">
                Sex
              </th>
              {GRADE1_NARRATIVE_BLOCKS.map((b) => (
                <th key={b.key} rowSpan={2} className="min-w-[18rem] border-b px-2 py-2 text-left font-medium">
                  {b.title} <span className="font-normal text-muted-foreground">({b.filipino})</span>
                </th>
              ))}
            </tr>
            <tr className="text-muted-foreground">
              <th className="border-b px-1 pb-1.5 text-center font-normal">yrs</th>
              <th className="border-b px-1 pb-1.5 text-center font-normal">mos</th>
              <th className="border-b px-1 pb-1.5 text-center font-normal">yrs</th>
              <th className="border-b px-1 pb-1.5 text-center font-normal">mos</th>
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
                        <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-2 group-hover:bg-muted">
                          <span className="flex items-center gap-2">
                            <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                            {done ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Both blocks written" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground/50" aria-label="Not finished" />
                            )}
                            {l.name}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-b px-2 py-2 tabular-nums">{formatLrn(l.lrn)}</td>
                        <td className="whitespace-nowrap border-b px-2 py-2 tabular-nums">{formatDob(l.dateOfBirth)}</td>
                        <td className="border-b px-1 py-2 text-center tabular-nums">{bosy.years}</td>
                        <td className="border-b px-1 py-2 text-center tabular-nums">{bosy.months}</td>
                        <td className="border-b px-1 py-2 text-center tabular-nums">{eosy.years}</td>
                        <td className="border-b px-1 py-2 text-center tabular-nums">{eosy.months}</td>
                        <td className="border-b px-2 py-2 text-center">
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
