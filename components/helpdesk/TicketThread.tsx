"use client";

import type { HelpdeskAttachment, HelpdeskMessage } from "@/lib/constants/helpdesk";
import { helpdeskFileUrl } from "@/lib/helpdesk/api";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { FileText, ImageIcon, Lock } from "lucide-react";
import { Fragment, useState } from "react";
import { Initials } from "./Initials";

function AttachmentLink({ file }: { file: HelpdeskAttachment }) {
  const [failed, setFailed] = useState(false);
  const Icon = file.type.startsWith("image/") ? ImageIcon : FileText;

  const open = async () => {
    // Opened first so popup blockers treat it as part of the click.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    let url: string | null = null;
    try {
      url = await helpdeskFileUrl(file.path);
    } catch {
      url = null;
    }
    if (url && tab) tab.location.href = url;
    else {
      tab?.close();
      setFailed(true);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs text-gray-700 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{file.name}</span>
      {failed && <span className="text-red-700">(could not open)</span>}
    </button>
  );
}

interface Props {
  messages: HelpdeskMessage[];
  /** Staff see internal notes; the submitter never receives them (RLS). */
  viewer: "staff" | "submitter";
  submitterName: string;
}

function dayLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d, yyyy");
}

export function TicketThread({ messages, viewer, submitterName }: Props) {
  return (
    <ol className="space-y-3" aria-label="Conversation">
      {messages.map((m, i) => {
        const at = new Date(m.created_at);
        const newDay = i === 0 || !isSameDay(at, new Date(messages[i - 1].created_at));
        const mine = viewer === "submitter" ? m.author_kind === "submitter" : m.author_kind === "staff";
        const author =
          m.author_kind === "submitter" ? submitterName : (m.author?.name ?? "Help Desk");

        return (
          <Fragment key={m.id}>
            {newDay && (
              <li aria-hidden="true" className="flex items-center gap-3 py-1 text-xs font-medium text-gray-500">
                <span className="h-px flex-1 bg-gray-200" />
                {dayLabel(at)}
                <span className="h-px flex-1 bg-gray-200" />
              </li>
            )}
            <li className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <Initials
                name={author}
                tone={m.is_internal ? "amber" : m.author_kind === "staff" ? "blue" : "gray"}
                className="hidden sm:inline-flex"
              />
              <div
                className={`min-w-0 max-w-[85%] rounded-lg border px-3 py-2 sm:max-w-[75%] ${
                  m.is_internal
                    ? "border-amber-300 bg-amber-50"
                    : mine
                      ? "border-blue-200 bg-blue-50"
                      : "border-gray-200 bg-white"
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-600">
                  <span className="font-semibold text-gray-800">{author}</span>
                  <time dateTime={m.created_at} title={format(at, "MMM d, yyyy h:mm a")}>
                    {format(at, "h:mm a")}
                  </time>
                  {m.is_internal && (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-800">
                      <Lock className="h-3 w-3" aria-hidden="true" /> Internal note · only staff can see this
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-gray-900">{m.body}</p>
                {m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((f) => (
                      <AttachmentLink key={f.path} file={f} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
