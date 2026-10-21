import { HELPDESK_STATUSES, type HelpdeskStatus } from "@/lib/constants/helpdesk";
import { CircleCheck, CircleDot, Loader, Lock, Reply } from "lucide-react";

const icons = {
  open: CircleDot,
  in_progress: Loader,
  awaiting_reply: Reply,
  resolved: CircleCheck,
  closed: Lock,
};

/** Status as icon + label, never colour alone. */
export function StatusBadge({ status }: { status: HelpdeskStatus }) {
  const Icon = icons[status];
  const { label, className } = HELPDESK_STATUSES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
