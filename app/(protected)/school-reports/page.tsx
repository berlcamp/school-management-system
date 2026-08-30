"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowRight,
  Award,
  BookOpen,
  Clock,
  FileBarChart,
  Gauge,
  HeartHandshake,
  LayoutGrid,
  MapPin,
  Sprout,
  Users,
} from "lucide-react";
import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import Link from "next/link";
import {
  ReportAccessDenied,
  useCanViewReports,
} from "./components/ReportShell";

const REPORTS = [
  {
    title: "Key Performance Indicators",
    description:
      "Access, efficiency and ratio indicators per the DepEd guide — GER, NER, GIR, NIR, transition, promotion, repetition, survival, completion and the learner ratios.",
    href: "/school-reports/kpi",
    icon: Gauge,
  },
  {
    title: "Subjects Handled by Teacher",
    description:
      "Every scheduled subject per teacher — section, days, time, room, weekly minutes and learner count.",
    href: "/school-reports/subjects-handled",
    icon: BookOpen,
  },
  {
    title: "Grade Level Teachers",
    description:
      "Who teaches each grade level here — from section advisorship and subject schedules, with advisory sections, subjects handled and sections taught.",
    href: "/school-reports/grade-level-teachers",
    icon: Users,
  },
  {
    title: "Teaching Load (minutes per day)",
    description:
      "Daily teaching minutes per teacher with DepEd advisorship and ARAL equivalents, and the weekly total.",
    href: "/school-reports/teaching-load",
    icon: Clock,
  },
  {
    title: "Classroom Enrollment and Size",
    description:
      "Every section of the current school year with its classroom dimension, capacity and actual number of enrollees.",
    href: "/school-reports/classroom-enrollment",
    icon: LayoutGrid,
  },
  {
    title: "Enrollment and Good Moral Certificates",
    description:
      "Print Certificate of Enrollment or Certificate of Good Moral Character per section, or for one learner.",
    href: "/school-reports/certificates",
    icon: Award,
  },
  {
    title: "Child Mapping",
    description:
      "Barangay-level mapping of school-age children, in-school and out-of-school.",
    href: "/school-reports/child-mapping",
    icon: MapPin,
  },
  {
    title: "IPEd Program Data Set",
    description:
      "Indigenous Peoples Education returns per school and fiscal year — school type, IP enrolment by band, the teacher and school head orientation matrices, and the division's activities and issues.",
    href: "/school-reports/iped",
    icon: Sprout,
  },
  {
    title: "PWD and 4P's Beneficiary Data Set",
    description:
      "Learners with a disability, 4Ps beneficiaries and IP learners by sex — per school and per grade level.",
    href: "/school-reports/pwd-4ps",
    icon: HeartHandshake,
  },
];

export default function Page() {
  const canView = useCanViewReports();
  // A division user reaches this page with no school of their own; the picker
  // in the layout is how they say which one, and nothing opens until they have.
  const { schoolId, schoolName, isDivisionUser } = useReportSchool();
  const needsSchool = !schoolId;

  if (!canView) return <ReportAccessDenied />;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <FileBarChart className="h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            School-level reports, printable as PDF.
            {isDivisionUser && schoolName ? ` Showing ${schoolName}.` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          const card = (
            <Card
              className={
                needsSchool
                  ? "h-full border-0 shadow-lg opacity-60"
                  : "h-full border-0 shadow-lg transition-shadow hover:shadow-xl"
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-5 w-5 shrink-0" />
                  {report.title}
                </CardTitle>
                <CardDescription>{report.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span
                  className={
                    needsSchool
                      ? "inline-flex items-center text-sm font-medium text-muted-foreground"
                      : "inline-flex items-center text-sm font-medium text-primary"
                  }
                >
                  {needsSchool ? (
                    "Select a school first"
                  ) : (
                    <>
                      Open report
                      <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </span>
              </CardContent>
            </Card>
          );

          return needsSchool ? (
            <div key={report.href}>{card}</div>
          ) : (
            <Link key={report.href} href={report.href} className="group">
              {card}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
