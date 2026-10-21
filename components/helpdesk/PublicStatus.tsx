"use client";

import { Button } from "@/components/ui/button";
import { helpdeskCategoryLabel, type HelpdeskPublicThread } from "@/lib/constants/helpdesk";
import { fetchPublicThread, replyToPublicConcern } from "@/lib/helpdesk/publicActions";
import { format } from "date-fns";
import { Loader2, Send } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { StatusBadge } from "./StatusBadge";

const fieldClass =
  "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PublicStatus({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState("");
  const [thread, setThread] = useState<HelpdeskPublicThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    const result = await fetchPublicThread({ code, email }).catch(() => null);
    setLoading(false);
    if (!result || !result.ok) {
      setThread(null);
      setError(
        result && !result.ok
          ? result.error
          : "Could not load your concern. Check your connection and try again.",
      );
      return;
    }
    setThread({ ticket: result.ticket, messages: result.messages });
  };

  const sendReply = async () => {
    if (!reply.trim()) {
      setReplyError("Write a reply first.");
      return;
    }
    setSending(true);
    setReplyError(null);
    const result = await replyToPublicConcern({ code, email, body: reply }).catch(() => null);
    setSending(false);
    if (!result || !result.ok) {
      setReplyError(result && !result.ok ? result.error : "Could not send your reply. Please try again.");
      return;
    }
    setReply("");
    await load();
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-700">Enter the reference code and the email you used.</p>

      <form onSubmit={(e) => void load(e)} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
        <div>
          <label htmlFor="s-code" className="text-sm font-medium text-gray-800">
            Reference code
          </label>
          <input
            id="s-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="HD-XXXXXX"
            autoCapitalize="characters"
            className={`${fieldClass} font-mono uppercase`}
            required
          />
        </div>
        <div>
          <label htmlFor="s-email" className="text-sm font-medium text-gray-800">
            Email
          </label>
          <input
            id="s-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            required
          />
        </div>
        <Button type="submit" disabled={loading} className="h-10">
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {loading ? "Checking…" : "Check"}
        </Button>
      </form>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {thread && (
        <section aria-label="Your concern" className="space-y-4 border-t pt-4">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-gray-900">{thread.ticket.subject}</h3>
              <StatusBadge status={thread.ticket.status} />
            </div>
            <p className="text-sm text-gray-600">
              {thread.ticket.reference_code} · {helpdeskCategoryLabel(thread.ticket.category)} · sent{" "}
              {format(new Date(thread.ticket.created_at), "MMM d, yyyy")}
            </p>
          </div>

          <ol className="space-y-3">
            {thread.messages.map((m) => (
              <li key={m.id} className={`flex ${m.author_kind === "submitter" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`w-full max-w-[85%] rounded-lg border px-3 py-2 ${
                    m.author_kind === "submitter" ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap gap-x-2 text-xs text-gray-600">
                    <span className="font-semibold text-gray-800">{m.author_name}</span>
                    <time dateTime={m.created_at}>{format(new Date(m.created_at), "MMM d, yyyy h:mm a")}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-gray-900">{m.body}</p>
                </div>
              </li>
            ))}
          </ol>

          {thread.ticket.status === "closed" ? (
            <p className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              This concern is closed.{" "}
              <Link href="/contact" className="text-blue-700 underline">
                Send a new one
              </Link>{" "}
              if you still need help.
            </p>
          ) : (
            <div>
              <label htmlFor="s-reply" className="text-sm font-medium text-gray-800">
                Your reply
              </label>
              <textarea
                id="s-reply"
                rows={4}
                maxLength={5000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                aria-invalid={replyError !== null}
                className={fieldClass}
              />
              {replyError && (
                <p role="alert" className="mt-1 text-xs text-red-700">
                  {replyError}
                </p>
              )}
              <div className="mt-2 flex justify-end">
                <Button type="button" onClick={() => void sendReply()} disabled={sending}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                  {sending ? "Sending…" : "Send reply"}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
