"use client";

import { Button } from "@/components/ui/button";
import { notifyHelpdeskChanged, useHelpdeskPoll } from "@/hooks/useHelpdesk";
import {
  HELPDESK_STATUSES,
  helpdeskCategoryLabel,
  type HelpdeskMessage,
  type HelpdeskStatus,
  type HelpdeskTicket,
} from "@/lib/constants/helpdesk";
import { USER_TYPE_LABELS } from "@/lib/constants/userTypes";
import {
  fetchHelpdeskMessages,
  fetchHelpdeskStaff,
  fetchHelpdeskTicket,
  updateHelpdeskTicket,
} from "@/lib/helpdesk/api";
import { useAppSelector } from "@/lib/redux/hook";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Globe,
  Loader2,
  Mail,
  MonitorSmartphone,
  Phone,
  School,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Composer } from "./Composer";
import { Initials } from "./Initials";
import { StatusBadge } from "./StatusBadge";
import { TicketThread } from "./TicketThread";

interface Props {
  ticketId: number;
  mode: "staff" | "submitter";
  /** Shown below lg, where the list and the thread don't fit side by side. */
  onBack?: () => void;
  /** Status or assignee changed — the list should refetch. */
  onChanged: () => void;
}

const allStatuses = Object.keys(HELPDESK_STATUSES) as HelpdeskStatus[];
const controlClass =
  "h-9 rounded-md border bg-white px-2 text-sm text-gray-900 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A ticket's messages, refreshed on a timer and when anyone here posts. */
