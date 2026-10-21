/**
 * Help Desk (migration 218). The category list mirrors helpdesk_check_text()
 * and the tickets' CHECK; the staff roles mirror helpdesk_staff_ids(); the file
 * rules mirror the `helpdesk` bucket and helpdesk_attach_to_message(). Keep
 * each in sync with its SQL twin.
 */

export type HelpdeskStatus =
  | "open"
  | "in_progress"
  | "awaiting_reply"
  | "resolved"
  | "closed";

export type HelpdeskCategory =
  | "account_login"
  | "enrollment"
  | "grades"
  | "learner_records"
  | "reports"
  | "bug"
  | "suggestion"
  | "other";

export const HELPDESK_CATEGORIES: { value: HelpdeskCategory; label: string }[] = [
  { value: "account_login", label: "Account & Login" },
  { value: "enrollment", label: "Enrollment & Transfers" },
  { value: "grades", label: "Grades & Class Records" },
  { value: "learner_records", label: "Learner Records" },
  { value: "reports", label: "School Forms & Reports" },
  { value: "bug", label: "Something isn't working" },
  { value: "suggestion", label: "Suggestion" },
  { value: "other", label: "Other" },
];

export const helpdeskCategoryLabel = (value: string): string =>
  HELPDESK_CATEGORIES.find((c) => c.value === value)?.label ?? value;

// Classes pair a tinted background with a darker text of the same hue.
export const HELPDESK_STATUSES: Record<HelpdeskStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-blue-50 text-blue-800 border-blue-200" },
  in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-800 border-amber-200" },
  awaiting_reply: { label: "Awaiting Reply", className: "bg-sky-50 text-sky-800 border-sky-200" },
  resolved: { label: "Resolved", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  closed: { label: "Closed", className: "bg-gray-100 text-gray-700 border-gray-300" },
};

/** Roles that answer concerns, besides the people on the Help Desk staff list. */
export const HELPDESK_STAFF_TYPES = ["super admin", "division_admin"];

export const HELPDESK_FILE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};
export const HELPDESK_MAX_FILES = 3;
export const HELPDESK_MAX_FILE_BYTES = 5242880;
export const HELPDESK_BUCKET = "helpdesk";

export interface HelpdeskAttachment {
  path: string;
  name: string;
  size: number;
  type: string;
}

export interface HelpdeskTicket {
  id: number;
  reference_code: string;
  subject: string;
  category: HelpdeskCategory;
  status: HelpdeskStatus;
  source: "app" | "public";
  submitter_user_id: number | null;
  submitter_name: string;
  submitter_email: string;
  submitter_type: string | null;
  school_id: number | null;
  school?: { name: string } | null;
  submitter_contact: string | null;
  school_office: string | null;
  assigned_to: number | null;
  assignee?: { id: number; name: string } | null;
  created_at: string;
  last_message_at: string;
  last_message_by: "submitter" | "staff";
  resolved_at: string | null;
  needs_attention: boolean;
}

export interface HelpdeskMessage {
  id: number;
  ticket_id: number;
  author_user_id: number | null;
  author_kind: "submitter" | "staff";
  body: string;
  is_internal: boolean;
  attachments: HelpdeskAttachment[];
  created_at: string;
  author?: { name: string } | null;
}

export interface HelpdeskPublicThread {
  ticket: {
    reference_code: string;
    subject: string;
    category: HelpdeskCategory;
    status: HelpdeskStatus;
    created_at: string;
  };
  messages: {
    id: number;
    author_kind: "submitter" | "staff";
    author_name: string;
    body: string;
    created_at: string;
  }[];
}

export interface HelpdeskTicketFilters {
  keyword: string;
  /** '' = everything except Closed; 'all' = everything. */
  status: HelpdeskStatus | "" | "all";
  category: HelpdeskCategory | "";
  assigned: "anyone" | "me" | "unassigned";
  /** Only concerns waiting on a staff reply. */
  attention?: boolean;
  /** Set for My Help Desk: only this submitter's tickets. */
  submitterId?: number;
  /** The signed-in user's sms_users.id, for assigned = 'me'. */
  userId?: number;
}

export type HelpdeskViewKey =
  | "attention"
  | "mine"
  | "unassigned"
  | "active"
  | "resolved"
  | "closed"
  | "all";

export interface HelpdeskView {
  key: HelpdeskViewKey;
  label: string;
  /** What an empty list means in this view. */
  empty: string;
  filters: Pick<HelpdeskTicketFilters, "status" | "assigned" | "attention">;
}

/** The staff inbox views. `?view=` selects one; `active` is the default. */
export const HELPDESK_VIEWS: HelpdeskView[] = [
  { key: "attention", label: "Needs reply", empty: "Nobody is waiting on a reply.", filters: { status: "", assigned: "anyone", attention: true } },
  { key: "mine", label: "Assigned to me", empty: "Nothing is assigned to you.", filters: { status: "", assigned: "me" } },
  { key: "unassigned", label: "Unassigned", empty: "Every active concern has someone on it.", filters: { status: "", assigned: "unassigned" } },
  { key: "active", label: "All active", empty: "No active concerns.", filters: { status: "", assigned: "anyone" } },
  { key: "resolved", label: "Resolved", empty: "No resolved concerns.", filters: { status: "resolved", assigned: "anyone" } },
  { key: "closed", label: "Closed", empty: "No closed concerns.", filters: { status: "closed", assigned: "anyone" } },
  { key: "all", label: "All concerns", empty: "No concerns yet.", filters: { status: "all", assigned: "anyone" } },
];

export function helpdeskViewFor(key: string | null): HelpdeskView {
  return HELPDESK_VIEWS.find((v) => v.key === key) ?? HELPDESK_VIEWS[3];
}

/** How often open threads and counts refresh, in place of realtime. */
export const HELPDESK_POLL_MS = 30000;
