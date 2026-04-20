"use client";

import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

/**
 * Returns a Map<school_id, school_type>. Reads sms_schools directly so callers
 * can filter by school_type without depending on RPC response shape.
 */
export function useSchoolTypeMap() {
  const [map, setMap] = useState<Map<number, string | null>>(new Map());

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      const { data, error } = await supabase
        .from("sms_schools")
        .select("id, school_type")
        .eq("is_active", true);
      if (!isMounted || error) return;
      const m = new Map<number, string | null>();
      for (const s of (data as { id: number; school_type: string | null }[]) ||
        []) {
        m.set(Number(s.id), s.school_type);
      }
      setMap(m);
    };
    fetch();
    return () => {
      isMounted = false;
    };
  }, []);

  return map;
}
