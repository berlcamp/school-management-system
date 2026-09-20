"use client";

/**
 * The one notice used across the exam scanning workspace.
 *
 * Replaces the three near-identical local `Notice` / `Callout` helpers the
 * panels each grew, which had drifted apart on padding, icon and tone: the
 * answer-sheet tab warned in amber with a triangle, the scan tab warned in
 * amber with a triangle but different text sizes, and the failures list was a
 * bare red box with neither. A teacher reading four tabs of the same workspace
 * should not have to learn four ways of being told something.
 *
 * Tone carries meaning and nothing else picks the colour:
 *
 *   warn     something is not ready and the teacher must act;
 *   danger   something failed and work would be lost or wrong;
 *   info     a condition worth knowing that blocks nothing;
 *   success  a step is complete.
 *
 * `action` is for the recovery — a notice that names a problem and leaves the
 * teacher to find the fix themselves is half a notice.
 */

import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  OctagonAlert,
  type LucideIcon,
} from "lucide-react";

export type NoticeTone = "info" | "warn" | "danger" | "success";

const TONES: Record<
  NoticeTone,
  { box: string; icon: string; Icon: LucideIcon }
> = {
  info: {
    box: "border-sky-200 bg-sky-50 text-sky-950",
    icon: "text-sky-600",
    Icon: Info,
  },
  warn: {
    box: "border-amber-200 bg-amber-50 text-amber-950",
    icon: "text-amber-600",
    Icon: AlertTriangle,
  },
  danger: {
    box: "border-red-200 bg-red-50 text-red-950",
    icon: "text-red-600",
    Icon: OctagonAlert,
  },
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-950",
    icon: "text-emerald-600",
    Icon: CheckCircle2,
  },
};

interface ExamNoticeProps {
  tone?: NoticeTone;
  title?: string;
  children?: React.ReactNode;
  /** The recovery — a button, a link, whatever undoes the problem. */
  action?: React.ReactNode;
  className?: string;
}

export function ExamNotice({
  tone = "info",
  title,
  children,
  action,
  className,
}: ExamNoticeProps) {
  const { box, icon, Icon } = TONES[tone];

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border px-3.5 py-3",
        box,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", icon)} aria-hidden />
      <div className="min-w-[12rem] flex-1 space-y-1 text-sm leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[0.8125rem]">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center">{action}</div>}
    </div>
  );
}
