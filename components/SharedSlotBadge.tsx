"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SharedSlotBadgeProps {
  className?: string;
}

/**
 * Marks a subject schedule saved despite a detected room / teacher / section
 * conflict (conflict_override = true) — a combined class, a shared hall, and
 * the like. See migration 124.
 */
export const SharedSlotBadge = ({ className }: SharedSlotBadgeProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        className={cn(
          "inline-flex cursor-help items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800",
          className,
        )}
      >
        Shared slot
      </span>
    </TooltipTrigger>
    <TooltipContent>
      Saved with a known conflict — this room, teacher or section is
      intentionally double-booked at this time
    </TooltipContent>
  </Tooltip>
);
