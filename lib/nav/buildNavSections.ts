/**
 * The sidebar's groups and links, as a pure function of who the user is.
 *
 * `useNavSections()` (hooks/useNavSections.ts) gathers the inputs — active
 * role, designations at the active school (216), tutor flag, module switches,
 * badge counts and the Role Permissions overrides (232) — and calls this. The
 * Role Permissions page calls it too, once per staff type with no overrides,
 * which is how it knows each type's built-in menu: the defaults are this code,
 * never a second copy of it.
 */

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
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react";

import { canEnrolLearners } from "@/lib/constants";
import {
  canOpenSbfpOverview,
  isGuidanceRole,
  isQaRole,
  isRegionAccount,
  isSbfpViewer,
} from "@/lib/constants/userTypes";

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

type RawSection = NavSection & { show: boolean };

export interface NavContext {
  /** The active role (`sms_users.type`, invariant 12). */
  userType?: string | null;
  /** A staff member who also tutors ARAL (`is_tutor`). */
  isTutor: boolean;
  /** Designations held at the active school (216). */
  hasDesignation: (designation: string) => boolean;
  pendingRequests?: number;
  helpdesk: {
    enabled: boolean;
    isStaff: boolean;
    counts?: Record<string, number> | null;
  };
  sbfpEnabled: boolean;
  needsReviewEnabled: boolean;
  /**
   * Role Permissions rows for this user's type (232): url → enabled. A url
   * not in the map keeps the built-in behaviour. Omitted = built-in menu.
   */
  overrides?: ReadonlyMap<string, boolean>;
}

