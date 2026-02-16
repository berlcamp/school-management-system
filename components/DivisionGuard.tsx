"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function DivisionGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();

  useEffect(() => {
    if (user && user.type !== "division_admin") {
      router.replace("/home");
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  if (user.type !== "division_admin") {
    return null;
  }

  return <>{children}</>;
}
