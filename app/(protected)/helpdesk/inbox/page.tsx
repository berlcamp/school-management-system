"use client";

/**
 * Help Desk inbox (migration 218) — one shared inbox for the people who answer
 * concerns: super admins, division admins and the Help Desk staff list. Every
 * staff member sees every concern, replies, changes status and assigns.
 *
 * The view and category live in the URL, so links, the back button and the
 * view chips all agree on what the list shows.
 */

import { HelpdeskOff } from "@/components/helpdesk/HelpdeskOff";
import { TicketDetail } from "@/components/helpdesk/TicketDetail";
import { TicketList } from "@/components/helpdesk/TicketList";
import { useTicketPages } from "@/components/helpdesk/useTicketPages";
import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { Button } from "@/components/ui/button";
import { useHelpdeskAccess, useHelpdeskCounts } from "@/hooks/useHelpdesk";
import {
  HELPDESK_CATEGORIES,
  HELPDESK_VIEWS,
  helpdeskCategoryLabel,
  helpdeskViewFor,
  type HelpdeskCategory,
} from "@/lib/constants/helpdesk";
import { useAppSelector } from "@/lib/redux/hook";
import { ExternalLink, Inbox, Loader2, MessageSquareText, Search, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function Page() {
  const { enabled, isStaff, loading } = useHelpdeskAccess();
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-600" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
      </div>
    );
  }
  if (!isStaff) return <ModuleAccessDenied />;
  if (!enabled) return <HelpdeskOff />;
  return <StaffInbox />;
}

