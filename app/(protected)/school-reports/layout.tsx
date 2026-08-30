"use client";

/**
 * Every report under this segment is one school's. The provider answers which,
 * and the bar is how a division user says so — see `ReportSchoolContext`.
 */

import { ReportSchoolBar } from "@/components/reports/ReportSchoolBar";
import { ReportSchoolProvider } from "@/components/reports/ReportSchoolContext";

export default function SchoolReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ReportSchoolProvider>
      <ReportSchoolBar />
      {children}
    </ReportSchoolProvider>
  );
}