function useTicketMessages(ticketId: number) {
  const [messages, setMessages] = useState<HelpdeskMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Drops a response that arrives after the user switched tickets.
  const current = useRef(ticketId);
  useEffect(() => {
    current.current = ticketId;
  }, [ticketId]);

  const refetch = useCallback(async () => {
    const result = await fetchHelpdeskMessages(ticketId);
    if (current.current !== ticketId) return;
    if (result.ok) {
      setMessages(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setLoading(true);
    void refetch();
  }, [refetch]);

  const poll = useCallback(() => void refetch(), [refetch]);
  useHelpdeskPoll(poll, true);

  return { messages, loading, error, refetch: poll };
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded px-1 font-mono text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Copy reference code ${code}`}
    >
      {code}
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
      )}
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

/** The sender and the concern's history. Side panel on wide screens, a disclosure otherwise. */
function SenderDetails({ ticket }: { ticket: HelpdeskTicket }) {
  const row = "flex items-start gap-2 text-sm text-gray-800";
  const icon = "mt-0.5 h-4 w-4 shrink-0 text-gray-400";
  return (
    <div className="space-y-5">
      <section aria-label="Sender" className="space-y-3">
        <div className="flex items-center gap-3">
          <Initials name={ticket.submitter_name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">{ticket.submitter_name}</div>
            <div className="text-xs text-gray-600">
              {ticket.source === "public"
                ? "Sent from the public form"
                : `${USER_TYPE_LABELS[ticket.submitter_type ?? ""] ?? ticket.submitter_type ?? "User"} (signed in)`}
            </div>
          </div>
        </div>
        <div className={row}>
          <Mail className={icon} aria-hidden="true" />
          <a href={`mailto:${ticket.submitter_email}`} className="break-all text-blue-700 hover:underline">
            {ticket.submitter_email}
          </a>
        </div>
        {ticket.submitter_contact && (
          <div className={row}>
            <Phone className={icon} aria-hidden="true" />
            <a
              href={`tel:${ticket.submitter_contact.replace(/[^\d+]/g, "")}`}
              className="text-blue-700 hover:underline"
            >
              {ticket.submitter_contact}
            </a>
          </div>
        )}
        {ticket.school?.name && (
          <div className={row}>
            <Building2 className={icon} aria-hidden="true" />
            <span>{ticket.school.name}</span>
          </div>
        )}
        {ticket.school_office && (
          <div className={row}>
            <School className={icon} aria-hidden="true" />
            <span>{ticket.school_office}</span>
          </div>
        )}
      </section>

      <section aria-label="History">
        <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">History</h3>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-600">Opened</dt>
            <dd className="text-right text-gray-900">{format(new Date(ticket.created_at), "MMM d, yyyy h:mm a")}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-600">Last message</dt>
            <dd className="text-right text-gray-900">
              {ticket.last_message_by === "staff" ? "Staff" : "Sender"},{" "}
              {formatDistanceToNowStrict(new Date(ticket.last_message_at), { addSuffix: true })}
            </dd>
          </div>
          {ticket.resolved_at && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-600">Resolved</dt>
              <dd className="text-right text-gray-900">{format(new Date(ticket.resolved_at), "MMM d, yyyy")}</dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}

export function TicketDetail({ ticketId, mode, onBack, onChanged }: Props) {
  const myId = useAppSelector((state) => state.user.user?.system_user_id);
  const [ticket, setTicket] = useState<HelpdeskTicket | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSender, setShowSender] = useState(false);
  const { messages, loading, error, refetch } = useTicketMessages(ticketId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadTicket = useCallback(async () => {
    const result = await fetchHelpdeskTicket(ticketId);
    if (result.ok) {
      setTicket(result.data);
      setNotFound(result.data === null);
      setTicketError(null);
    } else setTicketError(result.error);
  }, [ticketId]);

  useEffect(() => {
    setTicket(null);
    setNotFound(false);
    void loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    if (mode !== "staff") return;
    void fetchHelpdeskStaff().then((r) => {
      if (r.ok) setStaff(r.data);
    });
  }, [mode]);

  // Open on the newest message, and follow new ones as they arrive.
  const loaded = ticket !== null;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading, loaded]);

  const update = async (change: { status?: HelpdeskStatus; assignedTo?: number; unassign?: boolean }) => {
    setSaving(true);
    const result = await updateHelpdeskTicket({ ticketId, ...change });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (change.status === "resolved") toast.success("Marked as resolved");
    await loadTicket();
    notifyHelpdeskChanged();
    onChanged();
  };

  const backButton = onBack && (
    <button
      type="button"
      onClick={onBack}
      className="mb-2 inline-flex h-9 items-center gap-1 rounded-md pr-2 text-sm text-gray-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All concerns
    </button>
  );

  if (ticketError) {
    return (
      <div className="space-y-2 p-4 text-sm text-red-700" role="alert">
        <p>{ticketError}</p>
        <Button variant="outline" size="sm" onClick={() => void loadTicket()}>
          Try again
        </Button>
      </div>
    );
  }
  if (notFound) {
    // Deleted, or a link to a concern this user can't see (RLS returns no row).
    return (
      <div className="p-6">
        {backButton}
        <p className="text-sm text-gray-700">We couldn&apos;t find this concern.</p>
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-600" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading concern…
      </div>
    );
  }

  const isOwnTicket = ticket.submitter_user_id === myId;
  const staffView = mode === "staff" && !isOwnTicket;
  // Someone who has since lost staff access is no longer in the list; keep
  // showing them rather than falling back to "Unassigned".
  const assigneeMissing = ticket.assigned_to !== null && !staff.some((s) => s.id === ticket.assigned_to);
  const canResolve = ticket.status !== "resolved" && ticket.status !== "closed";

  return (
    // On a short screen the header, thread and reply box may not all fit: the
    // thread shrinks first, then the pane scrolls, so the reply box is never cut off.
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="shrink-0 border-b px-4 py-3">
        {backButton}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug text-gray-900 [text-wrap:balance]">{ticket.subject}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
              <CopyCode code={ticket.reference_code} />
              <span aria-hidden="true">·</span>
              <span>{helpdeskCategoryLabel(ticket.category)}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                {ticket.source === "public" ? (
                  <>
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" /> Public form
                  </>
                ) : (
                  <>
                    <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" /> In the app
                  </>
                )}
              </span>
              {staffView && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{ticket.submitter_name}</span>
                </>
              )}
            </div>
          </div>
          {!staffView && <StatusBadge status={ticket.status} />}
        </div>

        {staffView && (
          <div className="mt-3 flex flex-wrap items-end gap-2" role="group" aria-label="Manage concern">
            <label className="flex flex-col gap-0.5 text-xs font-medium text-gray-600">
              Status
              <select
                value={ticket.status}
                disabled={saving}
                onChange={(e) => void update({ status: e.target.value as HelpdeskStatus })}
                className={controlClass}
              >
                {allStatuses.map((s) => (
                  <option key={s} value={s}>
                    {HELPDESK_STATUSES[s].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs font-medium text-gray-600">
              Assigned to
              <select
                value={ticket.assigned_to ?? ""}
                disabled={saving}
                onChange={(e) =>
                  void update(e.target.value === "" ? { unassign: true } : { assignedTo: Number(e.target.value) })
                }
                className={`${controlClass} max-w-[14rem]`}
              >
                <option value="">Unassigned</option>
                {assigneeMissing && ticket.assigned_to && (
                  <option value={ticket.assigned_to}>{ticket.assignee?.name ?? "Current assignee"}</option>
                )}
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {myId && ticket.assigned_to !== myId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void update({ assignedTo: myId })}
              >
                <UserRound className="h-4 w-4" aria-hidden="true" /> Assign to me
              </Button>
            )}
            {canResolve && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void update({ status: "resolved" })}
                className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              >
                <CircleCheck className="h-4 w-4" aria-hidden="true" /> Mark resolved
              </Button>
            )}
            {/* Below 1400px the sender panel isn't beside the thread; a toggle in this row keeps the header short. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={showSender}
              aria-controls={`sender-${ticket.id}`}
              onClick={() => setShowSender((v) => !v)}
              className="min-[1400px]:hidden"
            >
              Sender details
              <ChevronDown
                className={`h-4 w-4 transition-transform motion-reduce:transition-none ${showSender ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </Button>
            {saving && <Loader2 className="mb-2.5 h-4 w-4 animate-spin text-gray-500" aria-label="Saving" />}
          </div>
        )}

        {staffView && showSender && (
          <div id={`sender-${ticket.id}`} className="mt-3 rounded-md border bg-gray-50 px-3 py-3 min-[1400px]:hidden">
            <SenderDetails ticket={ticket} />
          </div>
        )}
      </header>

      <div className="flex min-h-[17rem] flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-[4rem] flex-1 overflow-y-auto bg-gray-50 p-4">
            {error ? (
              <div className="space-y-2 text-sm text-red-700" role="alert">
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={refetch}>
                  Try again
                </Button>
              </div>
            ) : loading ? (
              <p className="text-sm text-gray-600" aria-busy="true">
                Loading messages…
              </p>
            ) : (
              <TicketThread
                messages={messages}
                viewer={staffView ? "staff" : "submitter"}
                submitterName={ticket.submitter_name}
              />
            )}
          </div>

          <div className="shrink-0 border-t bg-white p-3">
            <Composer
              ticket={ticket}
              mode={staffView ? "staff" : "submitter"}
              onSent={() => {
                void loadTicket();
                refetch();
                notifyHelpdeskChanged();
                onChanged();
              }}
            />
          </div>
        </div>

        {staffView && (
          <aside
            aria-label="Sender details"
            className="hidden w-72 shrink-0 overflow-y-auto border-l bg-white p-4 min-[1400px]:block"
          >
            <SenderDetails ticket={ticket} />
          </aside>
        )}
      </div>
    </div>
  );
}
