"use client";

/**
 * Print pre-printed OMR answer sheets for a section.
 *
 * One page per learner, with that learner's id already shaded into the ID
 * block — so the stack that comes out of the printer is the class list in
 * order, and no learner ever writes an identifying number. A sheet handed to
 * the wrong learner is the one failure mode this cannot prevent, which is why
 * the name is printed large at the top.
 *
 * The section and its roster are chosen once for the whole workspace and
 * arrive as props; this panel used to carry its own copy of the picker and its
 * own roster query against the same shared state.
 */

import { LearnerSexGroupHeading } from "@/components/LearnerSexGroupHeader";
import { Button } from "@/components/ui/button";
import type { RosterLearner } from "@/hooks/useExamRoster";
import { MAX_ITEMS } from "@/lib/omr/layout";
import type { AnswerKeyItem } from "@/lib/omr/score";
import { generateAnswerSheets } from "@/lib/pdf/generateAnswerSheets";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import { FileDown, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { ExamNotice } from "./ExamNotice";

interface AnswerSheetPanelProps {
  answerKey: AnswerKeyItem[];
  schoolName: string;
  examTitle: string;
  subjectName: string;
  versionLabel: string;
  schoolYear: string;
  sectionId: string;
  sectionName: string;
  learners: RosterLearner[];
  rosterLoading: boolean;
  onGoToStep: (step: string) => void;
}

export function AnswerSheetPanel({
  answerKey,
  schoolName,
  examTitle,
  subjectName,
  versionLabel,
  schoolYear,
  sectionId,
  sectionName,
  learners,
  rosterLoading,
  onGoToStep,
}: AnswerSheetPanelProps) {
  const [generating, setGenerating] = useState(false);

  const keyed = answerKey.filter((i) => i.correctAnswer).length;
  const unkeyed = answerKey.length - keyed;
  const tooLong = answerKey.length > MAX_ITEMS;
  const ready =
    !generating &&
    !rosterLoading &&
    !tooLong &&
    sectionId !== "" &&
    answerKey.length > 0 &&
    learners.length > 0;

  const handleGenerate = () => {
    if (answerKey.length === 0) {
      toast.error("Set the answer key first — it decides the sheet layout.");
      return;
    }
    if (learners.length === 0) {
      toast.error("No learners enrolled in this section for this school year.");
      return;
    }

    setGenerating(true);
    try {
      generateAnswerSheets({
        schoolName,
        examTitle,
        subjectName,
        sectionName,
        schoolYear,
        versionLabel,
        answerKey,
        learners: learners.map((l) => ({
          studentId: l.id,
          name: l.name,
          lrn: l.lrn,
          // The generator prints MALE pages first, then FEMALE.
          gender: l.gender,
        })),
      });
      toast.success(`${learners.length} answer sheets ready to print.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
    }
  };

  if (answerKey.length === 0) {
    return (
      <ExamNotice
        tone="warn"
        title="Set the answer key first"
        action={
          <Button size="sm" variant="outline" onClick={() => onGoToStep("key")}>
            Go to the answer key
          </Button>
        }
      >
        The key decides how many items each sheet carries and how many circles
        each item is printed with, so the sheets cannot be laid out without it.
      </ExamNotice>
    );
  }

  if (tooLong) {
    return (
      <ExamNotice tone="danger" title="This exam is too long for one sheet">
        It has {answerKey.length} items and a sheet holds {MAX_ITEMS}. Split it
        into two exam versions and scan them separately.
      </ExamNotice>
    );
  }

  if (!sectionId) {
    return (
      <div className="app__empty_state">
        <div className="app__empty_state_icon">
          <Printer className="mx-auto h-10 w-10" />
        </div>
        <p className="app__empty_state_title">Choose a section first</p>
        <p className="app__empty_state_description">
          Every sheet is printed for one named learner, so the class list has to
          be picked before anything can be generated. Use the Section box above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border bg-card p-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {rosterLoading
              ? "Loading the class list…"
              : `${learners.length} sheet${learners.length === 1 ? "" : "s"} for ${sectionName || "this section"}`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {answerKey.length} items per sheet · one A4 page each · printed in
            class-list order
          </p>
        </div>

        <Button
          variant="green"
          size="sm"
          className="h-9"
          disabled={!ready}
          onClick={handleGenerate}
        >
          {generating ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-1.5 h-4 w-4" />
          )}
          Download answer sheets (PDF)
        </Button>
      </div>

      {unkeyed > 0 && (
        <ExamNotice tone="info">
          {unkeyed} of {answerKey.length} items have no answer keyed. They are
          still printed and learners can still shade them, but they are not
          machine-scored until you key them.
        </ExamNotice>
      )}

      {!rosterLoading && learners.length === 0 && (
        <ExamNotice tone="warn" title="This section has no learners">
          Nobody is enrolled in {sectionName || "this section"} for S.Y.{" "}
          {schoolYear}, so there is nobody to print a sheet for. Check the school
          year in the box above, or the section&apos;s enrolment.
        </ExamNotice>
      )}

      {learners.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3.5 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Who gets a sheet
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {learners.length} {learners.length === 1 ? "learner" : "learners"}
            </span>
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto">
            {/* Grouped MALE then FEMALE — the order the sheets print in. */}
            {groupLearnersBySex(learners, (l) => l.gender)
              .filter((g) => g.rows.length > 0)
              .flatMap((g) => [
                <li key={`sex-${g.key}`}>
                  <LearnerSexGroupHeading
                    label={g.label}
                    count={g.rows.length}
                    className="rounded-none"
                  />
                </li>,
                ...g.rows.map((learner, index) => (
                  <li
                    key={learner.id}
                    className="flex items-center gap-3 px-3.5 py-2 text-sm"
                  >
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {learner.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {learner.lrn ?? "—"}
                    </span>
                  </li>
                )),
              ])}
          </ul>
        </div>
      )}

      <div className="rounded-lg border bg-card p-3.5">
        <p className="mb-1.5 text-sm font-semibold">
          Before you photocopy or print
        </p>
        <ul className="space-y-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
          <li className="flex gap-2">
            <span aria-hidden className="text-foreground">
              —
            </span>
            <span>
              Print at 100% / actual size on A4. &ldquo;Fit to page&rdquo; is
              fine — the corner squares let the scanner correct for scale — but a
              cropped edge is not.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-foreground">
              —
            </span>
            <span>
              <span className="font-medium text-foreground">
                Every sheet is personalised.
              </span>{" "}
              Do not photocopy one learner&apos;s sheet for the class: the copies
              would all score to that learner.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-foreground">
              —
            </span>
            <span>
              Keep the four black corner squares clean. No staples, folds or
              handwriting over them.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
