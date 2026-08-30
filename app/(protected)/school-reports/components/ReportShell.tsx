"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DIVISION_SCHOOL_REPORT_ROLES } from "@/components/reports/ReportSchoolContext";
import { useAppSelector } from "@/lib/redux/hook";
import { ArrowLeft, Printer, School as SchoolIcon } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

/**
 * Roles allowed in the Reports module. Mirrors AppSidebar's `hasStaffAccess`
 * (school head / assistant / super admin / admin) — hiding the sidebar link is
 * not access control, so every report page re-checks here.
 *
 * The division office is admitted too, but on different terms: they have no
 * school of their own, so they must pick one first (`ReportSchoolContext`) and
 * every page refuses to generate until they have. Being allowed in the module
 * is not the same as having something to report on.
 */
export const REPORT_ROLES = [
  "school_head",
  "assistant_school_head",
  "super admin",
  "admin",
  ...DIVISION_SCHOOL_REPORT_ROLES,
];

export function useCanViewReports(): boolean {
  const user = useAppSelector((state) => state.user.user);
  return REPORT_ROLES.includes(user?.type ?? "");
}

export function ReportAccessDenied() {
  return (
    <div className="p-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>
            You do not have permission to view this report.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/home">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Shown in place of a report when the division office has not yet said which
 * school it is for. Not an error — the picker sits at the top of the page.
 */
export function ReportNeedsSchool() {
  return (
    <div className="p-4 md:p-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SchoolIcon className="h-5 w-5" />
            Select a school
          </CardTitle>
          <CardDescription>
            These are school-level reports. Choose a school above to generate
            this report.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/school-reports">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Reports
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

interface ReportShellProps {
  title: string;
  description: string;
  filters: ReactNode;
  children: ReactNode;
  onPrint: () => void;
  printDisabled?: boolean;
}

export function ReportShell({
  title,
  description,
  filters,
  children,
  onPrint,
  printDisabled,
}: ReportShellProps) {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link
        href="/school-reports"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Reports
      </Link>

      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button onClick={onPrint} disabled={printDisabled} size="sm">
            <Printer className="h-4 w-4 mr-2" />
            Print / Save as PDF
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {filters}
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
