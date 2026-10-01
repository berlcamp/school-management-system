"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The QA area (194). The database refuses every QA action to anyone else;
 *  this only keeps the screens honest. */
export function QaGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();
  const isAllowed = user?.type === "qa" || user?.type === "super admin";

  useEffect(() => {
    if (user && !isAllowed) router.replace("/home");
  }, [user, isAllowed, router]);

  if (!user || !isAllowed) return null;
  return <>{children}</>;
}
