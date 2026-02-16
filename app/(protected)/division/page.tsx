"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DivisionPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/division/dashboard");
  }, [router]);

  return null;
}
