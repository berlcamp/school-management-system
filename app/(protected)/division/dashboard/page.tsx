"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Page() {
  const router = useRouter();
  const user = useAppSelector((state) => state.user.user);

  useEffect(() => {
    if (
      user?.type === "division_admin" ||
      user?.type === "division_type"
    ) {
      router.replace("/home");
    }
  }, [user?.type, router]);

  return null;
}
