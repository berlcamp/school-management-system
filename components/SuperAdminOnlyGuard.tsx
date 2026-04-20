"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SuperAdminOnlyGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();

  const isSuperAdmin = user?.type === "super admin";

  useEffect(() => {
    if (user && !isSuperAdmin) {
      router.replace("/home");
    }
  }, [user, isSuperAdmin, router]);

  if (!user || !isSuperAdmin) {
    return null;
  }

  return <>{children}</>;
}
