// Group headings for learner lists split MALE / FEMALE.
// Grouping itself lives in lib/utils/learnerSex.ts; these only render it.

import { cn } from "@/lib/utils";

interface Props {
  label: string;
  count?: number;
  className?: string;
}

/** A full-width `<tr>` heading a MALE / FEMALE block inside a table body. */
export function LearnerSexGroupRow({
  label,
  count,
  colSpan,
  className,
}: Props & { colSpan: number }) {
  return (
    <tr className={cn("bg-muted/40 border-b", className)}>
      <td
        colSpan={colSpan}
        className="px-3 py-1.5 text-xs font-semibold tracking-wide"
      >
        {label}
        {count !== undefined && ` (${count})`}
      </td>
    </tr>
  );
}

/** The same heading for learner lists that are not tables (checklists, cards). */
export function LearnerSexGroupHeading({ label, count, className }: Props) {
  return (
    <div
      className={cn(
        "bg-muted/40 px-3 py-1.5 text-xs font-semibold tracking-wide rounded",
        className,
      )}
    >
      {label}
      {count !== undefined && ` (${count})`}
    </div>
  );
}
