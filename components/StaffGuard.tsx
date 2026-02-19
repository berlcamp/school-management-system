"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Restricts /staff to admin and school_head only. Registrar cannot access. */
export function StaffGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();

  useEffect(() => {
    if (
      user &&
      user.type !== "admin" &&
      user.type !== "school_head" &&
      user.type !== "super admin"
    ) {
      router.replace("/home");
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  const hasAccess =
    user.type === "admin" ||
    user.type === "school_head" ||
    user.type === "super admin";

  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
}
