"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

export interface PendingRequestCounts {
  documentRequests: number;
  incomingTransfers: number;
  outgoingTransfers: number;
}

const ZERO: PendingRequestCounts = {
  documentRequests: 0,
  incomingTransfers: 0,
  outgoingTransfers: 0,
};

/**
 * The pending counts are read in two places that never share a parent — the
 * sidebar "Requests" badge and the Requests page tab badges — so acting on a
 * request has to tell both to refetch. A window event is the cheapest channel
 * that reaches both without lifting this state into Redux.
 */
const CHANGED_EVENT = "requests:pending-changed";

/** Call after any mutation that can move a request in or out of "pending". */
export function notifyPendingRequestsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * Counts of requests still awaiting action at the signed-in user's school:
 * document requests, incoming transfers (another school wants our records) and
 * outgoing transfers (we are waiting on another school).
 *
 * Pass `enabled = false` for users whose menu has no Requests entry so their
 * sidebar does not fire three count queries it will never show.
 */
export function usePendingRequestCounts(enabled = true) {
  const schoolId = useAppSelector((state) => state.user.user?.school_id) ?? null;
  const [counts, setCounts] = useState<PendingRequestCounts>(ZERO);

  const refetch = useCallback(async () => {
    if (!enabled || !schoolId) {
      setCounts(ZERO);
      return;
    }

    const [documents, incoming, outgoing] = await Promise.all([
      supabase
        .from("sms_requests")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("status", "pending"),
      supabase
        .from("sms_record_requests")
        .select("id", { count: "exact", head: true })
        .eq("origin_school_id", schoolId)
        .eq("status", "pending"),
      supabase
        .from("sms_record_requests")
        .select("id", { count: "exact", head: true })
        .eq("requesting_school_id", schoolId)
        .eq("status", "pending"),
    ]);

    setCounts({
      documentRequests: documents.count ?? 0,
      incomingTransfers: incoming.count ?? 0,
      outgoingTransfers: outgoing.count ?? 0,
    });
  }, [enabled, schoolId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener(CHANGED_EVENT, refetch);
    return () => window.removeEventListener(CHANGED_EVENT, refetch);
  }, [enabled, refetch]);

  const total =
    counts.documentRequests + counts.incomingTransfers + counts.outgoingTransfers;

  return { counts, total, refetch };
}
