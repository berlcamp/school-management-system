"use client";

import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { ModuleComingSoon } from "@/components/ModuleComingSoon";
import { useStaffModuleAccess } from "@/hooks/useStaffModuleAccess";

export default function Page() {
  const canView = useStaffModuleAccess();
  if (!canView) return <ModuleAccessDenied />;

  return (
    <ModuleComingSoon
      title="Instructional Supervision Plan"
      description="Planned and accomplished classroom observations per teacher for the school year."
      backHref="/monitoring"
      backLabel="Back to Monitoring"
    />
  );
}
