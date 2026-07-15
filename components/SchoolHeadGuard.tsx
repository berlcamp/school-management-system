"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SchoolHeadGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();

  const isAllowed =
    user?.type === "school_head" ||
    user?.type === "assistant_school_head" ||
    user?.type === "super admin";

  useEffect(() => {
    if (user && !isAllowed) {
      router.replace("/home");
    }
  }, [user, isAllowed, router]);

  if (!user || !isAllowed) {
    return null;
  }

  return <>{children}</>;
}
