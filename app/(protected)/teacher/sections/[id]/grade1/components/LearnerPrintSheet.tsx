"use client";

import { LearnerSexGroupRow } from "@/components/LearnerSexGroupHeader";
import { Button } from "@/components/ui/button";
import { PACE_TERMS } from "@/lib/constants/pace";
import {
  generateGrade1ProgressCardPrint,
  generatePaceFormPrint,
} from "@/lib/pdf/generateGrade1Reports";
import { formatLrn } from "@/lib/utils";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import type { PaceTerm } from "@/types";
import { FileText, Loader2, Pencil, Printer } from "lucide-react";
import { Fragment, useState } from "react";
import toast from "react-hot-toast";
import type { WorkbookInfo, WorkbookLearner } from "../useGrade1Workbook";

/**
 * PACE - GRADE 1 and SF9 - GRADE 1: the two per-learner printouts, side by
 * side on one list. The workbook picks the learner with a dropdown on the
 * sheet; here every learner has a row showing how far their PACE form and
 * card narratives are, so an adviser can see who is ready to print.
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
  const groups = groupLearnersBySex(learners, (l) => l.gender);

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
      <p className="text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">Print Card</strong> prints the Learner&rsquo;s Progress Report
        Card (SF9) with the PACE pages behind it. <strong className="font-medium text-foreground">Print PACE</strong>{" "}
        prints the five PACE pages on their own.
      </p>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs">
            <tr>
              <th className="border-b px-3 py-2 text-left font-medium">Learners&rsquo; Names</th>
              <th className="border-b px-2 py-2 text-left font-medium">LRN</th>
              <th className="border-b px-2 py-2 text-left font-medium">PACE ratings</th>
              <th className="border-b px-2 py-2 text-left font-medium">Card narratives</th>
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
                      <td className="whitespace-nowrap border-b px-2 py-2 tabular-nums">{formatLrn(l.lrn)}</td>
                      <td className="border-b px-2 py-2">
                        <div className="flex items-center gap-2" title={`${done} of ${rateableTotal} competency ratings for the year`}>
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <span
                              className={`block h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-primary/70"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {done}/{rateableTotal}
                          </span>
                        </div>
                      </td>
                      <td className="border-b px-2 py-2">
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
                            disabled={printing !== null}
                          >
                            {busyIcon(l.id, "pace", FileText)}
                            Print PACE
                          </Button>
                          <Button size="sm" onClick={() => void print(l, "card")} disabled={printing !== null}>
                            {busyIcon(l.id, "card", Printer)}
                            Print Card
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
