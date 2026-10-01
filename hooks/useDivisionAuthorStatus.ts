"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { isTeacherRole } from "@/lib/constants/userTypes";
import { useEffect, useState } from "react";

/**
 * Whether the signed-in user is a QA-authorized Division author right now
 * (194's `is_division_author()`): a teacher role AND an active
 * sms_exam_qa_authors row. The database decides; this only shapes the screen.
 */
export function useDivisionAuthorStatus() {
  const user = useAppSelector((state) => state.user.user);
  const [state, setState] = useState({ loading: true, isAuthorized: false });

  useEffect(() => {
    let isMounted = true;
    if (!user?.id || !isTeacherRole(user.type)) {
      setState({ loading: false, isAuthorized: false });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("sms_exam_qa_authors")
        .select("id")
        .eq("user_id", Number(user.id))
        .eq("is_active", true)
        .maybeSingle();
      if (isMounted) setState({ loading: false, isAuthorized: !!data });
    })();
    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.type]);

  return state;
}
