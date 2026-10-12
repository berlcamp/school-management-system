"use client";

import { LearnerSexGroupRow } from "@/components/LearnerSexGroupHeader";
import { Button } from "@/components/ui/button";
import { PACE_TERMS } from "@/lib/constants/pace";
import {
  generateGrade1ClassPrint,
  generateGrade1ProgressCardPrint,
  generatePaceFormPrint,
} from "@/lib/pdf/generateGrade1Reports";
import { formatLrn } from "@/lib/utils";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import type { PaceTerm } from "@/types";
import { FileText, Files, Loader2, Pencil, Printer } from "lucide-react";
import { Fragment, useState } from "react";
import toast from "react-hot-toast";
import type { WorkbookInfo, WorkbookLearner } from "../useGrade1Workbook";

/**
 * PACE - GRADE 1 and SF9 - GRADE 1: the two per-learner printouts, side by
 * side on one list. The workbook picks the learner with a dropdown on the
 * sheet; here every learner has a row showing how far their PACE form and
 * card narratives are, so an adviser can see who is ready to print. The whole
 * class can also go out as one print job.
 */
export function LearnerPrintSheet({
  sectionId,
  info,
  learners,
  ratedCount,
  rateableTotal,
  narrativeDone,
  onEdit,
}: {
  sectionId: string;
  info: WorkbookInfo;
  learners: WorkbookLearner[];
  /** learner id -> PACE ratings entered. */
  ratedCount: Record<string, number>;
  /** PACE cells per learner across the year. */
  rateableTotal: number;
  /** Is this learner's narrative written for this term? */
  narrativeDone: (studentId: string, term: PaceTerm) => boolean;
  onEdit: (learner: WorkbookLearner) => void;
}) {
  const [printing, setPrinting] = useState<string | null>(null);
  const [classProgress, setClassProgress] = useState<{ done: number; total: number } | null>(null);
  const groups = groupLearnersBySex(learners, (l) => l.gender);
  const busy = printing !== null;

  const printClass = async (kind: "pace" | "card") => {
    setPrinting(`class:${kind}`);
    setClassProgress({ done: 0, total: learners.length });
    try {
      await generateGrade1ClassPrint(
        { schoolId: info.schoolId, sectionId, schoolYear: info.schoolYear },
        learners.map((l) => l.id),
        kind === "pace" ? { card: false } : {},
        (done, total) => setClassProgress({ done, total }),
      );
    } catch (err) {
      console.error("Grade 1 class print error:", err);
      toast.error(kind === "pace" ? "Failed to generate the PACE forms" : "Failed to generate the progress cards");
    } finally {
      setPrinting(null);
      setClassProgress(null);
    }
  };

  const print = async (learner: WorkbookLearner, kind: "pace" | "card") => {
    setPrinting(`${learner.id}:${kind}`);
    const params = { schoolId: info.schoolId, studentId: learner.id, sectionId, schoolYear: info.schoolYear };
    try {
      if (kind === "pace") await generatePaceFormPrint(params);
      else await generateGrade1ProgressCardPrint(params);
    } catch (err) {
      console.error("Grade 1 print error:", err);
      toast.error(kind === "pace" ? "Failed to generate the PACE form" : "Failed to generate the progress card");
    } finally {
      setPrinting(null);
    }
  };

  const busyIcon = (id: string, kind: string, Icon: typeof Printer) =>
    printing === `${id}:${kind}` ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
    ) : (
      <Icon className="h-3.5 w-3.5" aria-hidden />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">Card</strong> prints the Learner&rsquo;s Progress Report Card
          (SF9) with the PACE pages behind it. <strong className="font-medium text-foreground">PACE</strong> prints the
          five PACE pages on their own.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {classProgress && (
            <span className="text-xs tabular-nums text-muted-foreground" role="status" aria-live="polite">
              Preparing {classProgress.done} of {classProgress.total}…
            </span>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void printClass("pace")}>
            {printing === "class:pace" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Files className="h-3.5 w-3.5" aria-hidden />}
            Print all PACE forms
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void printClass("card")}>
            {printing === "class:card" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Printer className="h-3.5 w-3.5" aria-hidden />}
            Print all cards
          </Button>
        </div>
      </div>
      <div className="max-h-[75dvh] min-h-0 flex-1 overflow-auto rounded-lg border bg-card lg:max-h-none">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs">
            <tr>
              <th className="border-b px-3 py-2 text-left font-medium">Learners&rsquo; Names</th>
              <th className="hidden border-b px-2 py-2 text-left font-medium md:table-cell">LRN</th>
              <th className="hidden border-b px-2 py-2 text-left font-medium sm:table-cell">PACE ratings</th>
              <th className="hidden border-b px-2 py-2 text-left font-medium sm:table-cell">Card narratives</th>
              <th className="border-b px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <LearnerSexGroupRow label={g.label} count={g.rows.length} colSpan={5} />
                {g.rows.map((l, i) => {
                  const done = ratedCount[l.id] ?? 0;
                  const pct = rateableTotal ? Math.round((done / rateableTotal) * 100) : 0;
                  return (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap border-b px-3 py-2">
                        <span className="mr-2 inline-block w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                        {l.name}
                      </td>
                      <td className="hidden whitespace-nowrap border-b px-2 py-2 tabular-nums md:table-cell">{formatLrn(l.lrn)}</td>
                      <td className="hidden border-b px-2 py-2 sm:table-cell">
                        <div className="flex items-center gap-2" title={`${done} of ${rateableTotal} competency ratings for the year`}>
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <span
                              className={`block h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-primary/70"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="w-9 text-xs tabular-nums text-muted-foreground">{pct}%</span>
                          <span className="sr-only">
                            {done} of {rateableTotal} ratings
                          </span>
                        </div>
                      </td>
                      <td className="hidden border-b px-2 py-2 sm:table-cell">
                        <div className="flex gap-1">
                          {PACE_TERMS.map((t) => {
                            const ok = narrativeDone(l.id, t);
                            return (
                              <span
                                key={t}
                                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                  ok ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"
                                }`}
                                title={ok ? `Term ${t} written` : `Term ${t} not yet written`}
                              >
                                T{t}
                                <span className="sr-only">{ok ? " written" : " not written"}</span>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="border-b px-3 py-1.5">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => onEdit(l)} aria-label={`Edit ${l.name}'s PACE form`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            <span className="hidden xl:inline">Edit</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void print(l, "pace")}
                            disabled={busy}
                            aria-label={`Print PACE for ${l.name}`}
                          >
                            {busyIcon(l.id, "pace", FileText)}
                            <span className="hidden sm:inline">PACE</span>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void print(l, "card")}
                            disabled={busy}
                            aria-label={`Print Card for ${l.name}`}
                          >
                            {busyIcon(l.id, "card", Printer)}
                            <span className="hidden sm:inline">Card</span>
                          </Button>
                        </div>
                      </td>
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
