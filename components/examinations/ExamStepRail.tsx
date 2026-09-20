"use client";

/**
 * The four steps of a scanned examination, as a rail rather than four tabs.
 *
 * Answer key → answer sheets → scan → results is a pipeline, not a set of
 * views: each step needs the one before it, and a teacher arriving at this
 * workspace with a stack of paper on the desk is somewhere along it. Flat tabs
 * told them nothing — which step is finished, which is waiting on them, and
 * which cannot be started yet were all discoverable only by clicking each tab
 * and reading the warning inside it.
 *
 * So every step carries its own state on the rail:
 *
 *   done       a tick — nothing more is needed here;
 *   attention  an exclamation — the teacher has something to fix or finish;
 *   waiting    the step number — not started, or blocked by an earlier step.
 *
 * The status line is the whole point of the rail and is written as the specific
 * fact ("38 of 50 keyed", "6 sheets need a look"), never as a label like
 * "incomplete". A teacher should be able to leave this page, come back on
 * Friday, and know where they stopped without opening anything.
 */

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, type LucideIcon } from "lucide-react";

export type StepTone = "done" | "attention" | "waiting";

export interface ExamStep {
  value: string;
  label: string;
  icon: LucideIcon;
  tone: StepTone;
  /** The specific fact about this step, e.g. "38 of 50 keyed". */
  status: string;
}

const MARKER: Record<StepTone, string> = {
  done: "border-emerald-600 bg-emerald-600 text-white",
  attention: "border-amber-500 bg-amber-500 text-white",
  waiting: "border-border bg-background text-muted-foreground",
};

const STATUS_TEXT: Record<StepTone, string> = {
  done: "text-emerald-700",
  attention: "text-amber-700",
  waiting: "text-muted-foreground",
};

export function ExamStepRail({ steps }: { steps: ExamStep[] }) {
  return (
    <TabsList
      className={cn(
        "grid h-auto w-full gap-1 rounded-lg bg-muted p-1",
        // One column on a phone: at two, the label and the status line both
        // truncate, and the status line is the entire reason the rail exists.
        steps.length > 2
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          : "grid-cols-1 sm:grid-cols-2",
      )}
    >
      {steps.map((step, index) => (
        <TabsTrigger
          key={step.value}
          value={step.value}
          className={cn(
            "h-auto min-w-0 flex-col items-start gap-1 rounded-md px-3 py-2.5 text-left",
            "data-[state=active]:bg-background data-[state=active]:shadow-sm",
          )}
        >
          <span className="flex w-full min-w-0 items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums transition-colors",
                MARKER[step.tone],
              )}
            >
              {step.tone === "done" ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : step.tone === "attention" ? (
                <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                index + 1
              )}
            </span>
            <step.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{step.label}</span>
          </span>
          <span
            className={cn(
              "w-full truncate pl-7 text-xs font-normal",
              STATUS_TEXT[step.tone],
            )}
          >
            {step.status}
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