export function buildNavSections(ctx: NavContext): NavSection[] {
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
  const userType = ctx.userType ?? undefined;
  const isSchoolHead =
    userType === "school_head" ||
    userType === "assistant_school_head" ||
    userType === "super admin";
  const isDivisionAdmin =
    userType === "division_admin" || userType === "division_type";
  // A pure tutor logs in with type "tutor"; a staff/teacher who was also added
  // as an ARAL tutor carries the `is_tutor` flag and keeps their normal menus.
  const isTutor = userType === "tutor";
  const hasTutorAccess = isTutor || ctx.isTutor;
  // Migration 135's two working non-teaching roles. Each gets one narrow slice
  // of the teacher menu and nothing else — they advise no section, so their
  // pages read the whole school roster via `useAdvisoryLearners`.
  const isGuidanceCounselor = isGuidanceRole(userType);
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

  // Migration 216 designations: a teacher designated Department Head or Grade
  // Level Coordinator is offered the pages that designation unlocks. Staff with
  // the Modules section already see them. A Reading Coordinator's Assessments
  // is added under Modules for every role, further down.
  const hasDesignation = ctx.hasDesignation;
  const designeeItems: ModuleItem[] = [];
  if (!hasSchoolManagementAccess) {
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

  // Pending work behind the Records → Requests item (the hook counts it).
  const pendingRequests = ctx.pendingRequests;

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
      // Migration 227: their own school's row of the division's Needs Review.
      // School head and admin only — not the assistant head, and not a super
      // admin, who has the division-wide page.
      ...(userType === "school_head" || userType === "admin"
        ? [
            {
              title: "Needs Review",
              url: "/needs-review",
              icon: ClipboardCheck,
              moduleName: "needs_review",
            },
          ]
        : []),
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
  // A Reading Coordinator (migration 216) authors the school's CRLA / Phil-IRI
  // / RMA materials under Modules → Assessments, whatever role they act as —
  // not in the Teacher Menu, which already has the adviser's own Assessments.
  const assessmentsForCoordinator: ModuleItem[] =
    hasDesignation("reading_coordinator") &&
    !visibleModuleItems.some((item) => item.url === "/school/assessments")
      ? [
          {
            title: "Assessments",
            url: "/school/assessments",
            icon: NotebookPen,
            moduleName: "school_assessments",
          },
        ]
      : [];
  // An SBFP Coordinator (migration 229) whose menus do not already carry the
  // module, such as a guidance counselor, is offered it under Modules.
  const sbfpReachable =
    (showTeacherMenu && teacherMenuItems.some((item) => item.url === "/sbfp")) ||
    visibleModuleItems.some((item) => item.url === "/sbfp");
  const moduleItems: ModuleItem[] = [
    ...visibleModuleItems,
    ...assessmentsForCoordinator,
    ...(hasDesignation("sbfp_coordinator") && !sbfpReachable
      ? [
          {
            title: "Feeding Program",
            url: "/sbfp",
            icon: Soup,
            moduleName: "sbfp",
          },
        ]
      : []),
    ...(hasDesignation("department_head") && !departmentReachable
      ? [
          {
            title: "Department",
            url: "/department",
            icon: BarChart3,
            moduleName: "department",
          },
        ]
      : []),
  ];

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
      // Migration 226: which schools have not yet encoded each module.
      title: "Needs Review",
      url: "/division/needs-review",
      icon: ClipboardCheck,
      moduleName: "division_needs_review",
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
      // Every module on/off switch (Feeding Program 221, Needs Review 227,
      // Help Desk 218) and Region Account Access (214) on one page — add a
      // new switch there, not here.
      title: "Module Settings",
      url: "/division/module-settings",
      icon: SlidersHorizontal,
      moduleName: "division_module_settings",
    },
    {
      // Migration 232: which menu pages each staff type gets.
      title: "Role Permissions",
      url: "/division/permissions",
      icon: ShieldCheck,
      moduleName: "division_permissions",
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
  const helpdesk = ctx.helpdesk;
  const showHelpdesk = helpdesk.enabled && !isRegion;
  const helpdeskCounts = helpdesk.counts;
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
  const sbfp = { enabled: ctx.sbfpEnabled };
  const withoutSbfp = (list: NavItem[]) =>
    sbfp.enabled
      ? list
      : list.filter((item) => item.url !== "/sbfp" && item.url !== "/sbfp-viewer");

  // Migration 227: the same for Needs Review, at both levels. The settings
  // page stays, and is how a super admin opens it while it is off.
  const needsReview = { enabled: ctx.needsReviewEnabled };
  const withoutNeedsReview = (list: NavItem[]) =>
    needsReview.enabled
      ? list
      : list.filter((item) => item.url !== "/division/needs-review" && item.url !== "/needs-review");

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

  const withOverrides = ctx.overrides
    ? applyMenuOverrides(sections, ctx.overrides)
    : sections;

  return withOverrides
    .map((section) => ({
      ...section,
      items: withoutNeedsReview(withoutSbfp(section.items)).filter(
        (item) => item.url !== "/sbfp-viewer" || canOpenSbfpOverview(userType),
      ),
    }))
    .filter((section) => section.show && section.items.length > 0)
    .map(({ label, items, exact }) => ({ label, items, exact }));
}

// ---------------------------------------------------------------------------
// Role Permissions (migration 232)
// ---------------------------------------------------------------------------

/**
 * Staff types the super admin sets menus for. Left out, deliberately: the
 * super admin (always everything), the Region Account (its own switches, 214),
 * the SBFP Viewer (two fixed pages, 222), a pure tutor (their own menu) and
 * the login-disabled personnel roles (135/158).
 */
export const MENU_ACCESS_USER_TYPES = [
  "school_head",
  "assistant_school_head",
  "admin",
  "registrar",
  "librarian",
  "teacher",
  "volunteer_teacher",
  "guidance_counselor",
  "school_counselor_associate",
  "school_nurse",
  "qa",
  "division_admin",
  "division_type",
] as const;

/**
 * Pages the matrix never offers: Home is everybody's, the Help Desk has its own
 * switch (218), and these stay with the super admin alone — handing out Users
 * or this very page would let a role give itself anything.
 */
const NOT_IN_MATRIX = new Set([
  "/home",
  "/helpdesk",
  "/helpdesk/inbox",
  "/division/schools",
  "/division/users",
  "/division/module-settings",
  "/division/permissions",
]);

export interface MenuCatalogueItem {
  url: string;
  title: string;
  icon: typeof Home;
  /** The menu group it sits in by default, e.g. "Modules", "Teacher Menu". */
  section: string;
}

const neutralContext = (
  userType: string,
  withDesignations: boolean,
): NavContext => ({
  userType,
  isTutor: false,
  hasDesignation: () => withDesignations,
  helpdesk: { enabled: false, isStaff: false },
  sbfpEnabled: true,
  needsReviewEnabled: true,
});

let catalogueCache: MenuCatalogueItem[] | null = null;

/**
 * Every page the matrix can tick, in menu order: the union of the built-in
 * menus of every staff type above, with and without designations. The first
 * place a page appears gives its title and its group.
 */
export function menuCatalogue(): MenuCatalogueItem[] {
  if (catalogueCache) return catalogueCache;
  const byUrl = new Map<string, MenuCatalogueItem & { order: number }>();
  const sectionOrder: string[] = [];
  for (const withDesignations of [false, true]) {
    for (const type of [...MENU_ACCESS_USER_TYPES, "super admin"]) {
      for (const section of buildNavSections(neutralContext(type, withDesignations))) {
        const label = section.label ?? "";
        if (!sectionOrder.includes(label)) sectionOrder.push(label);
        for (const item of section.items) {
          if (NOT_IN_MATRIX.has(item.url) || byUrl.has(item.url)) continue;
          byUrl.set(item.url, {
            url: item.url,
            title: item.title,
            icon: item.icon,
            section: label,
            order: byUrl.size,
          });
        }
      }
    }
  }
  catalogueCache = [...byUrl.values()]
    .sort(
      (a, b) =>
        sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section) ||
        a.order - b.order,
    )
    .map(({ url, title, icon, section }) => ({ url, title, icon, section }));
  return catalogueCache;
}

