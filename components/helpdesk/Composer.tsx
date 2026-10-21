"use client";

import { Button } from "@/components/ui/button";
import {
  HELPDESK_STATUSES,
  type HelpdeskStatus,
  type HelpdeskTicket,
} from "@/lib/constants/helpdesk";
import { postHelpdeskMessage, uploadHelpdeskFiles } from "@/lib/helpdesk/api";
import { Loader2, Lock, Send } from "lucide-react";
import { useId, useState } from "react";
import toast from "react-hot-toast";
import { FilePicker } from "./FilePicker";

interface Props {
  ticket: HelpdeskTicket;
  mode: "staff" | "submitter";
  onSent: (status: HelpdeskStatus) => void;
}

const sendStatuses: HelpdeskStatus[] = ["awaiting_reply", "in_progress", "resolved"];

export function Composer({ ticket, mode, onSent }: Props) {
  const fieldId = useId();
  const errorId = useId();
  const [tab, setTab] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sendStatus, setSendStatus] = useState<HelpdeskStatus>("awaiting_reply");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNote = mode === "staff" && tab === "note";

  // Internal notes take no files: their folder is readable by the submitter.
  const selectTab = (next: "reply" | "note") => {
    setTab(next);
    if (next === "note") setFiles([]);
  };

  if (ticket.status === "closed") {
    return (
      <p className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
        This concern is closed.
        {mode === "staff"
          ? " Reopen it from the status menu to reply."
          : " Send a new concern if you still need help."}
      </p>
    );
  }

  const send = async () => {
    const text = body.trim();
    if (text.length === 0) {
      setError("Write a message first.");
      return;
    }
    setSending(true);
    setError(null);

    const result = await postHelpdeskMessage({
      ticketId: ticket.id,
      body: text,
      isInternal: isNote,
      setStatus: mode === "staff" && !isNote ? sendStatus : null,
    });
    if (!result.ok) {
      setSending(false);
      setError(result.error);
      // A closed ticket refreshes the parent so the closed banner shows.
      if (result.error === "This concern was closed.") onSent("closed");
      return;
    }

    let warned = false;
    if (!isNote && files.length > 0) {
      const upload = await uploadHelpdeskFiles(ticket.id, result.data.message_id, files);
      if (!upload.ok) {
        warned = true;
        toast.error(`Saved, but the files could not be attached: ${upload.error}`);
      } else if (upload.data.failed.length > 0) {
        warned = true;
        toast.error(
          `Saved, but ${upload.data.failed.length} file(s) failed to upload: ${upload.data.failed.join(", ")}`,
        );
      }
    }

    if (!warned) toast.success(isNote ? "Note added" : "Reply sent");
    setBody("");
    setFiles([]);
    setSending(false);
    onSent(result.data.status);
  };

  return (
    <div className={`rounded-lg border ${isNote ? "border-amber-300 bg-amber-50" : "bg-white"}`}>
      {mode === "staff" && (
        <div role="tablist" aria-label="Message type" className="flex border-b">
          {(["reply", "note"] as const).map((t) => (
            <button
              key={t}
              id={`${fieldId}-tab-${t}`}
              type="button"
              role="tab"
              aria-selected={tab === t}
              aria-controls={`${fieldId}-panel`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => selectTab(t)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const next = t === "reply" ? "note" : "reply";
                selectTab(next);
                document.getElementById(`${fieldId}-tab-${next}`)?.focus();
              }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                tab === t
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t === "note" && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
              {t === "reply" ? "Reply" : "Internal note"}
            </button>
          ))}
        </div>
      )}
      <div
        className="p-3"
        {...(mode === "staff"
          ? { role: "tabpanel", id: `${fieldId}-panel`, "aria-labelledby": `${fieldId}-tab-${tab}` }
          : {})}
      >
        <label htmlFor={fieldId} className="sr-only">
          {isNote ? "Internal note" : "Reply"}
        </label>
        {isNote && (
          <p className="mb-1 text-xs font-medium text-amber-800">Only Help Desk staff can see this.</p>
        )}
        {mode === "staff" && !isNote && ticket.source === "public" && (
          <p className="mb-1 text-xs text-gray-600">
            Sent from the public form: {ticket.submitter_name} reads this reply at the status page
            with their reference code. Nothing is emailed.
          </p>
        )}
        <textarea
          id={fieldId}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !sending) void send();
          }}
          maxLength={5000}
          rows={3}
          placeholder={isNote ? "Write a note for other staff…" : "Write your reply…"}
          disabled={sending}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          className="w-full resize-y rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          {isNote ? <span /> : <FilePicker files={files} onChange={setFiles} disabled={sending} />}
          <div className="flex items-center gap-2 self-end">
            <span className="hidden text-xs text-gray-500 lg:inline">Ctrl/⌘ + Enter to send</span>
            {mode === "staff" && !isNote && (
              <label className="flex items-center gap-1 text-xs text-gray-600">
                Then set
                <select
                  value={sendStatus}
                  onChange={(e) => setSendStatus(e.target.value as HelpdeskStatus)}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                >
                  {sendStatuses.map((s) => (
                    <option key={s} value={s}>
                      {HELPDESK_STATUSES[s].label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button type="button" size="sm" onClick={() => void send()} disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              {sending ? "Sending…" : isNote ? "Add note" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
