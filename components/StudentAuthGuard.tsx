"use client";

import { useStudentSession } from "@/lib/student-portal/context";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function StudentAuthGuard({ children }: { children: ReactNode }) {
  const { session, isLoading } = useStudentSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/student-portal");
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        <div className="animate-pulse text-white/70">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <>{children}</>;
}
