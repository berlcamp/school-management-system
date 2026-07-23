"use client";

import { ModuleComingSoon } from "@/components/ModuleComingSoon";
import {
  ReportAccessDenied,
  useCanViewReports,
} from "../components/ReportShell";

export default function Page() {
  const canView = useCanViewReports();
  if (!canView) return <ReportAccessDenied />;

  return (
    <ModuleComingSoon
      title="Child Mapping"
      description="Barangay-level mapping of school-age children, in-school and out-of-school."
      backHref="/school-reports"
      backLabel="Back to Reports"
    />
  );
}
