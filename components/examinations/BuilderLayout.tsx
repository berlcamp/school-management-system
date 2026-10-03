"use client";

/**
 * Layout pieces shared by the TOS and Exam builder modals: numbered form
 * sections, the live summary counters in the sticky header, and the switch
 * cards used for Active / sharing. Presentation only — no state.
 */

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

export function RequiredMark() {
  return (
    <span className="text-red-500" aria-hidden>
      *
    </span>
  );
}

export function FormSection({
  step,
  title,
  description,
  action,
  children,
}: {
  step: number;
  /** Right-aligned header content, e.g. an add button. */
  action?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-background p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-6">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function SummaryStat({
  label,
  value,
  progress,
  tone,
  note,
}: {
  label: string;
  value: string;
  progress: number;
  tone: "ok" | "warn";
  note: string;
}) {
  const over = progress > 1;
  return (
    <div className="min-w-0 rounded-md border bg-muted/30 px-2.5 py-2 sm:px-3">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <span className="truncate text-[11px] text-muted-foreground sm:text-xs">
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        aria-hidden
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            tone === "ok"
              ? "bg-emerald-500"
              : over
                ? "bg-red-500"
                : "bg-amber-500",
          )}
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
      <p
        className={cn(
          "mt-1 hidden items-center gap-1 text-[11px] sm:flex",
          tone === "ok" ? "text-emerald-700" : "text-amber-700",
        )}
      >
        {tone === "ok" && <CheckCircle2 className="h-3 w-3" aria-hidden />}
        {note}
      </p>
    </div>
  );
}

export function ToggleCard({
  id,
  checked,
  onCheckedChange,
  disabled,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div>
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
