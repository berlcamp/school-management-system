"use client";

import { useDesignations } from "@/hooks/useDesignations";
import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SchoolHeadGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user);
  const { loading, has } = useDesignations();
  const router = useRouter();

  // A Reading Coordinator (migration 216) manages school Assessments too, and
  // so does the school admin (migration 215), whom the menu already offers it.
  const isAllowed =
    user?.type === "school_head" ||
    user?.type === "assistant_school_head" ||
    user?.type === "admin" ||
    user?.type === "super admin" ||
    has("reading_coordinator");

  useEffect(() => {
    if (user && !loading && !isAllowed) {
      router.replace("/home");
    }
  }, [user, loading, isAllowed, router]);

  if (!user || loading || !isAllowed) {
    return null;
  }

  return <>{children}</>;
}
