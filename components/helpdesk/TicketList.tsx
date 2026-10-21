"use client";

import { helpdeskCategoryLabel, type HelpdeskTicket } from "@/lib/constants/helpdesk";
import { differenceInHours, formatDistanceToNowStrict } from "date-fns";
import { Clock, Globe, UserRound } from "lucide-react";
import { Initials } from "./Initials";
import { StatusBadge } from "./StatusBadge";

interface Props {
  tickets: HelpdeskTicket[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Staff see who sent it; My Help Desk doesn't need to. */
  showSubmitter: boolean;
}

/** How long the sender has been waiting, coloured from 1 day and urgent from 3 (with text, not colour alone). */
function Waiting({ since }: { since: string }) {
  const hours = differenceInHours(new Date(), new Date(since));
  const tone = hours >= 72 ? "text-red-700" : hours >= 24 ? "text-amber-700" : "text-blue-700";
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      Waiting {formatDistanceToNowStrict(new Date(since))}
    </span>
  );
}

export function TicketList({ tickets, selectedId, onSelect, showSubmitter }: Props) {
  return (
    <ul className="divide-y" aria-label="Concerns">
      {tickets.map((t) => {
        // Staff: the submitter is waiting. Submitter: staff answered.
        const attention = showSubmitter
          ? t.needs_attention
          : t.last_message_by === "staff" && t.status !== "closed" && t.status !== "resolved";
        const selected = selectedId === t.id;
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={selected ? "true" : undefined}
              className={`relative flex w-full gap-3 px-3 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none ${
                selected ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
            >
              {attention && <span className="absolute inset-y-0 left-0 w-1 bg-blue-600" aria-hidden="true" />}
              {showSubmitter && <Initials name={t.submitter_name} className="mt-0.5" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate text-sm ${attention ? "font-semibold text-gray-900" : "font-medium text-gray-800"}`}
                  >
                    {attention && (
                      <span className="sr-only">
                        {showSubmitter ? "Needs a reply. " : "New reply from the Help Desk. "}
                      </span>
                    )}
                    {showSubmitter ? t.submitter_name : t.subject}
                  </span>
                  <time dateTime={t.last_message_at} className="shrink-0 text-xs text-gray-500">
                    {formatDistanceToNowStrict(new Date(t.last_message_at), { addSuffix: true })}
                  </time>
                </div>
                {showSubmitter && (
                  <div className={`mt-0.5 truncate text-sm ${attention ? "text-gray-900" : "text-gray-700"}`}>
                    {t.subject}
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                  <StatusBadge status={t.status} />
                  <span className="font-mono">{t.reference_code}</span>
                  <span className="whitespace-nowrap">
                    <span aria-hidden="true">· </span>
                    {helpdeskCategoryLabel(t.category)}
                  </span>
                  {showSubmitter && t.source === "public" && (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
                      <Globe className="h-3 w-3" aria-hidden="true" /> Public
                    </span>
                  )}
                </div>
                {showSubmitter && (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 ${t.assignee ? "text-gray-700" : "italic text-gray-500"}`}
                    >
                      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {t.assignee ? t.assignee.name : "Unassigned"}
                    </span>
                    {t.needs_attention && <Waiting since={t.last_message_at} />}
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
