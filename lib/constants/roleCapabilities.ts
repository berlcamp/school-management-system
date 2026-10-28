import type { StaffDesignation } from "@/lib/constants/designations";

/**
 * Plain-language description of what each `sms_users.type` does in the system,
 * shown in the role dialog on the avatar menu. Describes the work, not the
 * permissions model: the modules list beside it comes from `useNavSections()`,
 * which is what the sidebar actually offers.
 */
export interface RoleCapability {
  summary: string;
  can: string[];
}

export const ROLE_CAPABILITIES: Record<string, RoleCapability> = {
  school_head: {
    summary: "Runs the school's records and oversees its teachers.",
    can: [
      "Manage enrollment, sections, subjects, schedules and learners",
      "Add staff and hand out roles and designations",
      "Monitor grade encoding and run instructional supervision",
      "Approve record requests and print DepEd school forms and reports",
      "Set school settings, the school calendar and record locks",
    ],
  },
  assistant_school_head: {
    summary: "Shares the School Head's management of the school.",
    can: [
      "Manage enrollment, sections, subjects, schedules and learners",
      "Add staff and hand out roles and designations",
      "Monitor grade encoding and run instructional supervision",
      "Print DepEd school forms and reports",
    ],
  },
  admin: {
    summary: "Keeps the school's records and staff list in order.",
    can: [
      "Manage enrollment, sections, subjects, schedules and learners",
      "Add staff and hand out roles and designations",
      "Author school assessment materials",
      "Print DepEd school forms and reports",
    ],
  },
  registrar: {
    summary: "Keeps learner records and handles document requests.",
    can: [
      "Manage enrollment, sections, subjects and schedules",
      "Handle School Form 10 and transfer record requests",
      "Print DepEd school forms",
      "Prepare the School Report Card and building inventory",
    ],
  },
  librarian: {
    summary: "Manages the school's books and their issuance.",
    can: [
      "Allocate books to teachers and track returns",
      "View enrollment, sections, subjects and schedules",
      "Print DepEd school forms",
    ],
  },
  teacher: {
    summary: "Teaches classes, advises a section and encodes grades.",
    can: [
      "See your advisory section and the subjects you teach",
      "Encode grades through the class record",
      "Enrol learners, take attendance and record assessments",
      "Write examinations, record MPS and anecdotal records",
      "Issue and receive books from your learners",
    ],
  },
  volunteer_teacher: {
    summary: "A teacher without a plantilla item.",
    can: [
      "Everything a teacher does in the Teacher Menu",
      "Enrolling learners is left to regular staff",
    ],
  },
  guidance_counselor: {
    summary: "Follows up learners' behaviour, attendance and needs.",
    can: [
      "Keep anecdotal records and manifestation tagging",
      "Open learner cardex records",
      "Review absenteeism across the school",
    ],
  },
  school_nurse: {
    summary: "Looks after learners' health records.",
    can: [
      "Record learner height, weight and nutritional status (SF8)",
      "Run the School-Based Feeding Program",
    ],
  },
  tutor: {
    summary: "Tutors ARAL learners assigned to you.",
    can: [
      "See your ARAL learners",
      "Record their attendance and progress",
    ],
  },
  "super admin": {
    summary: "Full access to every school and the division office.",
    can: [
      "Do everything a School Head does, at any school",
      "Manage schools, users and Region Account access",
      "Use every Division Office and QA tool",
    ],
  },
  division_admin: {
    summary: "Works for the Schools Division Office across all schools.",
    can: [
      "View division-wide SDO reports and any school's reports",
      "Post announcements to schools and staff",
      "Maintain the division calendar, competencies and special programs",
      "View division examinations and their release codes",
    ],
  },
  division_type: {
    summary: "Division Office staff with read access across schools.",
    can: [
      "View division-wide SDO reports and any school's reports",
      "Post announcements to schools and staff",
      "Maintain the division calendar, competencies and special programs",
    ],
  },
  qa: {
    summary: "Reviews division tables of specifications and examinations.",
    can: [
      "Authorize teachers to write division TOS and exams",
      "Approve or return submitted TOS, exams and bank questions",
      "Maintain the competency catalogue",
    ],
  },
  region_account: {
    summary: "View-only access for the regional office.",
    can: [
      "View the division dashboard sections switched on for you",
      "View the SDO reports switched on for you",
    ],
  },
  sbfp_viewer: {
    summary: "View-only access to the School-Based Feeding Program for partners outside DepEd.",
    can: [
      "View the division Feeding Program dashboard",
      "View and print each school's SBFP forms, deliveries, monitoring logs and feedback",
    ],
  },
};

const FALLBACK: RoleCapability = {
  summary: "Your access is set by your School Head or the Division Office.",
  can: [],
};

export function roleCapability(type?: string | null): RoleCapability {
  return (type && ROLE_CAPABILITIES[type]) || FALLBACK;
}

/** What each 216 designation adds on top of the role, at the active school. */
export const DESIGNATION_CAPABILITIES: Record<StaffDesignation, string> = {
  aral_coordinator: "Manage the ARAL program as the School Head would.",
  reading_coordinator:
    "Manage school assessments (CRLA, Phil-IRI, RMA), including adding materials.",
  department_head:
    "Edit the subjects you head, manage their schedules and follow their MPS on the Department dashboard.",
  grade_level_coordinator:
    "Change subject teachers on schedules and section advisers for your grade levels.",
};
