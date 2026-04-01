"use client";

import { TeacherDashboard } from "@/components/dashboards";
import { Greeting } from "@/components/Greeting";
import { useAppSelector } from "@/lib/redux/hook";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  return (
    <div className="w-full space-y-6">
      <Greeting name={user?.name ?? ""} />
      <TeacherDashboard />
    </div>
  );
}
