"use client";

import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      // Wait for session to update properly
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        window.location.href = "/auth/unverified";
        return;
      }

      const userEmail = session.user.email;

      // ✅ Check if user exists in DB
      const { data: existingUser, error } = await supabase
        .from("sms_users")
        .select("id")
        .eq("email", userEmail)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (error) {
        await supabase.auth.signOut();
        console.error("Error fetching user:", error);
        // window.location.href = '/auth/unverified'
        return;
      }

      if (!existingUser) {
        await supabase.auth.signOut();
        window.location.href = "/auth/unverified";
      } else {
        window.location.href = "/home";
      }
    };

    checkUser();

    // ✅ Ensure session updates correctly
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          checkUser();
        }
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-base font-bold mb-8 text-nowrap">
          We are verifying your account, please wait...
        </h1>
      </div>
    </main>
  );
}
