import {
  BookMarked,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileBarChart,
  FileText,
  GraduationCap,
  Heart,
  type LucideIcon,
  Settings,
  User,
  Users,
} from "lucide-react";

type UserType =
  | "school_head"
  | "super admin"
  | "admin"
  | "registrar"
  | "librarian"
  | "teacher"
  | "division_admin";

export interface WorkflowStep {
  title: string;
  description: string;
  tip?: string;
}

export interface ModuleGuide {
  id: string;
  title: string;
  icon: LucideIcon;
  category: string;
  description: string;
  allowedRoles: UserType[];
  steps: WorkflowStep[];
}

export interface GuideCategory {
  id: string;
  label: string;
  modules: ModuleGuide[];
}

const schoolManagementRoles: UserType[] = [
  "school_head",
  "super admin",
  "admin",
  "registrar",
  "librarian",
];

const staffAccessRoles: UserType[] = ["school_head", "super admin", "admin"];

const teacherMenuRoles: UserType[] = [
  "school_head",
  "super admin",
  "admin",
  "registrar",
  "librarian",
  "teacher",
];

const ALL_GUIDES: ModuleGuide[] = [
  // ── Initial Setup ──
  {
    id: "staff",
    title: "Staff",
    icon: User,
    category: "setup",
    description:
      "Manage staff members who will use the system — add accounts and assign roles.",
    allowedRoles: staffAccessRoles,
    steps: [
      {
        title: "Navigate to Staff",
        description:
          "Open the Staff module from the Settings section in the sidebar.",
      },
      {
        title: "Add Staff Members",
        description:
          "Click the Add button and fill in staff details: name, email, contact information, and position.",
      },
      {
        title: "Assign Roles",
        description:
          "Set each staff member's role: School Head, Admin, Registrar, Teacher, or Librarian. This determines their system access.",
        tip: "Teachers will see the Teacher Menu; Admin and School Head get full module access.",
      },
      {
        title: "Credentials Sent",
        description:
          "Staff members receive their login credentials via email and can begin using the system.",
      },
    ],
  },
  {
    id: "rooms",
    title: "Rooms",
    icon: Building2,
    category: "setup",
    description:
      "Set up classrooms and facilities that will be used for scheduling.",
    allowedRoles: schoolManagementRoles,
    steps: [
      {
        title: "Open Rooms Module",
        description: "Navigate to Rooms under the Settings section.",
      },
      {
        title: "Add Rooms",
        description:
          "Click Add and enter room details: room number/name and seating capacity.",
      },
      {
        title: "Rooms Ready",
        description:
          "Rooms are now available for assignment when creating class schedules.",
        tip: "The system will check for room conflicts when scheduling.",
      },
    ],
  },
  {
    id: "subjects",
    title: "Subjects",
    icon: BookOpen,
    category: "setup",
    description:
      "Define the subjects/courses offered at your school for each grade level.",
    allowedRoles: schoolManagementRoles,
    steps: [
      {
        title: "Open Subjects Module",
        description: "Navigate to Subjects from the Modules section.",
      },
      {
        title: "Add Subjects",
        description:
          "Create subjects with name, subject code, and applicable grade level(s).",
        tip: "Subjects are linked to grade levels, so they automatically appear for matching sections.",
      },
      {
        title: "Subjects Available",
        description:
          "Subjects can now be assigned to sections and used in schedule creation.",
      },
    ],
  },
  {
    id: "sections",
    title: "Sections",
    icon: Users,
    category: "setup",
    description:
      "Create class sections and assign advisers before enrolling students.",
    allowedRoles: schoolManagementRoles,
    steps: [
      {
        title: "Open Sections Module",
        description: "Navigate to Sections from the Modules section.",
      },
      {
        title: "Create Sections",
        description:
          "Add sections with name, grade level, and school year. Each section represents a class group.",
      },
      {
        title: "Assign Adviser",
        description:
          "Select a teacher as the section adviser. The adviser can manage grades and view the section roster.",
      },
      {
        title: "Ready for Enrollment",
        description:
          "Sections are now available for student enrollment and schedule assignments.",
      },
    ],
  },

  // ── Core Modules ──
  {
    id: "enrollment",
    title: "Enrollment",
    icon: ClipboardList,
    category: "core",
    description:
      "Enroll students into sections for the current school year.",
    allowedRoles: [...schoolManagementRoles, "teacher"],
    steps: [
      {
        title: "Open Enrollment",
        description: "Navigate to the Enrollment module from the sidebar.",
      },
      {
        title: "Search or Add Student",
        description:
          "Search for an existing student by name or LRN. If the student is new, create a new student record.",
      },
      {
        title: "Select Section",
        description:
          "Choose the school year, grade level, and section to enroll the student in.",
      },
      {
        title: "Submit Enrollment",
        description:
          "Confirm and submit the enrollment. The student now appears in the section roster.",
      },
      {
        title: "Review & Approve",
        description:
          "Administrators can review pending enrollments and approve or flag them as needed.",
        tip: "Enrolled students automatically appear in attendance, grade entry, and book issuance lists.",
      },
    ],
  },
  {
    id: "students",
    title: "Students",
    icon: GraduationCap,
    category: "core",
    description:
      "View, search, and manage all student records in the school.",
    allowedRoles: schoolManagementRoles,
    steps: [
      {
        title: "Open Students Module",
        description: "Navigate to Students from the Modules section.",
      },
      {
        title: "Filter & Search",
        description:
          "Use filters for grade level, section, and school year. Search by name or LRN to find specific students.",
      },
      {
        title: "View Student Profile",
        description:
          "Click a student to see their full profile: personal info, guardian details, enrollment history.",
      },
      {
        title: "Edit Information",
        description:
          "Update student data as needed — personal details, contact info, and guardian information.",
      },
    ],
  },
  {
    id: "schedules",
    title: "Schedules",
    icon: Calendar,
    category: "core",
    description:
      "Create and manage class schedules per section via Sections → Manage Schedules, assigning teachers, rooms, and time slots.",
    allowedRoles: schoolManagementRoles,
    steps: [
      {
        title: "Open Sections Module",
        description:
          "Navigate to Sections from the Modules section, then click Manage Schedules for the target section.",
      },
      {
        title: "Add Schedule Entries",
        description:
          "For each entry, select the subject, teacher, room, day(s), and time slot.",
      },
      {
        title: "Conflict Validation",
        description:
          "The system automatically checks for conflicts — a teacher, room, or section cannot be double-booked.",
        tip: "Use the Calendar View to visualize the full weekly schedule at a glance.",
      },
      {
        title: "Schedule Published",
        description:
          "Once complete, the schedule appears on teacher dashboards and can be used for attendance tracking.",
      },
    ],
  },
  {
    id: "books",
    title: "Books",
    icon: BookMarked,
    category: "core",
    description:
      "Track textbook allocations from managers to teachers, and issuances from teachers to students.",
    allowedRoles: schoolManagementRoles,
    steps: [
      {
        title: "Open Books Module",
        description:
          "Navigate to Books. You'll see two sub-modules: Allocations and Issuances.",
      },
      {
        title: "Create Allocations",
        description:
          "In Allocations, the book manager assigns books to teachers — specify title and quantity.",
      },
      {
        title: "Teacher Receives Books",
        description:
          "Teachers see their allocated books in their Teacher Menu > Books view.",
      },
      {
        title: "Issue to Students",
        description:
          "In Issuances, teachers issue individual books to students in their sections.",
      },
      {
        title: "Track Returns",
        description:
          "When students return books, record the return with a code: FM (Fully Maintained), TDO (Torn/Damaged/Others), or NEG (Negligence).",
        tip: "Book counts update automatically — you can track how many are issued vs. returned at any time.",
      },
    ],
  },
  {
    id: "attendance",
    title: "Attendance",
    icon: CheckCircle2,
    category: "core",
    description:
      "Record daily student attendance by section. Accessible via Sections → section page.",
    allowedRoles: schoolManagementRoles,
    steps: [
      {
        title: "Open Attendance",
        description:
          "Navigate to the Sections module, open a section, and go to its Attendance tab.",
      },
      {
        title: "Select Section & Date",
        description:
          "Choose the section, school year, and date you want to record attendance for.",
      },
      {
        title: "Mark Attendance",
        description:
          "Mark each student as Present, Absent, Tardy, or Excused for the selected date.",
      },
      {
        title: "View Reports",
        description:
          "Review attendance summaries to identify patterns and generate reports.",
      },
    ],
  },
  {
    id: "health",
    title: "Learner Health",
    icon: Heart,
    category: "core",
    description:
      "Record student health data (height, weight, vision) for DepEd SF8 reporting. Accessible via Sections → section page.",
    allowedRoles: schoolManagementRoles,
    steps: [
      {
        title: "Open Learner Health",
        description:
          "Navigate to the Sections module, open a section, and go to its Health tab.",
      },
      {
        title: "Select Section",
        description:
          "Choose a section and school year to view students for health recording.",
      },
      {
        title: "Record Health Data",
        description:
          "Enter each student's height, weight, vision screening results, and other health metrics.",
      },
      {
        title: "Nutritional Status",
        description:
          "The system automatically calculates BMI and nutritional status based on the recorded data.",
        tip: "This data feeds directly into the DepEd SF8 (Learner Health) report.",
      },
      {
        title: "Generate SF8",
        description:
          "Go to DepEd School Forms > SF8 to generate the official report with the recorded data.",
      },
    ],
  },

  // ── Teacher Menu ──
  {
    id: "teacher_dashboard",
    title: "Teacher Dashboard",
    icon: Settings,
    category: "teacher",
    description:
      "A quick overview of your assigned sections, subjects, and schedule.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open Dashboard",
        description:
          "Navigate to Dashboard under the Teacher Menu section.",
      },
      {
        title: "View Assignments",
        description:
          "See all sections where you are the adviser and subjects assigned to you at a glance.",
      },
      {
        title: "Quick Navigation",
        description:
          "Click on any section or subject card to jump directly to its details.",
      },
    ],
  },
  {
    id: "teacher_sections",
    title: "My Sections",
    icon: Users,
    category: "teacher",
    description:
      "View and manage the sections where you are assigned as adviser.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open My Sections",
        description: "Navigate to My Sections under the Teacher Menu.",
      },
      {
        title: "View Section List",
        description:
          "See all sections where you are the assigned adviser for the current school year.",
      },
      {
        title: "View Student Roster",
        description:
          "Click a section to see the full list of enrolled students.",
      },
    ],
  },
  {
    id: "teacher_subjects",
    title: "My Subjects",
    icon: BookOpen,
    category: "teacher",
    description:
      "View the subjects you teach and their section assignments.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open My Subjects",
        description: "Navigate to My Subjects under the Teacher Menu.",
      },
      {
        title: "View Subject Assignments",
        description:
          "See all subjects assigned to you via the schedule, along with which sections you teach them in.",
      },
      {
        title: "Access Grade Entry",
        description:
          "Click a subject-section to view enrolled students and enter grades.",
      },
    ],
  },
  {
    id: "teacher_grades",
    title: "Grade Entry",
    icon: FileText,
    category: "teacher",
    description:
      "Enter and manage student grades for each grading period.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Select Subject & Section",
        description:
          "From My Subjects, select the subject and section you want to enter grades for.",
      },
      {
        title: "Choose Grading Period",
        description:
          "Select the grading period (1st, 2nd, 3rd, or 4th quarter).",
      },
      {
        title: "Enter Grades",
        description:
          "Input grades for each student. The system validates that you are the assigned teacher or section adviser.",
        tip: "You must appear in the subject schedule or be the section adviser to enter grades.",
      },
      {
        title: "Save Grades",
        description:
          "Save the entered grades. They become visible to students in the Student Portal.",
      },
      {
        title: "Review & Finalize",
        description:
          "Review all grades before the period ends. Saved grades feed into DepEd SF reports.",
      },
    ],
  },
  {
    id: "teacher_books",
    title: "Teacher Books",
    icon: BookMarked,
    category: "teacher",
    description:
      "Manage books allocated to you — issue to students and process returns.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "View Allocated Books",
        description:
          "Open Books from the Teacher Menu to see books allocated to you by the book manager.",
      },
      {
        title: "Issue to Students",
        description:
          "Select students in your sections and issue books to them individually.",
      },
      {
        title: "Process Returns",
        description:
          "When students return books, record the return with the appropriate code: FM, TDO, or NEG.",
      },
      {
        title: "Return to Manager",
        description:
          "At the end of the period, return remaining books back to the book manager.",
      },
    ],
  },

  // ── Records ──
  {
    id: "requests",
    title: "Form Requests",
    icon: FileText,
    category: "records",
    description:
      "Handle incoming requests for Form 137, SF10, and other official documents.",
    allowedRoles: schoolManagementRoles,
    steps: [
      {
        title: "Open Requests",
        description: "Navigate to Requests under the Records section.",
      },
      {
        title: "View Incoming Requests",
        description:
          "See all pending document requests submitted by students, parents, or other schools.",
      },
      {
        title: "Review Details",
        description:
          "Click a request to view the details: student information, document type, and purpose.",
      },
      {
        title: "Process Request",
        description:
          "Update the status: Pending, Approved, or Completed. Add notes if needed.",
      },
      {
        title: "Release Documents",
        description:
          "Generate and release the requested documents to the requester.",
      },
    ],
  },
  {
    id: "deped_forms",
    title: "DepEd School Forms",
    icon: FileBarChart,
    category: "records",
    description:
      "Generate official DepEd School Forms (SF1 through SF10) for submission.",
    allowedRoles: [...schoolManagementRoles, "division_admin"],
    steps: [
      {
        title: "Open DepEd School Forms",
        description:
          "Navigate to DepEd School Forms under Records (or Division Office for division admins).",
      },
      {
        title: "Select Form Type",
        description:
          "Choose the form to generate: SF1 (School Register), SF2 (Daily Attendance), SF4-SF6 (Reports), SF8 (Health), SF9 (Progress Report), SF10 (Learner's Card).",
      },
      {
        title: "Set Filters",
        description:
          "Select school year, grade level, and section to narrow the data.",
      },
      {
        title: "Preview Form",
        description:
          "Review the auto-populated form with data from enrollment, grades, attendance, and health records.",
        tip: "Ensure all source data is complete before generating — missing grades or attendance will show as blank.",
      },
      {
        title: "Export as PDF",
        description:
          "Download the form as a PDF file ready for printing or submission to DepEd.",
      },
    ],
  },

  // ── Division Office ──
  {
    id: "division_schools",
    title: "Schools",
    icon: Building2,
    category: "division",
    description:
      "Manage all schools under the division — view, add, and monitor school data.",
    allowedRoles: ["division_admin"],
    steps: [
      {
        title: "Open Schools",
        description: "Navigate to Schools under the Division Office section.",
      },
      {
        title: "View All Schools",
        description:
          "Browse the list of all schools in the division with key statistics.",
      },
      {
        title: "Add or Edit Schools",
        description:
          "Add new schools or update existing school information: name, address, type, district.",
      },
      {
        title: "Monitor Status",
        description:
          "Track enrollment numbers and data completion status across schools.",
      },
    ],
  },
  {
    id: "division_users",
    title: "Users",
    icon: Users,
    category: "division",
    description:
      "Manage user accounts across all schools in the division.",
    allowedRoles: ["division_admin"],
    steps: [
      {
        title: "Open Users",
        description: "Navigate to Users under the Division Office section.",
      },
      {
        title: "View All Users",
        description:
          "See all system users across schools, filterable by school and role.",
      },
      {
        title: "Create User Accounts",
        description:
          "Add new users, assign them to a school, and set their role.",
      },
      {
        title: "Manage Access",
        description:
          "Update user roles, reassign to different schools, or deactivate accounts.",
      },
    ],
  },
  {
    id: "division_reports",
    title: "Division Reports",
    icon: FileBarChart,
    category: "division",
    description:
      "Generate aggregated reports across all schools in the division.",
    allowedRoles: ["division_admin"],
    steps: [
      {
        title: "Open Division Reports",
        description:
          "Navigate to Division Reports under the Division Office section.",
      },
      {
        title: "Select Report Type",
        description:
          "Choose the type of report and set parameters like school year and school filter.",
      },
      {
        title: "View Aggregated Data",
        description:
          "Review division-wide data compiled from all schools.",
      },
      {
        title: "Export Reports",
        description:
          "Download reports for division-level submissions to DepEd regional office.",
      },
    ],
  },
];

const CATEGORIES: { id: string; label: string }[] = [
  { id: "setup", label: "Initial Setup" },
  { id: "core", label: "Core Modules" },
  { id: "teacher", label: "Teacher Menu" },
  { id: "records", label: "Records" },
  { id: "division", label: "Division Office" },
];

export function getVisibleGuides(userType: string): GuideCategory[] {
  const filtered = ALL_GUIDES.filter((guide) =>
    guide.allowedRoles.includes(userType as UserType)
  );

  return CATEGORIES.map((cat) => ({
    id: cat.id,
    label: cat.label,
    modules: filtered.filter((g) => g.category === cat.id),
  })).filter((cat) => cat.modules.length > 0);
}
