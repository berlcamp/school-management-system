"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function DivisionGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();

  const isDivisionUser =
    user?.type === "division_admin" || user?.type === "division_type";

  useEffect(() => {
    if (user && !isDivisionUser) {
      router.replace("/home");
    }
  }, [user, isDivisionUser, router]);

  if (!user) {
    return null;
  }

  if (!isDivisionUser) {
    return null;
  }

  return <>{children}</>;
}
