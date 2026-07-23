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
      title="Cohort Survival Rate"
      description="Percentage of a grade-level cohort that reaches the final grade level of the level."
      backHref="/school-reports"
      backLabel="Back to Reports"
    />
  );
}
