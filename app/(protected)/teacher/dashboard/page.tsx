"use client";

import { TeacherDashboard } from "@/components/dashboards";
import { Greeting } from "@/components/Greeting";
import { useAppSelector } from "@/lib/redux/hook";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  return (
    <div className="w-full space-y-6">
      {/* Greeting bar - compact, above dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl bg-muted/30 dark:bg-muted/10 px-4 py-3 border border-border/50">
        <Greeting name={user?.name ?? ""} />
      </div>
      <TeacherDashboard />
    </div>
  );
}
