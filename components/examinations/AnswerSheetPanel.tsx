"use client";

/**
 * Print pre-printed OMR answer sheets for a section.
 *
 * One page per learner, with that learner's id already shaded into the ID
 * block — so the stack that comes out of the printer is the class list in
 * order, and no learner ever writes an identifying number. A sheet handed to
 * the wrong learner is the one failure mode this cannot prevent, which is why
 * the name is printed large at the top.
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSectionRoster, type RosterSection } from "@/hooks/useExamRoster";
import { MAX_ITEMS } from "@/lib/omr/layout";
import type { AnswerKeyItem } from "@/lib/omr/score";
import { generateAnswerSheets } from "@/lib/pdf/generateAnswerSheets";
import { AlertTriangle, FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

interface AnswerSheetPanelProps {
  answerKey: AnswerKeyItem[];
  schoolName: string;
  examTitle: string;
  subjectName: string;
  versionLabel: string;
  schoolYear: string;
  sections: RosterSection[];
  sectionId: string;
  onSectionChange: (id: string) => void;
  sectionsLoading: boolean;
}

export function AnswerSheetPanel({
  answerKey,
  schoolName,
  examTitle,
  subjectName,
  versionLabel,
  schoolYear,
  sections,
  sectionId,
  onSectionChange,
  sectionsLoading,
}: AnswerSheetPanelProps) {
  const { learners, loading } = useSectionRoster(sectionId, schoolYear);
  const [generating, setGenerating] = useState(false);

  const section = sections.find((s) => s.id === sectionId);
  const keyed = answerKey.filter((i) => i.correctAnswer).length;
  const tooLong = answerKey.length > MAX_ITEMS;

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
        sectionName: section?.name ?? "",
        schoolYear,
        versionLabel,
        answerKey,
        learners: learners.map((l) => ({
          studentId: l.id,
          name: l.name,
          lrn: l.lrn,
        })),
      });
      toast.success(`${learners.length} answer sheets ready to print.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label className="text-xs">Section</Label>
          <Select
            value={sectionId}
            onValueChange={onSectionChange}
            disabled={sectionsLoading}
          >
            <SelectTrigger className="h-9 w-60" aria-label="Section">
              <SelectValue
                placeholder={
                  sectionsLoading ? "Loading sections…" : "Select a section"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="green"
          size="sm"
          className="h-9"
          disabled={
            generating || loading || !sectionId || answerKey.length === 0 || tooLong
          }
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

      {answerKey.length === 0 && (
        <Notice tone="warn">
          There is no answer key for this exam yet. The key decides how many
          items and how many circles each sheet gets, so set it first on the
          Answer Key tab.
        </Notice>
      )}

      {tooLong && (
        <Notice tone="warn">
          This exam has {answerKey.length} items and a sheet holds {MAX_ITEMS}.
          Split it into two exam versions and scan them separately.
        </Notice>
      )}

      {answerKey.length > 0 && keyed < answerKey.length && (
        <Notice tone="info">
          {answerKey.length - keyed} of {answerKey.length} items have no answer
          keyed. They will still be printed and shaded by learners, but they are
          not machine-scored until you key them.
        </Notice>
      )}

      {sectionId && (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">
              {loading
                ? "Loading learners…"
                : `${learners.length} learners in ${section?.name ?? "this section"}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {answerKey.length} items per sheet · 1 page each
            </span>
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto text-sm">
            {learners.map((learner, index) => (
              <li
                key={learner.id}
                className="flex items-center gap-3 px-3 py-1.5"
              >
                <span className="w-6 text-right text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <span className="flex-1">{learner.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {learner.lrn ?? "—"}
                </span>
              </li>
            ))}
            {!loading && learners.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                No learners enrolled in this section for S.Y. {schoolYear}.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">
          Before you photocopy or print
        </p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>
            Print at 100% / actual size on A4. &ldquo;Fit to page&rdquo; is fine
            — the corner squares let the scanner correct for scale — but a
            cropped edge is not.
          </li>
          <li>
            Every sheet is personalised. Do not photocopy one learner&apos;s
            sheet for the class: the copies would all score to that learner.
          </li>
          <li>
            Keep the four black corner squares clean. No staples, folds or
            handwriting over them.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "warn" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
        tone === "warn"
          ? "bg-amber-50 text-amber-900"
          : "bg-blue-50 text-blue-900"
      }`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
