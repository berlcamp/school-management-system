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
  const isDivisionAdmin =
    userType === "division_admin" || userType === "division_type";

  const renderDashboard = () => {
    if (isDivisionAdmin) {
      return <DivisionDashboard />;
    }
    if (userType === "teacher") {
      return <TeacherDashboard />;
    }
    if (
      userType === "school_head" ||
      userType === "assistant_school_head" ||
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
      {!isDivisionAdmin && <Greeting name={user?.name ?? ""} />}
      {renderDashboard()}
    </div>
  );
}
