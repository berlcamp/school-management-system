"use client";

import { Greeting } from "@/components/Greeting";
import {
  DefaultDashboard,
  DivisionDashboard,
  SchoolDashboard,
  TeacherDashboard,
} from "@/components/dashboards";
import { useAppSelector } from "@/lib/redux/hook";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const userType = user?.type;

  const renderDashboard = () => {
    if (userType === "division_admin" || userType === "division_type") {
      return <DivisionDashboard />;
    }
    if (userType === "teacher") {
      return <TeacherDashboard />;
    }
    if (
      userType === "school_head" ||
      userType === "super admin" ||
      userType === "admin" ||
      userType === "registrar"
    ) {
      return <SchoolDashboard />;
    }
    return (
      <DefaultDashboard />
    );
  };

  return (
    <div className="w-full space-y-6">
      <Greeting name={user?.name ?? ""} />
      {renderDashboard()}
    </div>
  );
}
