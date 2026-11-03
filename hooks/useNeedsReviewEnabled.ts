"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

/**
 * Whether a super admin has Needs Review switched on (migration 227). Read once
 * and shared by the sidebar and the pages; `refreshNeedsReviewEnabled()` drops
 * the copy after the switch changes. The same shape as `useSbfpEnabled` (221).
 *
 * A UI gate only — `division_needs_review` itself refuses everyone but a super
 * admin while it is off. Defaults to on (the module was live before the switch
 * existed), so a failed read never hides it.
 */

let cached: Promise<boolean> | null = null;
const CHANGED_EVENT = "needs-review:enabled-changed";

function loadEnabled(): Promise<boolean> {
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase
        .from("sms_needs_review_settings")
        .select("is_enabled")
        .maybeSingle();
      if (error) {
        cached = null;
        throw error;
      }
      return data?.is_enabled !== false;
    })();
  }
  return cached;
}

export function refreshNeedsReviewEnabled() {
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT));
}

export async function setNeedsReviewEnabled(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("needs_review_set_enabled", { p_enabled: enabled });
  if (error) return { ok: false, error: error.message || "Could not change the Needs Review setting." };
  return { ok: true };
}

export function useNeedsReviewEnabled() {
  const user = useAppSelector((state) => state.user.user);
  const [enabled, setEnabled] = useState(true);
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
    loadEnabled()
      .then((on) => {
        if (isMounted) setEnabled(on);
      })
      .catch((error) => {
        console.error("Error loading Needs Review setting:", error);
        if (isMounted) setEnabled(true);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [user, version]);

  return { enabled, loading };
}
