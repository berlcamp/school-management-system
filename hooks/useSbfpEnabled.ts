"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

/**
 * Whether a super admin has the Feeding Program switched on (migration 221).
 * Read once and shared by the sidebar and the page; `refreshSbfpEnabled()`
 * drops the copy after the switch changes.
 *
 * A UI gate only — the database refuses every SBFP write while it is off.
 * Defaults to on (the module was live before the switch existed), so a failed
 * read never hides it.
 */

let cached: Promise<boolean> | null = null;
const CHANGED_EVENT = "sbfp:enabled-changed";

function loadEnabled(): Promise<boolean> {
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase
        .from("sms_sbfp_settings")
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

export function refreshSbfpEnabled() {
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT));
}

export async function setSbfpEnabled(enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("sbfp_set_enabled", { p_enabled: enabled });
  if (error) return { ok: false, error: error.message || "Could not change the Feeding Program setting." };
  return { ok: true };
}

export function useSbfpEnabled() {
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
        console.error("Error loading Feeding Program setting:", error);
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
