"use client";

import { useHelpdeskPoll } from "@/hooks/useHelpdesk";
import type { HelpdeskTicket, HelpdeskTicketFilters } from "@/lib/constants/helpdesk";
import { fetchHelpdeskTickets } from "@/lib/helpdesk/api";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A paged ticket list: the first `perPage` rows, then "Show more". A refetch
 * reloads everything already shown, so a poll never shortens the list.
 */
export function useTicketPages(filters: HelpdeskTicketFilters, perPage: number, enabled: boolean) {
  const [rows, setRows] = useState<HelpdeskTicket[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(perPage);
  const key = JSON.stringify(filters);
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const load = useCallback(
    async (size: number) => {
      const requested = key;
      setLoading(true);
      const result = await fetchHelpdeskTickets(JSON.parse(requested), size, 0);
      if (keyRef.current !== requested) return;
      if (result.ok) {
        setRows(result.data.rows);
        setCount(result.data.count);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    },
    [key],
  );

  // A new filter starts over at one page.
  useEffect(() => {
    if (!enabled) return;
    setRows([]);
    setLimit(perPage);
    void load(perPage);
  }, [load, enabled, perPage]);

  const refetch = useCallback(() => void load(limit), [load, limit]);
  useHelpdeskPoll(refetch, enabled);

  const showMore = () => {
    const next = limit + perPage;
    setLimit(next);
    void load(next);
  };

  return {
    list: rows,
    loading,
    error,
    isEmpty: !loading && !error && rows.length === 0,
    hasMore: rows.length < count,
    refetch,
    showMore,
  };
}
