"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

/**
 * The signed-in user's two division rights, each granted separately by QA at
 * /qa/authors (migration 237):
 *  - `isAuthorized` — an active `sms_exam_qa_authors` row: may write Division
 *    TOS, exams and bank questions, whatever role they are acting as;
 *  - `mayAddCompetencies` — an active `sms_competency_contributors` row: may
 *    add entries to the competency catalogue.
 * The database decides (`is_division_author`, `can_add_catalogue_competency`,
 * which also refuse view-only and login-disabled types); this only shapes the
 * screen.
 */
export function useDivisionAuthorStatus() {
  const user = useAppSelector((state) => state.user.user);
  const [state, setState] = useState({
    loading: true,
    isAuthorized: false,
    mayAddCompetencies: false,
  });

  useEffect(() => {
    let isMounted = true;
    if (!user?.system_user_id) {
      setState({ loading: false, isAuthorized: false, mayAddCompetencies: false });
      return;
    }
    (async () => {
      const id = Number(user.system_user_id);
      const [author, contributor] = await Promise.all([
        supabase
          .from("sms_exam_qa_authors")
          .select("id")
          .eq("user_id", id)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("sms_competency_contributors")
          .select("user_id")
          .eq("user_id", id)
          .eq("is_active", true)
          .maybeSingle(),
      ]);
      if (isMounted)
        setState({
          loading: false,
          isAuthorized: !!author.data,
          // Before 237 is applied the table does not exist; read that as "no".
          mayAddCompetencies: !contributor.error && !!contributor.data,
        });
    })();
    return () => {
      isMounted = false;
    };
  }, [user?.system_user_id, user?.type]);

  return state;
}
