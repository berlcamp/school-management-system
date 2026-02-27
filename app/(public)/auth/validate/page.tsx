"use client";

import { PublicPageBackground } from "@/components/PublicPageBackground";
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
        console.error("No session found");
        window.location.href = "/auth/unverified";
        return;
      }

      const userEmail = session.user.email;
      if (!userEmail) {
        await supabase.auth.signOut();
        window.location.href = "/auth/unverified";
        return;
      }

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
        window.location.href = "/auth/unverified";
        return;
      }

      if (!existingUser) {
        await supabase.auth.signOut();
        window.location.href = "/auth/unverified";
        return;
      }

      // ✅ All good
      window.location.href = "/home";
    };

    checkUser();
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative">
      <PublicPageBackground />
      <p className="text-center mt-10 relative z-10 text-white">
        Verifying your account...
      </p>
    </main>
  );
}
