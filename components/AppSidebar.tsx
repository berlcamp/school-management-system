"use client";

import {
  BarChart3,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarOff,
  ClipboardCheck,
  Megaphone,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Gauge,
  GraduationCap,
  Heart,
  Home,
  CalendarX,
  IdCard,
  ListChecks,
  Loader2,
  NotebookPen,
  NotebookText,
  Soup,
  Sparkles,
  Settings,
  Sprout,
  Tags,
  Telescope,
  TrendingUp,
  User,
  Users,
  Warehouse,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { usePendingRequestCounts } from "@/hooks/usePendingRequestCounts";
import { canEnrolLearners } from "@/lib/constants";
import { isQaRole } from "@/lib/constants/userTypes";
import { useAppSelector } from "@/lib/redux/hook";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NProgress from "nprogress";
import { useEffect, useState } from "react";

/** One link in the sidebar. */
interface NavItem {
  title: string;
  url: string;
  icon: typeof Home;
  /** Count of items waiting on the user, drawn as a badge beside the title. */
  badge?: number;
}

interface ModuleItem {
  title: string;
  url: string;
  icon: typeof Home;
  moduleName: string;
  /** Count of items waiting on the user, drawn as a badge beside the title. */
  badge?: number;
}

export function AppSidebar() {
  const pathname = usePathname();
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const user = useAppSelector((state) => state.user.user);

  // Reset loading state when pathname changes
  useEffect(() => {
    setLoadingPath(null);
  }, [pathname]);

  const handleLinkClick = (url: string) => {
    // Don't trigger if already on this page
    if (pathname === url) return;

    // Start progress bar and set loading state
    NProgress.start();
    setLoadingPath(url);
  };

  // Menu items.
  const allItems = [
    {
      title: "Home",
      url: "/home",
      icon: Home,
    },
  ];

  // Show all menu items to all authenticated users
  const items = allItems;

  // Module items configuration
  const allModuleItems: ModuleItem[] = [
    {
      title: "Enrollment",
      url: "/enrollment",
      icon: ClipboardList,
      moduleName: "enrollment",
    },
    {
      title: "Subjects",
      url: "/subjects",
      icon: BookOpen,
      moduleName: "subjects",
    },
    {
      title: "Books",
      url: "/books",
      icon: BookMarked,
      moduleName: "books",
    },
    {
      title: "Sections",
      url: "/sections",
      icon: Users,
      moduleName: "sections",
    },
    {
      title: "Students",
      url: "/students",
      icon: GraduationCap,
      moduleName: "students",
    },
    {
      title: "Schedules",
      url: "/schedules",
      icon: Calendar,
      moduleName: "schedules",
    },
    {
      title: "Evaluations",
      url: "/evaluations",
      icon: ClipboardCheck,
      moduleName: "evaluations",
    },
    {
      title: "MPS",
      url: "/mps",
      icon: BarChart3,
      moduleName: "mps",
    },
    {
      title: "ARAL",
      url: "/aral",
      icon: Sprout,
      moduleName: "aral",
    },
    {
      title: "Feeding Program",
      url: "/sbfp",
      icon: Soup,
      moduleName: "sbfp",
    },
  ];

  // Teacher-specific items
  const teacherItems: ModuleItem[] = [
    {
      title: "Dashboard",
      url: "/teacher/dashboard",
      icon: User,
      moduleName: "teacher_dashboard",
    },
    {
      title: "Enrollment",
      url: "/enrollment",
      icon: ClipboardList,
      moduleName: "enrollment",
    },
    {
      title: "My Sections",
      url: "/teacher/sections",
      icon: Users,
      moduleName: "teacher_sections",
    },
    {
      title: "My Subjects",
      url: "/teacher/subjects",
      icon: BookOpen,
      moduleName: "teacher_subjects",
    },
    {
      title: "Class Record",
      url: "/teacher/class-record",
      icon: BookOpenCheck,
      moduleName: "teacher_class_record",
    },
    {
      title: "Assessments",
      url: "/teacher/assessments",
      icon: NotebookPen,
      moduleName: "teacher_assessments",
    },
    {
      title: "ARAL",
      url: "/aral",
      icon: Sprout,
      moduleName: "teacher_aral",
    },
    {
      // Advisers select beneficiaries and record daily feeding for their own
      // section; the designated focal person manages the whole programme.
      title: "Feeding Program",
      url: "/sbfp",
      icon: Soup,
      moduleName: "teacher_sbfp",
    },
    {
      title: "Examinations",
      url: "/teacher/examinations",
      icon: FileSpreadsheet,
      moduleName: "teacher_examinations",
    },
    {
      title: "Books",
      url: "/teacher/books",
      icon: BookMarked,
      moduleName: "teacher_books",
    },
    {
      title: "Evaluations",
      url: "/teacher/evaluations",
      icon: ClipboardCheck,
      moduleName: "teacher_evaluations",
    },
    {
      title: "MPS",
      url: "/teacher/mps",
      icon: BarChart3,
      moduleName: "teacher_mps",
    },
    {
      title: "Anecdotal Record",
      url: "/teacher/anecdotal",
      icon: NotebookText,
      moduleName: "teacher_anecdotal",
    },
    {
      title: "Manifestation Tagging",
      url: "/teacher/anecdotal/manifestation",
      icon: Tags,
      moduleName: "teacher_manifestation",
    },
    {
      title: "Learner Cardex",
      url: "/teacher/cardex",
      icon: IdCard,
      moduleName: "teacher_cardex",
    },
    {
      title: "Absenteeism",
      url: "/teacher/absenteeism",
      icon: CalendarX,
      moduleName: "teacher_absenteeism",
    },
    {
      title: "Supervision",
      url: "/teacher/supervision",
      icon: Telescope,
      moduleName: "teacher_supervision",
    },
  ];

  // Filter modules based on user access and role
  const userType = user?.type;
  const isSchoolHead =
    userType === "school_head" ||
    userType === "assistant_school_head" ||
    userType === "super admin";
  const isDivisionAdmin =
    userType === "division_admin" || userType === "division_type";
  // A pure tutor logs in with type "tutor"; a staff/teacher who was also added
  // as an ARAL tutor carries the `is_tutor` flag and keeps their normal menus.
  const isTutor = userType === "tutor";
  const hasTutorAccess = isTutor || user?.is_tutor === true;
  // Migration 135's two working non-teaching roles. Each gets one narrow slice
  // of the teacher menu and nothing else — they advise no section, so their
  // pages read the whole school roster via `useAdvisoryLearners`.
  const isGuidanceCounselor = userType === "guidance_counselor";
  const isSchoolNurse = userType === "school_nurse";
  const isSupportRole = isGuidanceCounselor || isSchoolNurse;
  const isQa = isQaRole(userType);

  // A volunteer teacher (migration 139) works the whole Teacher Menu except
  // enrolment, so the one module they may not use is not offered. The route and
  // the database refuse it as well — this only keeps the menu honest.
  const teacherMenuItems = canEnrolLearners(userType)
    ? teacherItems
    : teacherItems.filter((item) => item.moduleName !== "enrollment");

  // School management access: school_head, admin, registrar, librarian have similar functions
  const hasSchoolManagementAccess =
    isSchoolHead ||
    userType === "admin" ||
    userType === "registrar" ||
    userType === "librarian";

  // Staff page: only admin and school_head can access (registrar cannot)
  const hasStaffAccess = isSchoolHead || userType === "admin";

  // Pending work behind the Records → Requests item. Only the roles that get
  // that menu entry pay for the three count queries.
  const { total: pendingRequests } = usePendingRequestCounts(
    hasSchoolManagementAccess,
  );

  // Determine which modules to show based on role (Modules section)
  let visibleModuleItems: ModuleItem[] = [];

  if (hasSchoolManagementAccess) {
    // School Head, Admin, and Registrar see all modules
    visibleModuleItems = allModuleItems;
  }
  if (isSchoolHead) {
    // Authoring school-level assessment materials is a school head function.
    visibleModuleItems = [
      ...visibleModuleItems,
      {
        title: "Assessments",
        url: "/school/assessments",
        icon: NotebookPen,
        moduleName: "school_assessments",
      },
    ];
  }
  if (hasStaffAccess) {
    // Monitoring who has encoded grades is a school head / admin function;
    // registrar and librarian have no reason to police teaching staff.
    visibleModuleItems = [
      ...visibleModuleItems,
      {
        title: "Grade Monitoring",
        url: "/grade-monitoring",
        icon: ClipboardCheck,
        moduleName: "grade_monitoring",
      },
      {
        title: "Supervision",
        url: "/supervision",
        icon: Telescope,
        moduleName: "supervision",
      },
      {
        title: "Reports",
        url: "/school-reports",
        icon: FileBarChart,
        moduleName: "school_reports",
      },
      {
        title: "Monitoring",
        url: "/monitoring",
        icon: Telescope,
        moduleName: "monitoring",
      },
    ];
  }
  // Teachers see Students in Teacher Menu (teacherItems), not in Modules

  if (isSchoolNurse) {
    // SF8 is the whole of the school nurse's work here, and the feeding
    // programme draws its beneficiaries from it.
    visibleModuleItems = [
      {
        title: "Learner Health",
        url: "/health",
        icon: Heart,
        moduleName: "learner_health",
      },
      {
        title: "Feeding Program",
        url: "/sbfp",
        icon: Soup,
        moduleName: "sbfp",
      },
    ];
  }
  if (isGuidanceCounselor) {
    visibleModuleItems = teacherMenuItems.filter((item) =>
      [
        "teacher_anecdotal",
        "teacher_manifestation",
        "teacher_cardex",
        "teacher_absenteeism",
      ].includes(
        item.moduleName,
      ),
    );
  }

  const moduleItems = visibleModuleItems;

  // Teacher Menu: show teacherItems for all users EXCEPT division_admin, tutors
  // and the support roles — the latter get their own slice above, and the full
  // teacher menu (grades, class record, examinations) is none of their work.
  const showTeacherMenu =
    !isDivisionAdmin &&
    !isTutor &&
    !isSupportRole &&
    !isQa &&
    teacherMenuItems.length > 0;

  // Tutor Menu: tutors get only their own learners view.
  const tutorItems: ModuleItem[] = [
    {
      title: "My Learners",
      url: "/tutor",
      icon: GraduationCap,
      moduleName: "tutor_learners",
    },
    {
      title: "Attendance",
      url: "/tutor/attendance",
      icon: CalendarCheck,
      moduleName: "tutor_attendance",
    },
    {
      title: "Progress Tracker",
      url: "/tutor/progress",
      icon: TrendingUp,
      moduleName: "tutor_progress",
    },
  ];
  const showTutorMenu = hasTutorAccess;

  // Settings items - built based on access
  const settingItems: { title: string; url: string; icon: typeof User }[] = [];
  if (hasStaffAccess) {
    settingItems.push({ title: "Staff", url: "/staff", icon: User });
  }
  if (hasSchoolManagementAccess) {
    settingItems.push({ title: "Rooms", url: "/rooms", icon: Building2 });
  }
  if (hasStaffAccess) {
    settingItems.push({ title: "School Settings", url: "/settings", icon: Settings });
  }

  // School Form 10 (SF10) and DepEd School Forms (for school_head, admin, registrar)
  const form137Items: ModuleItem[] = [
    {
      title: "Requests",
      url: "/manage-requests",
      icon: FileText,
      moduleName: "form137",
      badge: pendingRequests,
    },
    {
      title: "DepEd School Forms",
      url: "/reports",
      icon: FileBarChart,
      moduleName: "deped_forms",
    },
    {
      title: "Division Submissions",
      url: "/reports/division-submission",
      icon: FileBarChart,
      moduleName: "division_submission",
    },
  ];
  // The SRC and the NSBI are school head accountability documents their
  // signatories certify; a librarian has no reason to author either, and RLS
  // (migrations 112 and 154) refuses their writes regardless.
  const canAuthorSchoolReturns =
    isSchoolHead || userType === "admin" || userType === "registrar";
  const form137MenuItems = hasSchoolManagementAccess
    ? [
        ...form137Items,
        ...(canAuthorSchoolReturns
          ? [
              {
                title: "School Report Card",
                url: "/reports/school-report-card",
                icon: FileBarChart,
                moduleName: "school_report_card",
              },
              {
                title: "Building Inventory (NSBI)",
                url: "/reports/nsbi",
                icon: Warehouse,
                moduleName: "nsbi",
              },
            ]
          : []),
      ]
    : [];

  // Division Office: base items for division staff; Schools/Users appended only for super admin
  const isSuperAdmin = userType === "super admin";
  const hasDivisionOfficeNav = isDivisionAdmin || isSuperAdmin;

  const divisionBaseItems: ModuleItem[] = [
    {
      title: "SDO Reports",
      url: "/division/reports",
      icon: FileBarChart,
      moduleName: "division_reports",
    },
    {
      // The school-level reports, for one school at a time. The division office
      // has no school of its own, so the module opens with a school picker and
      // generates nothing until one is chosen.
      title: "School Reports",
      url: "/school-reports",
      icon: FileBarChart,
      moduleName: "school_reports",
    },
    {
      // SBFP Forms are compiled by the SDO; the division reads, never encodes.
      title: "Feeding Program",
      url: "/sbfp",
      icon: Soup,
      moduleName: "division_sbfp",
    },
    {
      // Migration 198: posts to every addressed employee's notification bell.
      title: "Announcements",
      url: "/division/announcements",
      icon: Megaphone,
      moduleName: "division_announcements",
    },
    {
      title: "Assessments",
      url: "/division/assessments",
      icon: NotebookPen,
      moduleName: "division_assessments",
    },
    {
      // The access and efficiency KPIs are division-level statistics: their
      // denominators are PSA projections published per division.
      title: "KPI",
      url: "/school-reports/kpi",
      icon: Gauge,
      moduleName: "division_kpi",
    },
    {
      title: "Examinations",
      url: "/division/examinations",
      icon: FileSpreadsheet,
      moduleName: "division_examinations",
    },
    {
      // Migration 195: every TOS picks its learning area and competencies here.
      title: "Competency Catalogue",
      url: "/division/competencies",
      icon: ListChecks,
      moduleName: "division_competencies",
    },
    {
      title: "DepEd School Forms",
      url: "/reports",
      icon: FileBarChart,
      moduleName: "deped_forms",
    },
    {
      // Division-wide calendar entries (the DepEd holiday list) are entered
      // here once and inherited by every school; schools add their own local
      // ones from School Settings → School Calendar.
      title: "School Calendar",
      url: "/settings/calendar",
      icon: CalendarOff,
      moduleName: "division_calendar",
    },
    {
      // Same shape as School Calendar above (migration 179): the national
      // program list is entered here once as division-wide rows and inherited
      // by every school, while a school adds its own from School Settings →
      // Special Programs. One page serves both scopes.
      title: "Special Programs",
      url: "/settings/special-programs",
      icon: Sparkles,
      moduleName: "division_special_programs",
    },
  ];

  const divisionSuperAdminItems: ModuleItem[] = [
    {
      title: "Schools",
      url: "/division/schools",
      icon: Building2,
      moduleName: "division_schools",
    },
    {
      title: "Users",
      url: "/division/users",
      icon: Users,
      moduleName: "division_users",
    },
  ];

  const divisionOfficeMenuItems: ModuleItem[] = [
    ...divisionBaseItems,
    ...(isSuperAdmin ? divisionSuperAdminItems : []),
  ];

  const qaMenuItems: ModuleItem[] = [
    { title: "QA Dashboard", url: "/qa", icon: ClipboardCheck, moduleName: "qa_dashboard" },
    { title: "Authorized Teachers", url: "/qa/authors", icon: Users, moduleName: "qa_authors" },
    { title: "Competency Catalogue", url: "/qa/competencies", icon: ListChecks, moduleName: "qa_competencies" },
  ];
  const showQaMenu = isQa || isSuperAdmin;

  // Returns true only if `url` is the most specific match for the current pathname
  // among the provided sibling URLs, preventing a parent from being active when a
  // more-specific sibling already matches.
  const getIsActive = (url: string, siblingUrls: string[]) => {
    if (pathname !== url && !pathname.startsWith(url + "/")) return false;
    return !siblingUrls.some(
      (sibling) =>
        sibling !== url &&
        sibling.length > url.length &&
        (pathname === sibling || pathname.startsWith(sibling + "/")),
    );
  };

  // Every group renders the same way; only the label, items and how a link
  // counts as active differ. `exact` keeps a link from lighting up for its
  // sub-pages (Home, and Settings whose pages are siblings, not children).
  const sections: { label?: string; items: NavItem[]; exact?: boolean; show: boolean }[] = [
    { items, exact: true, show: true },
    { label: "Modules", items: moduleItems, show: moduleItems.length > 0 },
    { label: "Tutor Menu", items: tutorItems, show: showTutorMenu },
    { label: "Teacher Menu", items: teacherMenuItems, show: showTeacherMenu },
    { label: "Division Office", items: divisionOfficeMenuItems, show: hasDivisionOfficeNav },
    { label: "Quality Assurance", items: qaMenuItems, show: showQaMenu },
    { label: "Records", items: form137MenuItems, show: form137MenuItems.length > 0 },
    { label: "Settings", items: settingItems, exact: true, show: settingItems.length > 0 },
  ];

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3">
        <Link
          href="/home"
          className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-1 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
            <Image src="/deped-logo.svg" alt="DepEd" fill className="object-contain p-1" priority />
          </div>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-bold tracking-tight text-white">
              School Management
            </span>
            <span className="truncate text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/50">
              SDO Bayugan City
            </span>
          </div>
        </Link>
      </SidebarHeader>

      {/* Scrollable in icon mode too: a long nav would otherwise leave its
          lower items unreachable once the rail collapses. */}
      <SidebarContent className="gap-0 px-1 py-2 group-data-[collapsible=icon]:overflow-y-auto">
        {sections
          .filter((section) => section.show && section.items.length > 0)
          .map((section, i) => (
            <NavSection
              key={section.label ?? i}
              label={section.label}
              items={section.items}
              isActive={(url) =>
                section.exact
                  ? pathname === url
                  : getIsActive(url, section.items.map((item) => item.url))
              }
              loadingPath={loadingPath}
              onNavigate={handleLinkClick}
            />
          ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function NavSection({
  label,
  items,
  isActive,
  loadingPath,
  onNavigate,
}: {
  label?: string;
  items: NavItem[];
  isActive: (url: string) => boolean;
  loadingPath: string | null;
  onNavigate: (url: string) => void;
}) {
  return (
    <SidebarGroup className="py-1.5">
      {label && (
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(item.url);
            const loading = loadingPath === item.url;
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className={cn(
                    "h-9 text-sidebar-foreground transition-colors hover:text-white data-[active=true]:text-white",
                    loading && "cursor-wait opacity-60",
                  )}
                >
                  <Link
                    href={item.url}
                    onClick={() => onNavigate(item.url)}
                    aria-current={active ? "page" : undefined}
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <item.icon className={active ? "text-emerald-400" : undefined} />
                    )}
                    <span>{item.title}</span>
                    {!!item.badge && (
                      <Badge
                        variant="destructive"
                        className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px] group-data-[collapsible=icon]:hidden"
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

}
