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
  Eye,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Gauge,
  GraduationCap,
  Heart,
  Home,
  CalendarX,
  IdCard,
  LayoutDashboard,
  Inbox,
  LifeBuoy,
  ListChecks,
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

import { usePendingRequestCounts } from "@/hooks/usePendingRequestCounts";
import { useDesignations } from "@/hooks/useDesignations";
import { useHelpdeskAccess, useHelpdeskCounts } from "@/hooks/useHelpdesk";
import { useSbfpEnabled } from "@/hooks/useSbfpEnabled";
import { canEnrolLearners } from "@/lib/constants";
import {
  canOpenSbfpOverview,
  isQaRole,
  isRegionAccount,
  isSbfpViewer,
} from "@/lib/constants/userTypes";
import { useAppSelector } from "@/lib/redux/hook";

/** One link in the sidebar. */
export interface NavItem {
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

export interface NavSection {
  label?: string;
  items: NavItem[];
  /** The link lights up only on its own page, not its sub-pages. */
  exact?: boolean;
}

/**
 * The sidebar's groups and links for the signed-in user: their active role,
 * their designations at the active school (216) and the tutor flag. The
 * sidebar renders it, and the role dialog on the avatar menu lists the same
 * thing, so "what can I open" is answered in one place.
 *
 * `withCounts` runs the pending-request count queries behind the Requests
 * badge; only the sidebar needs them.
 */
export function useNavSections({ withCounts = false }: { withCounts?: boolean } = {}): NavSection[] {
  const user = useAppSelector((state) => state.user.user);

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
  // Migration 214: views the division dashboard and the SDO Reports a super
  // admin has switched on, and nothing else.
  const isRegion = isRegionAccount(userType);

  // A volunteer teacher (migration 139) works the whole Teacher Menu except
  // enrolment, so the one module they may not use is not offered. The route and
  // the database refuse it as well — this only keeps the menu honest.
  const baseTeacherMenuItems = canEnrolLearners(userType)
    ? teacherItems
    : teacherItems.filter((item) => item.moduleName !== "enrollment");

  // School management access: school_head, admin, registrar, librarian have similar functions
  const hasSchoolManagementAccess =
    isSchoolHead ||
    userType === "admin" ||
    userType === "registrar" ||
    userType === "librarian";

  // Migration 216 designations: a teacher designated Reading Coordinator,
  // Department Head or Grade Level Coordinator is offered the pages that
  // designation unlocks. Staff with the Modules section already see them.
  const { has: hasDesignation } = useDesignations();
  const designeeItems: ModuleItem[] = [];
  if (!hasSchoolManagementAccess) {
    if (hasDesignation("reading_coordinator")) {
      designeeItems.push({
        title: "Assessments",
        url: "/school/assessments",
        icon: NotebookPen,
        moduleName: "school_assessments",
      });
    }
    if (hasDesignation("department_head")) {
      designeeItems.push(
        {
          title: "Department",
          url: "/department",
          icon: BarChart3,
          moduleName: "department",
        },
        {
          title: "Subjects",
          url: "/subjects",
          icon: BookOpen,
          moduleName: "subjects",
        },
        {
          title: "Schedules",
          url: "/schedules",
          icon: Calendar,
          moduleName: "schedules",
        },
      );
    }
    if (hasDesignation("grade_level_coordinator")) {
      designeeItems.push(
        {
          title: "Sections",
          url: "/sections",
          icon: Users,
          moduleName: "sections",
        },
        {
          title: "Schedules",
          url: "/schedules",
          icon: Calendar,
          moduleName: "schedules",
        },
      );
    }
  }
  const teacherMenuItems = [...baseTeacherMenuItems];
  for (const item of designeeItems) {
    if (!teacherMenuItems.some((t) => t.url === item.url)) {
      teacherMenuItems.push(item);
    }
  }

  // Staff page: only admin and school_head can access (registrar cannot)
  const hasStaffAccess = isSchoolHead || userType === "admin";

  // Pending work behind the Records → Requests item. Only the roles that get
  // that menu entry pay for the three count queries.
  const { total: pendingRequests } = usePendingRequestCounts(
    withCounts && hasSchoolManagementAccess,
  );

  // Determine which modules to show based on role (Modules section)
  let visibleModuleItems: ModuleItem[] = [];

  if (hasSchoolManagementAccess) {
    // School Head, Admin, and Registrar see all modules
    visibleModuleItems = allModuleItems;
  }
  if (hasStaffAccess) {
    // Authoring school-level assessment materials is a school head / admin
    // function. Storage write policies for the material files: migration 215.
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

  // Teacher Menu: show teacherItems for all users EXCEPT division_admin, tutors
  // and the support roles — the latter get their own slice above, and the full
  // teacher menu (grades, class record, examinations) is none of their work.
  const showTeacherMenu =
    !isDivisionAdmin &&
    !isTutor &&
    !isSupportRole &&
    !isQa &&
    !isRegion &&
    teacherMenuItems.length > 0;

  // /department exists in no other menu, so a Department Head whose Teacher
  // Menu does not carry it (a school head, admin, registrar or librarian acting
  // in that role, or a role with no Teacher Menu) is offered it under Modules.
  const departmentReachable =
    (showTeacherMenu &&
      teacherMenuItems.some((item) => item.url === "/department")) ||
    visibleModuleItems.some((item) => item.url === "/department");
  const moduleItems: ModuleItem[] =
    hasDesignation("department_head") && !departmentReachable
      ? [
          ...visibleModuleItems,
          {
            title: "Department",
            url: "/department",
            icon: BarChart3,
            moduleName: "department",
          },
        ]
      : visibleModuleItems;

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
      // Migration 222: the division-wide dashboard the SBFP Viewer sees.
      title: "Feeding Program Overview",
      url: "/sbfp-viewer",
      icon: LayoutDashboard,
      moduleName: "division_sbfp_overview",
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
    {
      // Migration 214: what a Region Account may see.
      title: "Region Account Access",
      url: "/division/region-access",
      icon: Eye,
      moduleName: "division_region_access",
    },
    {
      // Migration 218: the Help Desk's on/off switch and staff list.
      title: "Help Desk Settings",
      url: "/division/helpdesk",
      icon: LifeBuoy,
      moduleName: "division_helpdesk",
    },
    {
      // Migration 221: the Feeding Program's on/off switch.
      title: "Feeding Program Settings",
      url: "/division/sbfp-settings",
      icon: Soup,
      moduleName: "division_sbfp_settings",
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

  // The reports index lists only the reports switched on for this account.
  const regionMenuItems: ModuleItem[] = [
    {
      title: "SDO Reports",
      url: "/division/reports",
      icon: FileBarChart,
      moduleName: "region_reports",
    },
  ];

  // Help Desk (migration 218): offered to every user with a login while a
  // super admin has it switched on; the inbox only to those who answer it.
  // A Region Account is kept to its reports by RegionAccountGuard.
  const helpdesk = useHelpdeskAccess();
  const showHelpdesk = helpdesk.enabled && !isRegion;
  const helpdeskCounts = useHelpdeskCounts(
    withCounts && showHelpdesk ? (helpdesk.isStaff ? "staff" : "submitter") : null,
  );
  const helpdeskItems: NavItem[] = helpdesk.isStaff
    ? [
        { title: "My Concerns", url: "/helpdesk", icon: LifeBuoy },
        { title: "Help Desk Inbox", url: "/helpdesk/inbox", icon: Inbox, badge: helpdeskCounts?.attention },
      ]
    : [{ title: "Help Desk", url: "/helpdesk", icon: LifeBuoy, badge: helpdeskCounts?.replies }];

  // Every group renders the same way; only the label, items and how a link
  // counts as active differ. `exact` keeps a link from lighting up for its
  // sub-pages (Home, and Settings whose pages are siblings, not children).
  const sections: (NavSection & { show: boolean })[] = [
    { items, exact: true, show: true },
    { label: "Modules", items: moduleItems, show: moduleItems.length > 0 },
    { label: "Tutor Menu", items: tutorItems, show: showTutorMenu },
    { label: "Teacher Menu", items: teacherMenuItems, show: showTeacherMenu },
    { label: "Division Office", items: divisionOfficeMenuItems, show: hasDivisionOfficeNav },
    { label: "Quality Assurance", items: qaMenuItems, show: showQaMenu },
    { label: "Division Reports", items: regionMenuItems, show: isRegion },
    { label: "Records", items: form137MenuItems, show: form137MenuItems.length > 0 },
    { label: "Settings", items: settingItems, exact: true, show: settingItems.length > 0 },
    { label: "Support", items: helpdeskItems, exact: true, show: showHelpdesk },
  ];

  // Migration 221: a super admin may switch the Feeding Program off, which
  // drops its link from every group it appears in.
  const sbfp = useSbfpEnabled();
  const withoutSbfp = (list: NavItem[]) =>
    sbfp.enabled
      ? list
      : list.filter((item) => item.url !== "/sbfp" && item.url !== "/sbfp-viewer");

  // Migration 222: an SBFP Viewer has its own two pages and nothing else; this
  // is also what the role dialog lists for them.
  if (isSbfpViewer(userType)) {
    return [
      {
        label: "Feeding Program",
        items: [
          { title: "Dashboard", url: "/sbfp-viewer", icon: LayoutDashboard },
          { title: "Reports", url: "/sbfp-viewer/reports", icon: FileBarChart },
        ],
        exact: true,
      },
    ];
  }

  return sections
    .map((section) => ({
      ...section,
      items: withoutSbfp(section.items).filter(
        (item) => item.url !== "/sbfp-viewer" || canOpenSbfpOverview(userType),
      ),
    }))
    .filter((section) => section.show && section.items.length > 0)
    .map(({ label, items, exact }) => ({ label, items, exact }));
}
