"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { describeBlock } from "@/lib/utils/scheduleConflicts";
import { planHandover } from "@/lib/utils/scheduleHandover";
import {
  normaliseScheduleTerms,
  scheduleTermOptions,
  type ScheduleTermOption,
} from "@/lib/utils/scheduleTerms";
import { SubjectSchedule } from "@/types";
import { useEffect, useMemo, useState } from "react";

export interface ScheduleHandover {
  sources: SubjectSchedule[];
  fromPeriod: number;
}

/** The periods every option of the section covers, in order. */
const allPeriodsOf = (options: ScheduleTermOption[]) =>
  options.flatMap((o) => o.periods);

/**
 * The "Change from…" choices for one schedule row (migration 222): every
 * option after the first period the row covers, each with whether a handover
 * there leaves both teachers something. Shared by the dialog and the entry
 * points, which hide or disable the action from the same answer.
 */
export function changeFromChoices(
  schedule: Pick<SubjectSchedule, "grading_periods" | "school_year">,
  shsCurriculum?: string | null,
): { option: ScheduleTermOption; fromPeriod: number; possible: boolean }[] {
  const options = scheduleTermOptions(schedule.school_year, shsCurriculum);
  const allPeriods = allPeriodsOf(options);
  const covered = schedule.grading_periods ?? allPeriods;
  const first = Math.min(...covered.filter((p) => allPeriods.includes(p)));
  return options
    .filter((o) => o.periods[0]! > first)
    .map((option) => {
      const fromPeriod = option.periods[0]!;
      return {
        option,
        fromPeriod,
        possible:
          planHandover(schedule.grading_periods ?? null, fromPeriod, allPeriods) !=
          null,
      };
    });
}

/**
 * Same subject, section, teacher and school year, and the same periods — the
 * other time blocks of the class, which change hands with it. A block on a
 * different set of periods would split differently, so it is left to its own
 * "Change from…".
 */
export function handoverSiblings(
  schedule: SubjectSchedule,
  rows: SubjectSchedule[],
  shsCurriculum?: string | null,
): SubjectSchedule[] {
  const allPeriods = allPeriodsOf(
    scheduleTermOptions(schedule.school_year, shsCurriculum),
  );
  const termsKey = (row: SubjectSchedule) =>
    JSON.stringify(normaliseScheduleTerms(row.grading_periods ?? allPeriods, allPeriods));
  return rows.filter(
    (row) =>
      String(row.id) !== String(schedule.id) &&
      String(row.subject_id) === String(schedule.subject_id) &&
      String(row.section_id) === String(schedule.section_id) &&
      String(row.teacher_id ?? "") === String(schedule.teacher_id ?? "") &&
      row.school_year === schedule.school_year &&
      termsKey(row) === termsKey(schedule),
  );
}

interface ChangeFromDialogProps {
  open: boolean;
  schedule: SubjectSchedule | null;
  /** Candidate rows; filtered here with `handoverSiblings`. */
  siblings: SubjectSchedule[];
  shsCurriculum?: string | null;
  onClose: () => void;
  onContinue: (handover: ScheduleHandover) => void;
}

/**
 * Step one of a mid-year handover: pick the term the new teacher starts and
 * the time blocks that move with it. Step two is the schedule form, opened
 * pre-filled, where the new teacher is picked and the change is saved.
 */
export const ChangeFromDialog = ({
  open,
  schedule,
  siblings,
  shsCurriculum,
  onClose,
  onContinue,
}: ChangeFromDialogProps) => {
  const choices = useMemo(
    () => (schedule ? changeFromChoices(schedule, shsCurriculum) : []),
    [schedule, shsCurriculum],
  );
  const others = useMemo(
    () => (schedule ? handoverSiblings(schedule, siblings, shsCurriculum) : []),
    [schedule, siblings, shsCurriculum],
  );
  const [fromPeriod, setFromPeriod] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Each opening starts on the first possible term with every block ticked
  useEffect(() => {
    if (!open) return;
    setFromPeriod(choices.find((c) => c.possible)?.fromPeriod ?? null);
    setPicked(new Set(others.map((row) => String(row.id))));
  }, [open, choices, others]);

  if (!schedule) return null;

  const blockLabel = (row: SubjectSchedule) =>
    describeBlock({
      days_of_week: row.days_of_week,
      start_time: row.start_time.slice(0, 5),
      end_time: row.end_time.slice(0, 5),
    });

  const handleContinue = () => {
    if (fromPeriod == null) return;
    onContinue({
      sources: [schedule, ...others.filter((row) => picked.has(String(row.id)))],
      fromPeriod,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Change teacher from…</DialogTitle>
          <DialogDescription>
            The current blocks keep the earlier periods; on the next step you
            pick the teacher, room and times from the chosen period on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">New teacher starts</p>
            <div className="flex flex-col gap-2">
              {choices.map((c) => (
                <label
                  key={c.option.label}
                  className="flex items-center gap-2 text-sm"
                  title={
                    c.possible
                      ? undefined
                      : "This schedule does not cover anything from here on."
                  }
                >
                  <input
                    type="radio"
                    name="change-from-period"
                    className="h-4 w-4"
                    checked={fromPeriod === c.fromPeriod}
                    disabled={!c.possible}
                    onChange={() => setFromPeriod(c.fromPeriod)}
                  />
                  <span className={c.possible ? "" : "text-muted-foreground"}>
                    From {c.option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Time blocks that change</p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked disabled />
                {blockLabel(schedule)}
              </label>
              {others.map((row) => (
                <label key={row.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={picked.has(String(row.id))}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(String(row.id));
                      else next.delete(String(row.id));
                      setPicked(next);
                    }}
                  />
                  {blockLabel(row)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleContinue}
            disabled={fromPeriod == null}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
