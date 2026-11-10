"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

/**
 * The Role Permissions rows for the signed-in user's active type
 * (migration 232): url → enabled. A url with no row keeps the built-in menu.
 *
 * Read once per type and shared by the sidebar, the role dialog and
 * `MenuAccessGuard`, which mount together; `refreshMenuAccess()` drops the
 * copies after the super admin saves. A super admin has no rows — they always
 * see everything. A failed read leaves the built-in menu in place rather than
 * locking anyone out of their work.
 */

const EMPTY: ReadonlyMap<string, boolean> = new Map();
const cache = new Map<string, Promise<ReadonlyMap<string, boolean>>>();
/**
 * The last result per type, read synchronously so a hook mounted after the
 * first load starts with it instead of a loading state — `MenuAccessGuard`
 * renders nothing while loading, and blanking a page already on screen would
 * unmount it mid-use.
 */
const resolved = new Map<string, ReadonlyMap<string, boolean>>();
const CHANGED_EVENT = "sms:menu-access-changed";

function load(userType: string): Promise<ReadonlyMap<string, boolean>> {
  let pending = cache.get(userType);
  if (!pending) {
    pending = (async () => {
      const { data, error } = await supabase
        .from("sms_role_menu_access")
        .select("item_key, is_enabled")
        .eq("user_type", userType);
      if (error) {
        cache.delete(userType);
        throw error;
      }
      const map: ReadonlyMap<string, boolean> = new Map(
        (data ?? []).map((row) => [row.item_key as string, row.is_enabled as boolean]),
      );
      resolved.set(userType, map);
      return map;
    })();
    cache.set(userType, pending);
  }
  return pending;
}

export function refreshMenuAccess() {
  // `resolved` is kept, so pages stay up on the old settings until the new
  // ones arrive.
  cache.clear();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }
}

export function useMenuAccess() {
  const userType = useAppSelector((state) => state.user.user?.type);
  const applies = !!userType && userType !== "super admin";

  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => (userType && resolved.get(userType)) || EMPTY,
  );
  const [loading, setLoading] = useState(
    () => applies && !!userType && !resolved.has(userType),
  );
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(CHANGED_EVENT, bump);
    return () => window.removeEventListener(CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!applies || !userType) {
      setOverrides(EMPTY);
      setLoading(false);
      return;
    }
    let isMounted = true;
    const known = resolved.get(userType);
    if (known) {
      setOverrides(known);
      setLoading(false);
    } else {
      setLoading(true);
    }
    load(userType)
      .then((map) => {
        if (isMounted) setOverrides(map);
      })
      .catch((error) => {
        console.error("Error loading role permissions:", error);
        if (isMounted) setOverrides(EMPTY);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [applies, userType, version]);

  return { overrides, loading };
}
