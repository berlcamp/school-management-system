"use client";

import { HELPDESK_POLL_MS } from "@/lib/constants/helpdesk";
import { fetchHelpdeskViewCounts, fetchMyHelpdeskReplyCount } from "@/lib/helpdesk/api";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

/**
 * Whether the Help Desk is switched on (migration 218) and whether the
 * signed-in user answers it. Read once and shared by the sidebar and the
 * pages, which mount together; `refreshHelpdeskAccess()` drops the copy after
 * a super admin changes the switch or the staff list.
 *
 * Both are UI gates only — the database refuses every write while the switch
 * is off and decides what staff may read.
 */

interface HelpdeskAccess {
  enabled: boolean;
  isStaff: boolean;
}

let cached: { key: string; promise: Promise<HelpdeskAccess> } | null = null;
const CHANGED_EVENT = "helpdesk:access-changed";

function loadAccess(key: string): Promise<HelpdeskAccess> {
  if (!cached || cached.key !== key) {
    const promise = (async () => {
      const [settings, staff] = await Promise.all([
        supabase.from("sms_helpdesk_settings").select("is_enabled").maybeSingle(),
        supabase.rpc("sms_is_helpdesk_staff"),
      ]);
      if (settings.error) {
        cached = null;
        throw settings.error;
      }
      return {
        enabled: settings.data?.is_enabled === true,
        isStaff: staff.data === true,
      };
    })();
    cached = { key, promise };
  }
  return cached.promise;
}

export function refreshHelpdeskAccess() {
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function useHelpdeskAccess() {
  const user = useAppSelector((state) => state.user.user);
  // The active role decides staff access, so a role switch must re-read.
  const key = `${user?.system_user_id ?? ""}|${user?.type ?? ""}`;
  const [access, setAccess] = useState<HelpdeskAccess>({ enabled: false, isStaff: false });
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(CHANGED_EVENT, bump);
    return () => window.removeEventListener(CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    loadAccess(key)
      .then((a) => {
        if (isMounted) setAccess(a);
      })
      .catch((error) => {
        console.error("Error loading Help Desk settings:", error);
        if (isMounted) setAccess({ enabled: false, isStaff: false });
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [user, key, version]);

  return { ...access, loading };
}

/** Re-runs `load` every HELPDESK_POLL_MS and when the tab regains focus. */
export function useHelpdeskPoll(load: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(load, HELPDESK_POLL_MS);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load, enabled]);
}

const COUNTS_EVENT = "helpdesk:counts-changed";

/** Call after anything that can move a concern between inbox views. */
export function notifyHelpdeskChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COUNTS_EVENT));
}

/**
 * Concerns per inbox view (staff), or the user's own concerns with a new reply
 * (everyone else). Null until the first load, left as-is when a refresh fails.
 */
export function useHelpdeskCounts(mode: "staff" | "submitter" | null) {
  const userId = useAppSelector((state) => state.user.user?.system_user_id);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(COUNTS_EVENT, bump);
    window.addEventListener("focus", bump);
    const timer = setInterval(bump, HELPDESK_POLL_MS);
    return () => {
      window.removeEventListener(COUNTS_EVENT, bump);
      window.removeEventListener("focus", bump);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!mode || !userId) {
      setCounts(null);
      return;
    }
    let isMounted = true;
    if (mode === "staff") {
      fetchHelpdeskViewCounts(userId).then((r) => {
        if (isMounted && r.ok) setCounts(r.data);
      });
    } else {
      fetchMyHelpdeskReplyCount(userId).then((n) => {
        if (isMounted) setCounts({ replies: n });
      });
    }
    return () => {
      isMounted = false;
    };
  }, [mode, userId, tick]);

  return counts;
}
