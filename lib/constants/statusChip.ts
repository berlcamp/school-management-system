import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileEdit,
  GraduationCap,
  LogOut,
  RefreshCw,
  Repeat,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  UserX,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type StatusTone =
  | "success"
  | "accent"
  | "warning"
  | "danger"
  | "neutral"
  | "info";

export type StatusMeta = { label: string; tone: StatusTone; icon: LucideIcon };

/** How a status looks, keyed by the value stored in the database. */
export const STATUS_META: Record<string, StatusMeta> = {
  // Enrollment lifecycle
  active: { label: "Active", tone: "success", icon: CheckCircle2 },
  completed: { label: "Completed", tone: "accent", icon: CheckCircle2 },
  promoted: { label: "Promoted", tone: "accent", icon: TrendingUp },
  graduated: { label: "Graduated", tone: "accent", icon: GraduationCap },
  retained: { label: "Retained", tone: "warning", icon: Repeat },
  transferred_out: { label: "Transferred Out", tone: "warning", icon: LogOut },
  dropped: { label: "Dropped", tone: "danger", icon: UserX },
  pending_transfer: { label: "Pending Transfer", tone: "warning", icon: RefreshCw },
  pending_review: { label: "Pending Review", tone: "info", icon: Search },
  not_enrolled: { label: "Not Enrolled", tone: "neutral", icon: Ban },

  // Workflows: requests, exam review, supervision slots
  draft: { label: "Draft", tone: "neutral", icon: FileEdit },
  submitted: { label: "Submitted", tone: "warning", icon: Send },
  under_review: { label: "Under Review", tone: "accent", icon: Search },
  pending: { label: "Pending", tone: "warning", icon: Clock },
  proposed: { label: "Proposed", tone: "warning", icon: CalendarClock },
  approved: { label: "Approved", tone: "success", icon: ShieldCheck },
  rejected: { label: "Rejected", tone: "danger", icon: XCircle },
  cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
  inactive: { label: "Inactive", tone: "neutral", icon: Ban },
  overdue: { label: "Overdue", tone: "danger", icon: AlertTriangle },
};
