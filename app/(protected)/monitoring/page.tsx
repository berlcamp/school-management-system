"use client";

import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { ModuleLanding } from "@/components/ModuleLanding";
import { useStaffModuleAccess } from "@/hooks/useStaffModuleAccess";
import { ClipboardCheck, Telescope } from "lucide-react";

const ENTRIES = [
  {
    title: "Instructional Supervision Plan",
    description:
      "Planned and accomplished classroom observations per teacher for the school year.",
    href: "/monitoring/instructional-supervision-plan",
    icon: ClipboardCheck,
  },
];

export default function Page() {
  const canView = useStaffModuleAccess();
  if (!canView) return <ModuleAccessDenied />;

  return (
    <ModuleLanding
      title="Monitoring"
      description="School-level monitoring and supervision tools."
      icon={Telescope}
      entries={ENTRIES}
    />
  );
}
