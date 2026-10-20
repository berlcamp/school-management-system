/**
 * The SDO Reports, as cards. Shared by the reports index and by the Region
 * Account settings page (migration 214), which switches each one on or off by
 * `regionReportKey(href)` — so a report added here is offered there too, and
 * stays hidden from a Region Account until a super admin turns it on.
 */
import {
  Building2,
  CalendarX,
  ClipboardList,
  GraduationCap,
  HeartHandshake,
  IdCard,
  Landmark,
  LayoutGrid,
  LucideIcon,
  Ruler,
  School as SchoolIcon,
  SlidersHorizontal,
  Sprout,
  UserCog,
  Users,
  Users2,
} from "lucide-react";

export interface ReportCard {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  available: boolean;
}

export const DIVISION_REPORTS: ReportCard[] = [
  {
    title: "Custom Report Builder",
    description:
      "Build your own: pick a dataset, the columns you need and the filters that narrow it. For what the fixed reports below do not already answer.",
    href: "/division/reports/builder",
    icon: SlidersHorizontal,
    available: true,
  },
  {
    title: "School List",
    description: "Directory of all schools in the division with contact details.",
    href: "/division/reports/school-list",
    icon: SchoolIcon,
    available: true,
  },
  {
    title: "Enrollment",
    description:
      "Learners by grade level, sex, modality, and category. Submission-based.",
    href: "/division/reports/enrollment",
    icon: GraduationCap,
    available: true,
  },
  {
    title: "Absenteeism",
    description:
      "Learner absences by sex — per section, grade level, school and the whole division — from daily attendance. Printable.",
    href: "/division/reports/absenteeism",
    icon: CalendarX,
    available: true,
  },
  {
    title: "Track & Strand (SHS)",
    description: "Senior High learners by track and strand.",
    href: "/division/reports/track-strand",
    icon: ClipboardList,
    available: true,
  },
  {
    title: "SHS Specialization",
    description: "SHS learners by specific specialization under each strand.",
    href: "/division/reports/shs-specialization",
    icon: LayoutGrid,
    available: true,
  },
  {
    title: "Teaching Personnel",
    description: "Count of teaching staff per school.",
    href: "/division/reports/teaching-personnel",
    icon: Users,
    available: true,
  },
  {
    title: "Grade Level Teachers",
    description:
      "Teachers assigned to a grade level at one school, by advisorship and subject load. Printable.",
    href: "/division/reports/grade-level-teachers",
    icon: Users2,
    available: true,
  },
  {
    title: "Teaching Specialization",
    description: "Teaching staff by subject learning area. Submission-based.",
    href: "/division/reports/teaching-specialization",
    icon: UserCog,
    available: true,
  },
  {
    title: "Employee Specialization",
    description:
      "College major, graduate major and DepEd specialization of every employee, by sex — with who has not answered. Printable.",
    href: "/division/reports/employee-specialization",
    icon: GraduationCap,
    available: true,
  },
  {
    title: "Staff by Position / Designation",
    description:
      "Active personnel per position by sex — division-wide with a per-school breakdown, or one school with names.",
    href: "/division/reports/positions",
    icon: IdCard,
    available: true,
  },
  {
    title: "Non-Teaching Personnel",
    description: "Admin, utility, security, health, library, guidance, etc.",
    href: "/division/reports/non-teaching",
    icon: Landmark,
    available: true,
  },
  {
    title: "Rooms",
    description: "Room inventory by type and condition.",
    href: "/division/reports/rooms",
    icon: Building2,
    available: true,
  },
  {
    title: "Classroom Needs Analysis",
    description:
      "Shortage or surplus based on enrollment vs available classrooms.",
    href: "/division/reports/classroom-needs",
    icon: Ruler,
    available: true,
  },
  // The division-wide cut of the two IPEd workbook forms: one row per school,
  // the shape the printed form takes. The school-level cut of the same two
  // reports lives under /school-reports.
  {
    title: "IPEd Program Data Set",
    description:
      "IP enrolment by band, the orientation matrices and the division's activities and issues, per school and fiscal year.",
    href: "/division/reports/iped",
    icon: Sprout,
    available: true,
  },
  {
    title: "PWD and 4P's Beneficiary Data Set",
    description:
      "Learners with a disability, 4Ps beneficiaries and IP learners by sex — per school and per grade level.",
    href: "/division/reports/pwd-4ps",
    icon: HeartHandshake,
    available: true,
  },
];
