"use client";

import { supabase } from "@/lib/supabase/client";
import { useEffect } from "react";

export default function ValidateUserPage() {
  useEffect(() => {
    const checkUser = async () => {
      // Get current session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        // window.location.href = '/auth/unverified'
        console.error("session");
        return;
      }

      const userEmail = session.user.email;

      const { data: existingUser, error } = await supabase
        .from("sms_users")
        .select("id")
        .eq("email", userEmail)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error checking user:", error);
        await supabase.auth.signOut();
        // window.location.href = '/auth/unverified'
        return;
      }

      if (!existingUser) {
        console.error("existingUser");
        await supabase.auth.signOut();
        // window.location.href = '/auth/unverified'
        return;
      }

      // ✅ All good
      window.location.href = "/home";
    };

    checkUser();
  }, []);

  return <p className="text-center mt-10">Verifying your account...</p>;
}
