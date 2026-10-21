"use client";

/**
 * My Help Desk (migration 218) — the signed-in user's own concerns to the
 * division Help Desk. Any user with a login may send one; replies show here
 * and as a count beside the menu link.
 */

import { HelpdeskOff } from "@/components/helpdesk/HelpdeskOff";
import { NewTicketDialog } from "@/components/helpdesk/NewTicketDialog";
import { TicketDetail } from "@/components/helpdesk/TicketDetail";
import { TicketList } from "@/components/helpdesk/TicketList";
import { useTicketPages } from "@/components/helpdesk/useTicketPages";
import { Button } from "@/components/ui/button";
import { notifyHelpdeskChanged, useHelpdeskAccess } from "@/hooks/useHelpdesk";
import { useAppSelector } from "@/lib/redux/hook";
import { Inbox, LifeBuoy, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function Page() {
  const { enabled, isStaff, loading } = useHelpdeskAccess();
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-600" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
      </div>
    );
  }
  if (!enabled) return <HelpdeskOff />;
  return <MyHelpdesk isStaff={isStaff} />;
}

function MyHelpdesk({ isStaff }: { isStaff: boolean }) {
  const userId = useAppSelector((state) => state.user.user?.system_user_id);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ticketParam = Number(searchParams.get("ticket"));
  const selectedId = Number.isInteger(ticketParam) && ticketParam > 0 ? ticketParam : null;
  const [showNew, setShowNew] = useState(false);

  const filters = useMemo(
    () => ({ keyword: "", status: "all" as const, category: "" as const, assigned: "anyone" as const, submitterId: userId ?? -1 }),
    [userId],
  );
  const { list, loading, error, isEmpty, hasMore, refetch, showMore } = useTicketPages(filters, 20, !!userId);

  const select = (id: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === null) params.delete("ticket");
    else params.set("ticket", String(id));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div>
      <div className="app__title flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="app__title_text flex items-center gap-2">
            <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            Help Desk
          </h1>
          <p className="text-sm text-muted-foreground">
            Questions or problems for the division office. Replies show here.
          </p>
        </div>
        <div className="flex gap-2">
          {isStaff && (
            <Link href="/helpdesk/inbox">
              <Button variant="outline" size="sm">
                <Inbox className="h-4 w-4" aria-hidden="true" /> Open the inbox
              </Button>
            </Link>
          )}
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New concern
          </Button>
        </div>
      </div>

      <div className="m-4 overflow-hidden rounded-lg border bg-white lg:grid lg:h-[calc(100dvh-200px)] lg:min-h-[480px] lg:grid-cols-[minmax(280px,340px)_1fr]">
        <section
          aria-label="My concerns"
          className={`min-h-0 overflow-y-auto border-r ${selectedId !== null ? "hidden lg:block" : "block"}`}
        >
          {error ? (
            <div className="space-y-2 p-3 text-sm text-red-700" role="alert">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                Try again
              </Button>
            </div>
          ) : loading && list.length === 0 ? (
            <p className="p-4 text-sm text-gray-600" aria-busy="true">
              Loading…
            </p>
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-gray-600">
              <LifeBuoy className="h-8 w-8 text-gray-400" aria-hidden="true" />
              <p>You haven’t sent the Help Desk any concerns yet.</p>
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="font-medium text-blue-700 hover:underline"
              >
                Send your first concern
              </button>
            </div>
          ) : (
            <>
              <TicketList tickets={list} selectedId={selectedId} onSelect={select} showSubmitter={false} />
              {hasMore && (
                <div className="p-3">
                  <Button variant="outline" size="sm" className="w-full" onClick={showMore}>
                    Show more
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
        <section
          aria-label="Concern details"
          className={`min-h-0 ${selectedId === null ? "hidden lg:block" : "block"}`}
        >
          {selectedId === null ? (
            <p className="flex h-full items-center justify-center p-8 text-sm text-gray-600">
              Select a concern to see the conversation.
            </p>
          ) : (
            <TicketDetail
              ticketId={selectedId}
              mode="submitter"
              onBack={() => {
                if (window.history.length <= 1) select(null);
                else router.back();
              }}
              onChanged={refetch}
            />
          )}
        </section>
      </div>

      <NewTicketDialog
        open={showNew}
        onOpenChange={setShowNew}
        onCreated={(id) => {
          refetch();
          notifyHelpdeskChanged();
          select(id);
        }}
      />
    </div>
  );
}