/** The pages a staff type gets with no Role Permissions rows. */
export function defaultMenuUrls(userType: string): Set<string> {
  const urls = new Set<string>();
  for (const section of buildNavSections(neutralContext(userType, false))) {
    for (const item of section.items) {
      if (!NOT_IN_MATRIX.has(item.url)) urls.add(item.url);
    }
  }
  return urls;
}

/**
 * The catalogue page a path belongs to — the longest catalogue url that is the
 * path itself or a parent of it — or null when it is no catalogue page.
 */
export function menuItemForPath(pathname: string): string | null {
  let best: string | null = null;
  for (const { url } of menuCatalogue()) {
    if (
      (pathname === url || pathname.startsWith(`${url}/`)) &&
      (best === null || url.length > best.length)
    ) {
      best = url;
    }
  }
  return best;
}

/**
 * Removes the pages switched off for this type from every group, and adds the
 * pages switched on that the built-in menu lacks to their default group. A
 * group this type does not normally see is shown carrying only the added
 * pages, never its built-in contents.
 */
function applyMenuOverrides(
  sections: RawSection[],
  overrides: ReadonlyMap<string, boolean>,
): RawSection[] {
  const result: RawSection[] = sections.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => NOT_IN_MATRIX.has(item.url) || overrides.get(item.url) !== false,
    ),
  }));

  const present = new Set(
    result.filter((s) => s.show).flatMap((s) => s.items.map((i) => i.url)),
  );
  const extras = menuCatalogue().filter(
    (item) => overrides.get(item.url) === true && !present.has(item.url),
  );

  for (const extra of extras) {
    const item: NavItem = { title: extra.title, url: extra.url, icon: extra.icon };
    const shown = result.find((s) => s.show && (s.label ?? "") === extra.section);
    if (shown) {
      shown.items = [...shown.items, item];
      continue;
    }
    const hiddenIndex = result.findIndex(
      (s) => !s.show && (s.label ?? "") === extra.section,
    );
    if (hiddenIndex >= 0) {
      result[hiddenIndex] = { ...result[hiddenIndex], items: [item], show: true };
    } else {
      result.push({ label: extra.section, items: [item], show: true });
    }
  }
  return result;
}
