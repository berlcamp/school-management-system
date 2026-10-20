"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function DivisionGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();

  // A Region Account (214) is admitted here and narrowed to the switched-on
  // reports by RegionAccountGuard in the protected layout.
  const isAllowed =
    user?.type === "division_admin" ||
    user?.type === "division_type" ||
    user?.type === "super admin" ||
    user?.type === "region_account";

  useEffect(() => {
    if (user && !isAllowed) {
      router.replace("/home");
    }
  }, [user, isAllowed, router]);

  if (!user) {
    return null;
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
