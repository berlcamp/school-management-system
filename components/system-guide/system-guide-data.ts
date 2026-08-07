import {
  BarChart3,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Heart,
  IdCard,
  type LucideIcon,
  NotebookPen,
  NotebookText,
  Settings,
  Sprout,
  Tags,
  Telescope,
  TrendingUp,
  User,
  Users,
} from "lucide-react";

type UserType =
  | "school_head"
  | "assistant_school_head"
  | "super admin"
  | "admin"
  | "registrar"
  | "librarian"
  | "teacher"
  | "tutor"
  | "division_admin"
  | "division_type";

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
  "assistant_school_head",
  "super admin",
  "admin",
  "registrar",
  "librarian",
];

const staffAccessRoles: UserType[] = [
  "school_head",
  "assistant_school_head",
  "super admin",
  "admin",
];

const teacherMenuRoles: UserType[] = [
  "school_head",
  "assistant_school_head",
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
    id: "teacher_class_record",
    title: "Class Record",
    icon: BookOpenCheck,
    category: "teacher",
    description:
      "Keep the DepEd class record for each subject you teach, then post the computed grade to the grading sheet.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open Class Record",
        description:
          "Navigate to Class Record under the Teacher Menu, then choose the school year and the subject–section you are recording for.",
        tip: "Only subject–sections assigned to you in the schedule appear in the list.",
      },
      {
        title: "Select the Period",
        description:
          "Pick the quarter (or term, for term-based school years) and set its start and end dates.",
      },
      {
        title: "Add Assessment Items",
        description:
          "Add Written Works and Performance Task items with their Highest Possible Score. Summative Tests (ST1, ST2) and the Term Exam are fixed columns — you only set their weights and HPS.",
      },
      {
        title: "Set Component Weights",
        description:
          "Enter the weight for Written Works, Performance Tasks, and Summative Tests. The badge must read 100% before grades can be posted.",
      },
      {
        title: "Enter Raw Scores",
        description:
          "Type each learner's raw score per item. Scores save as you type and the Initial Grade is computed automatically.",
        tip: "Tick Transmute if your school converts the initial grade using the DepEd transmutation table.",
      },
      {
        title: "Post Grades",
        description:
          "Click Post Grades to push the final grade into the grading sheet, where it feeds report cards, DepEd forms, and the Student Portal.",
      },
    ],
  },
  {
    id: "teacher_assessments",
    title: "Assessments",
    icon: NotebookPen,
    category: "teacher",
    description:
      "Record the DepEd diagnostic assessments for your advisory class: CRLA, Phil-IRI, RMA, and PABASA.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open Assessments",
        description:
          "Navigate to Assessments under the Teacher Menu and choose the assessment you are administering.",
      },
      {
        title: "Choose the Phase",
        description:
          "Select the school year and phase — BoSY (Beginning), MoSY (Middle), or EoSY (End of School Year).",
      },
      {
        title: "Print the Material",
        description:
          "Download the learner material and scoresheet attached to the assessment. Materials may be shared division-wide or authored by your own school.",
      },
      {
        title: "Administer & Record",
        description:
          "Assess each learner one-on-one, then encode the results on the scoresheet in the system.",
        tip: "Reading level and mastery band are computed automatically from the scores — you do not compute them yourself.",
      },
      {
        title: "Review Results",
        description:
          "Check the class summary to see which learners fall below grade level. These learners become eligible for ARAL intervention.",
      },
    ],
  },
  {
    id: "teacher_aral",
    title: "ARAL",
    icon: Sprout,
    category: "teacher",
    description:
      "Intervention program for learners below grade level, drawn from CRLA, Phil-IRI, RMA, and PABASA results.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open ARAL",
        description:
          "Navigate to ARAL under the Teacher Menu and pick a program: Reading, Mathematics, Science, or Summer.",
      },
      {
        title: "Review Eligible Learners",
        description:
          "The system lists learners identified as below grade level from their latest assessment results.",
        tip: "Encode the assessment first — a learner with no assessment result cannot be identified for ARAL.",
      },
      {
        title: "Enroll into the Program",
        description:
          "Enroll the identified learners into the program so their sessions and progress can be tracked.",
      },
      {
        title: "Track Progress",
        description:
          "Record attendance and progress per session, and review whether each learner is improving toward grade level.",
      },
    ],
  },
  {
    id: "teacher_examinations",
    title: "Examinations",
    icon: FileSpreadsheet,
    category: "teacher",
    description:
      "Build a Table of Specification, turn it into an exam, then analyze the results item by item.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open Examinations",
        description:
          "Navigate to Examinations under the Teacher Menu. Three tools are available: Table of Specification, Exam Creator, and Item Analysis.",
      },
      {
        title: "Create a Table of Specification",
        description:
          "Build your own TOS — or start from one shared by the division — distributing exam items across competencies and Bloom's cognitive levels.",
      },
      {
        title: "Build the Exam",
        description:
          "In Exam Creator, turn the TOS item placement into the actual test, item by item.",
        tip: "A TOS you author stays private to you; a division-shared TOS is available to every teacher.",
      },
      {
        title: "Record Results",
        description:
          "In Item Analysis, encode each learner's per-item results after checking the exam.",
      },
      {
        title: "Review Item Analysis & MPS",
        description:
          "The system computes the Mean Percentage Score with mastery level, plus difficulty and discrimination indices per item.",
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

  {
    id: "teacher_evaluations",
    title: "Evaluations",
    icon: ClipboardCheck,
    category: "teacher",
    description:
      "Submit your evaluation of the school principal for the current school year.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open Evaluations",
        description:
          "Navigate to Evaluations under the Teacher Menu to see the evaluations open to you.",
        tip: "Nothing appears here until an administrator activates a teacher-to-principal questionnaire.",
      },
      {
        title: "Answer the Questionnaire",
        description:
          "Rate each statement on the 1–5 scale and add remarks where you want to explain a rating.",
      },
      {
        title: "Submit",
        description:
          "Submit your responses. Each evaluation can only be submitted once, and submitted evaluations are marked as done.",
      },
    ],
  },
  {
    id: "teacher_mps",
    title: "MPS",
    icon: BarChart3,
    category: "teacher",
    description:
      "Review the Mean Percentage Score of your subjects and sections per quarter.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open MPS",
        description:
          "Navigate to MPS under the Teacher Menu and select the school year.",
      },
      {
        title: "Review by Subject & Section",
        description:
          "The table shows the MPS per subject, section, and quarter, computed from the exam results you recorded.",
        tip: "MPS values come from Examinations → Item Analysis; record exam results there and this page fills in.",
      },
      {
        title: "Check Mastery Level",
        description:
          "Compare each MPS against its mastery level to see which subjects need remediation.",
      },
    ],
  },
  {
    id: "teacher_anecdotal",
    title: "Anecdotal Record",
    icon: NotebookText,
    category: "teacher",
    description:
      "Log observed learner behavior in your advisory class, with your interpretation and the action taken.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open Anecdotal Record",
        description:
          "Navigate to Anecdotal Record under the Teacher Menu, then select the school year and a learner from your advisory class.",
      },
      {
        title: "Add an Entry",
        description:
          "Record the date of observation, the setting, and an objective description of the observed behavior.",
        tip: "Describe only what you observed. Keep your judgment in the Interpretation field, not the anecdote.",
      },
      {
        title: "Interpret & Act",
        description:
          "Add your interpretation of the behavior and the action taken or recommendation made.",
      },
      {
        title: "Print the Record",
        description:
          "Print a learner's anecdotal record when it is needed for a conference or referral.",
      },
    ],
  },
  {
    id: "teacher_manifestation",
    title: "Manifestation Tagging",
    icon: Tags,
    category: "teacher",
    description:
      "Tag learners showing LSEN manifestations, secure parent consent, and plan the intervention for SNED identification.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open Manifestation Tagging",
        description:
          "Navigate to Manifestation Tagging under the Teacher Menu (also reachable from Anecdotal Record), then select the school year.",
      },
      {
        title: "Tag the Learner",
        description:
          "Record the manifestation or manifestations you observed, along with the LIS class branch and your observation notes. A learner may carry more than one.",
        tip: "Tag first — consent is sought afterwards. Tagging never requires consent.",
      },
      {
        title: "Print the SNED Consent Form",
        description:
          "Print the parent consent form and have the parent or guardian sign it, then record whether consent was granted or refused.",
      },
      {
        title: "Design the Intervention",
        description:
          "As adviser, write the intervention plan for the learner. The School Head renders technical assistance on the plan.",
      },
      {
        title: "Identify for SNED",
        description:
          "A learner who is both tagged and consented is identified for SNED enrollment. Record the enrollment outcome once it is settled.",
        tip: "This record feeds the DepEd LIS — it does not replace it. Tick the LIS flag once the learner is tagged there too.",
      },
    ],
  },
  {
    id: "teacher_cardex",
    title: "Learner Cardex",
    icon: IdCard,
    category: "teacher",
    description:
      "Keep the per-learner cardex: identified needs with interventions, and the log of communication with parents.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open Learner Cardex",
        description:
          "Navigate to Learner Cardex under the Teacher Menu, select the school year, then pick a learner from your advisory class.",
      },
      {
        title: "Record Needs & Interventions",
        description:
          "On the Needs tab, log the learner's identified need, the strategy you applied, the progress observed, and your remarks.",
      },
      {
        title: "Log Parent Communication",
        description:
          "On the Communication tab, record each contact: date, mode, person contacted, the concern discussed, and the agreement reached.",
      },
      {
        title: "Print for Conferences",
        description:
          "Print either log when documentation is needed for a parent conference or a referral.",
      },
    ],
  },
  {
    id: "teacher_supervision",
    title: "Supervision",
    icon: Telescope,
    category: "teacher",
    description:
      "Your side of the PMES classroom observation cycle — suggest an observation slot, and file COT forms for teachers you observe.",
    allowedRoles: teacherMenuRoles,
    steps: [
      {
        title: "Open Supervision",
        description:
          "Navigate to Supervision under the Teacher Menu and select the school year. My Observations lists the slots where you are the teacher observed.",
      },
      {
        title: "Suggest a Slot",
        description:
          "Propose an observation date with your position, term, grade and section, pre-conference time, focus KRA and indicator, and attach your ILAW lesson plan.",
      },
      {
        title: "Wait for Approval",
        description:
          "The School Head approves or rejects the suggestion. Editing an approved slot sends it back for approval, because an approval refers to one specific date.",
        tip: "Approved and completed slots offer an Add to Google Calendar link and a downloadable .ics that also carries the pre-conference.",
      },
      {
        title: "Review Your COT Forms",
        description:
          "After the observation, view the Annex E-2 rating sheet, E-4 notes, and — when there was more than one observer — the E-3 inter-observer agreement filed for you.",
      },
      {
        title: "Observations You Conduct",
        description:
          "If you are a designated observer this school year, a second tab lists the slots you observe. File your own Annex E-2 there.",
        tip: "You can only edit your own rating sheet — one observer never edits another's.",
      },
    ],
  },

  // ── Tutor Menu ──
  // A pure tutor logs in with type "tutor"; staff or teachers who also carry an
  // ARAL tutor assignment reach these pages via the `is_tutor` flag, so
  // `getVisibleGuides` admits this whole category on tutor access rather than on
  // `allowedRoles` alone.
  {
    id: "tutor_learners",
    title: "My Learners",
    icon: GraduationCap,
    category: "tutor",
    description:
      "The learners assigned to you in the ARAL intervention program, with your baseline and outcome notes.",
    allowedRoles: ["tutor"],
    steps: [
      {
        title: "Open My Learners",
        description:
          "Navigate to My Learners under the Tutor Menu and select the school year.",
        tip: "Your roster is assigned by the ARAL coordinator. If the list is empty, no learners have been assigned to you for that school year yet.",
      },
      {
        title: "Review Your Roster",
        description:
          "Each row shows the learner's program, section and grade level, target tier (Priority or Secondary), and current status.",
      },
      {
        title: "Record the Baseline Note",
        description:
          "Before the intervention begins, write where the learner stands in the Baseline note column.",
      },
      {
        title: "Record the Outcome Note",
        description:
          "After the intervention, write the result in the Outcome note column.",
        tip: "Notes save on their own a moment after you stop typing — watch for the “Saved” marker above the table.",
      },
    ],
  },
  {
    id: "tutor_attendance",
    title: "Tutor Attendance",
    icon: CalendarCheck,
    category: "tutor",
    description:
      "Mark attendance for your own tutorial sessions, session date by session date.",
    allowedRoles: ["tutor"],
    steps: [
      {
        title: "Open Attendance",
        description:
          "Navigate to Attendance under the Tutor Menu and select the school year.",
      },
      {
        title: "Add Session Dates",
        description:
          "Pick a date and add it. Each date becomes a column in the attendance grid.",
        tip: "These are your tutorial sessions, not the school's class days — add only the dates you actually met your learners.",
      },
      {
        title: "Mark Each Learner",
        description:
          "For every learner and session, mark Present, Absent, or Late. Marks save as you set them.",
      },
      {
        title: "Remove a Date",
        description:
          "Removing a session date deletes every attendance mark recorded under it, so you are asked to confirm first.",
      },
    ],
  },
  {
    id: "tutor_progress",
    title: "Progress Tracker",
    icon: TrendingUp,
    category: "tutor",
    description:
      "Track each tutee's reading level session by session across Weeks 1–8.",
    allowedRoles: ["tutor"],
    steps: [
      {
        title: "Open Progress Tracker",
        description:
          "Navigate to Progress Tracker under the Tutor Menu, select the school year, then pick the week (1–8) you are recording.",
      },
      {
        title: "Add Session Columns",
        description:
          "Click Add session for each session held that week, and label the column with the session focus.",
      },
      {
        title: "Record the Reading Level",
        description:
          "For each learner and session, set the level: IDL (Independent), ISL (Instructional), or FL (Frustration).",
      },
      {
        title: "Add Session Notes",
        description:
          "Note what happened in the session beside the level. Levels and notes save automatically.",
      },
      {
        title: "Compare Across Weeks",
        description:
          "Switch between weeks to see whether the learner is moving from Frustration toward Independent.",
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
    allowedRoles: [...schoolManagementRoles, "division_admin", "division_type"],
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
    allowedRoles: ["super admin"],
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
    allowedRoles: ["super admin"],
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
    allowedRoles: ["division_admin", "division_type"],
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
  { id: "tutor", label: "Tutor Menu" },
  { id: "records", label: "Records" },
  { id: "division", label: "Division Office" },
];

/**
 * The guides a user may see, grouped into the sidebar's own sections.
 *
 * `isTutor` mirrors `AppSidebar`'s `hasTutorAccess`: a pure tutor logs in with
 * type "tutor", but a teacher or staff member who also holds an ARAL tutor
 * assignment keeps their normal type and carries the `is_tutor` flag instead.
 * Both reach the Tutor Menu, so both must reach its guides.
 */
export function getVisibleGuides(
  userType: string,
  isTutor = false
): GuideCategory[] {
  const hasTutorAccess = userType === "tutor" || isTutor;

  const filtered = ALL_GUIDES.filter(
    (guide) =>
      guide.allowedRoles.includes(userType as UserType) ||
      (guide.category === "tutor" && hasTutorAccess)
  );

  return CATEGORIES.map((cat) => ({
    id: cat.id,
    label: cat.label,
    modules: filtered.filter((g) => g.category === cat.id),
  })).filter((cat) => cat.modules.length > 0);
}
