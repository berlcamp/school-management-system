"use client";

import { Greeting } from "@/components/Greeting";
import {
  DefaultDashboard,
  DivisionDashboard,
  SchoolDashboard,
  TeacherDashboard,
} from "@/components/dashboards";
import { isSbfpViewer, isTeacherRole } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();
  const userType = user?.type;
  const isDivisionAdmin =
    userType === "division_admin" ||
    userType === "division_type" ||
    userType === "region_account";

  // Tutors, QA reviewers and SBFP viewers have their own workspaces — send
  // them straight there.
  useEffect(() => {
    if (userType === "tutor") router.replace("/tutor");
    else if (userType === "qa") router.replace("/qa");
    else if (isSbfpViewer(userType)) router.replace("/sbfp-viewer");
  }, [userType, router]);

  const renderDashboard = () => {
    if (isDivisionAdmin) {
      return <DivisionDashboard />;
    }
    if (isTeacherRole(userType)) {
      return <TeacherDashboard />;
    }
    if (userType === "tutor" || userType === "qa" || isSbfpViewer(userType)) {
      return null;
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