function StaffInbox() {
  const user = useAppSelector((state) => state.user.user);
  const userId = user?.system_user_id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ticketParam = Number(searchParams.get("ticket"));
  const selectedId = Number.isInteger(ticketParam) && ticketParam > 0 ? ticketParam : null;

  const view = helpdeskViewFor(searchParams.get("view"));
  const categoryParam = searchParams.get("category") ?? "";
  const category = (HELPDESK_CATEGORIES.some((c) => c.value === categoryParam)
    ? categoryParam
    : "") as HelpdeskCategory | "";

  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setKeyword(keywordInput.trim()), 300);
    return () => clearTimeout(t);
  }, [keywordInput]);

  const counts = useHelpdeskCounts("staff");
  const filters = useMemo(
    () => ({ keyword, category, ...view.filters, userId }),
    [keyword, category, view, userId],
  );
  const { list, loading, error, isEmpty, hasMore, refetch, showMore } = useTicketPages(filters, 30, true);

  const navigate = (change: Record<string, string | null>, mode: "push" | "replace" = "push") => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(change)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(url);
    else router.replace(url);
  };

  // push, so the phone back button returns to the list.
  const select = (id: number | null) => navigate({ ticket: id === null ? null : String(id) });

  const selectClass =
    "h-9 rounded-md border bg-white px-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const total = counts?.[view.key];
  const narrowed = keyword !== "" || category !== "";

  return (
    <div>
      <div className="app__title flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="app__title_text flex items-center gap-2">
            <Inbox className="h-5 w-5" aria-hidden="true" />
            Help Desk Inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            Answered by super admins, division admins and the Help Desk staff list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/contact" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Public form
              <span className="sr-only">(opens in a new tab)</span>
            </Button>
          </a>
          {user?.type === "super admin" && (
            <Link href="/division/helpdesk">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4" aria-hidden="true" /> Settings
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* View chips; a select below sm, where seven chips do not fit. */}
      <nav aria-label="Inbox views" className="mx-4 mt-4 hidden flex-wrap gap-2 sm:flex">
        {HELPDESK_VIEWS.map((v) => {
          const n = counts?.[v.key];
          const current = view.key === v.key;
          const highlight = v.key === "attention" && (n ?? 0) > 0;
          return (
            <button
              key={v.key}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => navigate({ view: v.key === "active" ? null : v.key, ticket: null })}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                current ? "border-gray-900 bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {v.label}
              {n !== undefined && v.key !== "all" && (
                <span
                  className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${
                    highlight ? "bg-blue-600 text-white" : current ? "bg-white/20" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {n}
                  <span className="sr-only"> concerns</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mx-4 my-4 overflow-hidden rounded-lg border bg-white shadow-sm lg:grid lg:h-[calc(100dvh-250px)] lg:min-h-[24rem] lg:grid-cols-[minmax(320px,380px)_1fr]">
        <section
          aria-label="Concern list"
          className={`flex min-h-0 flex-col border-r ${selectedId !== null ? "hidden lg:flex" : "flex"}`}
        >
          <div className="space-y-2 border-b p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                {view.label}
                {category && <span className="font-normal text-gray-600">· {helpdeskCategoryLabel(category)}</span>}
              </h2>
              <span className="flex items-center gap-1.5 text-xs text-gray-600" role="status" aria-atomic="true">
                {loading && list.length > 0 && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {!narrowed && total !== undefined && view.key !== "all" && `${total} ${total === 1 ? "concern" : "concerns"}`}
              </span>
            </div>

            <label className="block sm:hidden">
              <span className="sr-only">View</span>
              <select
                className={`${selectClass} w-full`}
                value={view.key}
                onChange={(e) => navigate({ view: e.target.value === "active" ? null : e.target.value, ticket: null })}
              >
                {HELPDESK_VIEWS.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                    {counts?.[v.key] !== undefined && v.key !== "all" ? ` (${counts[v.key]})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2">
              <label className="relative block flex-1">
                <span className="sr-only">Search concerns</span>
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
                <input
                  type="search"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="Code, subject, name or email"
                  className="h-9 w-full rounded-md border pl-8 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
                />
                {keywordInput && (
                  <button
                    type="button"
                    onClick={() => setKeywordInput("")}
                    className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </label>
              <label className="block w-40 shrink-0">
                <span className="sr-only">Category</span>
                <select
                  className={`${selectClass} w-full`}
                  value={category}
                  onChange={(e) => navigate({ category: e.target.value, ticket: null }, "replace")}
                >
                  <option value="">All categories</option>
                  {HELPDESK_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? (
              <div className="space-y-2 p-3 text-sm text-red-700" role="alert">
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={refetch}>
                  Try again
                </Button>
              </div>
            ) : loading && list.length === 0 ? (
              <ul aria-busy="true" aria-label="Loading concerns" className="divide-y">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex gap-3 px-3 py-3">
                    <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200 motion-reduce:animate-none" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3 w-1/2 animate-pulse rounded bg-gray-200 motion-reduce:animate-none" />
                      <span className="block h-3 w-4/5 animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
                      <span className="block h-3 w-1/3 animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : isEmpty ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-gray-600">
                <Inbox className="h-8 w-8 text-gray-400" aria-hidden="true" />
                <p className="font-medium text-gray-800">{narrowed ? "No concerns match." : view.empty}</p>
                {narrowed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    onClick={() => {
                      setKeywordInput("");
                      navigate({ category: null }, "replace");
                    }}
                  >
                    Clear search and category
                  </Button>
                )}
              </div>
            ) : (
              <>
                <TicketList tickets={list} selectedId={selectedId} onSelect={select} showSubmitter />
                {hasMore && (
                  <div className="p-3">
                    <Button variant="outline" size="sm" className="w-full" onClick={showMore}>
                      Show more
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section aria-label="Concern details" className={`min-h-0 ${selectedId === null ? "hidden lg:block" : "block"}`}>
          {selectedId === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gray-50 p-8 text-center text-sm text-gray-600">
              <MessageSquareText className="h-10 w-10 text-gray-400" aria-hidden="true" />
              <p className="font-medium text-gray-800">Select a concern to read and reply.</p>
              {(counts?.attention ?? 0) > 0 && view.key !== "attention" && (
                <button
                  type="button"
                  onClick={() => navigate({ view: "attention", category: null })}
                  className="mt-1 text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {counts?.attention} {counts?.attention === 1 ? "concern needs" : "concerns need"} a reply
                </button>
              )}
            </div>
          ) : (
            <TicketDetail
              ticketId={selectedId}
              mode="staff"
              onBack={() => {
                if (window.history.length <= 1) select(null);
                else router.back();
              }}
              onChanged={refetch}
            />
          )}
        </section>
      </div>
    </div>
  );
}
