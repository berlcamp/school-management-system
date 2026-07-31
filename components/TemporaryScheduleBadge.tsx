"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TemporaryScheduleBadgeProps {
  className?: string;
}

/**
 * Marks a subject schedule that has no teacher assigned yet (teacher_id IS NULL).
 * Such schedules bypass conflict detection entirely — see migration 117.
 */
export const TemporaryScheduleBadge = ({
  className,
}: TemporaryScheduleBadgeProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        className={cn(
          "inline-flex cursor-help items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
          className,
        )}
      >
        Temporary
      </span>
    </TooltipTrigger>
    <TooltipContent>No teacher specified</TooltipContent>
  </Tooltip>
);
