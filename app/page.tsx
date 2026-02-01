"use client";

import LoadingSkeleton from "@/components/LoadingSkeleton";
import LoginBox from "@/components/LoginBox";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) console.warn("Auth error:", error.message);
      if (data.user) {
        router.push("/home");
        return;
      }
      setCheckingSession(false);
    };

    checkSession();
  }, [router]);

  if (checkingSession) {
    return <LoadingSkeleton />;
  }

  return <LoginBox />;
}
