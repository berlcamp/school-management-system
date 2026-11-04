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
          "app__chip app__chip_warning cursor-help",
          className,
        )}
      >
        Temporary
      </span>
    </TooltipTrigger>
    <TooltipContent>No teacher specified</TooltipContent>
  </Tooltip>
);
