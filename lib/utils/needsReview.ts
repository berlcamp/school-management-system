/**
 * Needs Review (/division/needs-review, migration 226): how far each school
 * has encoded each module. `division_needs_review` returns one row of counts
 * per school; everything here is pure — the status of each module, the guide
 * a school follows to catch up, and the workbook layout the division already
 * keeps (one row per school, the same column groups).
 */

import * as XLSX from "xlsx";

/** The counted columns of `division_needs_review`, in its order. */
export const NEEDS_REVIEW_COUNT_KEYS = [
  "books_total",
  "books_allocated",
  "crla_learners",
  "crla_assessed",
  "philiri_learners",
  "philiri_assessed",
  "tos_count",
  "summative_exams",
  "item_analyses",
  "learners",
  "learners_measured",
  "teachers",
  "class_record_teachers",
  "advisers",
  "attendance_advisers",
  "rooms",
  "rooms_complete",
  "sbfp_beneficiaries",
] as const;

export type NeedsReviewCountKey = (typeof NEEDS_REVIEW_COUNT_KEYS)[number];

export interface NeedsReviewSchool extends Record<NeedsReviewCountKey, number> {
  school_id: string;
  school_name: string;
  district: string | null;
  sbfp_program: boolean;
}

export function normalizeNeedsReviewRow(row: Record<string, unknown>): NeedsReviewSchool {
  const counts = Object.fromEntries(
    NEEDS_REVIEW_COUNT_KEYS.map((k) => [k, row[k] == null ? 0 : Number(row[k])]),
  ) as Record<NeedsReviewCountKey, number>;
  return {
    ...counts,
    school_id: String(row.school_id),
    school_name: String(row.school_name ?? ""),
    district: row.district == null || row.district === "" ? null : String(row.district),
    sbfp_program: Boolean(row.sbfp_program),
  };
}

// ---------------------------------------------------------------------------
// Module status
// ---------------------------------------------------------------------------

/**
 * `not_started` — nothing encoded; `incomplete` — some, not all;
 * `complete`; `not_applicable` — the school has nobody to encode for
 * (a high school has no CRLA learners).
 */
export type ModuleStatus = "not_started" | "incomplete" | "complete" | "not_applicable";

export const MODULE_KEYS = [
  "books",
  "crla",
  "philiri",
  "exams",
  "health",
  "class_record",
  "attendance",
  "rooms",
  "sbfp",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleResult {
  status: ModuleStatus;
  /** "12 of 40 learners", shown beside the school. */
  detail: string;
  /** Done over expected, as a percent; null when it is not a ratio. */
  percent: number | null;
}

const fmt = new Intl.NumberFormat("en-US");
const n = (v: number) => fmt.format(v);

function ratio(done: number, total: number, noun: string): ModuleResult {
  if (total === 0) return { status: "not_applicable", detail: `No ${noun}`, percent: null };
  const percent = (done / total) * 100;
  return {
    status: done === 0 ? "not_started" : done >= total ? "complete" : "incomplete",
    detail: `${n(done)} of ${n(total)} ${noun}`,
    percent,
  };
}

/** A count where any figure above zero means the module is in use. */
function presence(parts: { label: string; value: number }[]): ModuleResult {
  const filled = parts.filter((p) => p.value > 0).length;
  const detail = parts.map((p) => `${n(p.value)} ${p.label}`).join(" · ");
  return {
    status: filled === 0 ? "not_started" : filled === parts.length ? "complete" : "incomplete",
    detail,
    percent: null,
  };
}

export function moduleResult(s: NeedsReviewSchool, key: ModuleKey): ModuleResult {
  switch (key) {
    case "books":
      return presence([
        { label: "copies on hand", value: s.books_total },
        { label: "allocated", value: s.books_allocated },
      ]);
    case "crla":
      return ratio(s.crla_assessed, s.crla_learners, "Grade 1-3 learners assessed");
    case "philiri":
      return ratio(s.philiri_assessed, s.philiri_learners, "Grade 3-10 learners assessed");
    case "exams":
      return presence([
        { label: "TOS", value: s.tos_count },
        { label: "summative exams", value: s.summative_exams },
        { label: "item analyses", value: s.item_analyses },
      ]);
    case "health":
      return ratio(s.learners_measured, s.learners, "learners measured");
    case "class_record":
      return ratio(s.class_record_teachers, s.teachers, "teachers using it");
    case "attendance":
      return ratio(s.attendance_advisers, s.advisers, "advisers using it");
    case "rooms":
      return ratio(s.rooms_complete, s.rooms, "rooms complete");
    case "sbfp":
      if (!s.sbfp_program) return { status: "not_started", detail: "No programme opened", percent: null };
      return s.sbfp_beneficiaries === 0
        ? { status: "incomplete", detail: "Programme opened, no beneficiaries", percent: null }
        : { status: "complete", detail: `${n(s.sbfp_beneficiaries)} beneficiaries`, percent: null };
  }
}

export function needsReview(status: ModuleStatus): boolean {
  return status === "not_started" || status === "incomplete";
}

// ---------------------------------------------------------------------------
// What each module means and how a school catches up
// ---------------------------------------------------------------------------

export interface ModuleGuide {
  title: string;
  why: string;
  steps: string[];
  /** The screen the school uses, and who uses it. */
  screen: { label: string; href: string; who: string };
}

export const MODULE_GUIDES: Record<ModuleKey, ModuleGuide> = {
  books: {
    title: "Books",
    why: "Books on hand and allocated to teachers feed the textbook-to-learner ratio and every issuance a teacher records.",
    steps: [
      "Encode every textbook title and its number of copies under Books.",
      "Allocate copies to the teachers who will issue them, for this school year.",
    ],
    screen: { label: "Books → Allocations", href: "/books/allocations", who: "Librarian, admin or school head" },
  },
  crla: {
    title: "ARAL — CRLA",
    why: "CRLA identifies the Grade 1-3 learners who need reading intervention; a learner never assessed can never be enrolled in ARAL.",
    steps: [
      "Each Grade 1-3 adviser opens Assessments and picks the section.",
      "Encode every learner's CRLA scores for the current phase (BoSY, MoSY or EoSY).",
    ],
    screen: { label: "Teacher Menu → Assessments", href: "/teacher/assessments", who: "Grade 1-3 advisers" },
  },
  philiri: {
    title: "ARAL — Phil-IRI",
    why: "Phil-IRI places Grade 3-10 learners on a reading level; frustration-level readers are the ones ARAL is for.",
    steps: [
      "Each adviser opens Assessments and picks the section.",
      "Record the Group Screening Test, then the individual test for learners who need it.",
    ],
    screen: { label: "Teacher Menu → Assessments", href: "/teacher/assessments", who: "Grade 3-10 advisers" },
  },
  exams: {
    title: "Examinations",
    why: "Summative results and their item analysis are what the division's Least Learned Competencies list is computed from.",
    steps: [
      "Prepare a TOS for the school's own tests, or use an approved division TOS.",
      "Record each summative test's results per section — scan the answer sheets or encode the scores.",
      "Open Item Analysis to confirm every item has responses.",
    ],
    screen: { label: "Teacher Menu → Examinations", href: "/teacher/examinations", who: "Subject teachers" },
  },
  health: {
    title: "Learner Health",
    why: "Height and weight are what SF8, the nutritional-status reports and SBFP beneficiary selection all read.",
    steps: [
      "Open Learner Health and pick the section.",
      "Encode each learner's height and weight for the baseline (and later the endline).",
    ],
    screen: { label: "Learner Health", href: "/health", who: "Advisers or the school nurse" },
  },
  class_record: {
    title: "Class Record / ECCD / PACE",
    why: "Grades come only from the Class Record (Kindergarten from ECCD and the Progress Report, Grade 1 from PACE); a teacher who never opens it leaves the report card empty.",
    steps: [
      "Each teacher opens Class Record for each subject and section they teach.",
      "Kindergarten advisers rate ECCD / the Progress Report; Grade 1 advisers rate PACE.",
    ],
    screen: { label: "Teacher Menu → Class Record", href: "/teacher/class-record", who: "Every teacher with a load" },
  },
  attendance: {
    title: "Attendance",
    why: "Daily attendance is SF2, the report card's days present and the absenteeism report; it is the adviser's register.",
    steps: ["Each adviser opens Attendance and records the section's days, daily or at least weekly."],
    screen: { label: "Attendance", href: "/attendance", who: "Section advisers" },
  },
  rooms: {
    title: "Rooms",
    why: "Room data feeds the Classroom Enrollment and Size report, classroom needs and the building inventory.",
    steps: [
      "Open Rooms and edit each room.",
      "Fill in the building, room type, capacity, condition and dimension (e.g. 7 x 9).",
    ],
    screen: { label: "Rooms", href: "/rooms", who: "Admin or school head" },
  },
  sbfp: {
    title: "SBFP",
    why: "Without beneficiaries the school has no SBFP forms, feeding records or nutritional outcomes to report.",
    steps: [
      "Open Feeding Program — the first person to open it starts the school's programme.",
      "Add the beneficiaries from the Learner Health baseline.",
    ],
    screen: { label: "Feeding Program", href: "/sbfp", who: "Focal person, school head or advisers" },
  },
};

// ---------------------------------------------------------------------------
// Groups (one card per module) and totals
// ---------------------------------------------------------------------------

export interface ReviewEntry {
  school: NeedsReviewSchool;
  result: ModuleResult;
}

export interface ReviewGroup {
  key: ModuleKey;
  guide: ModuleGuide;
  notStarted: ReviewEntry[];
  incomplete: ReviewEntry[];
}

/** Per module, the schools behind — not started first, then lowest percent. */
export function reviewGroups(schools: readonly NeedsReviewSchool[]): ReviewGroup[] {
  return MODULE_KEYS.map((key) => {
    const entries = schools.map((school) => ({ school, result: moduleResult(school, key) }));
    const byName = (a: ReviewEntry, b: ReviewEntry) => a.school.school_name.localeCompare(b.school.school_name);
    return {
      key,
      guide: MODULE_GUIDES[key],
      notStarted: entries.filter((e) => e.result.status === "not_started").sort(byName),
      incomplete: entries
        .filter((e) => e.result.status === "incomplete")
        .sort((a, b) => (a.result.percent ?? 0) - (b.result.percent ?? 0) || byName(a, b)),
    };
  });
}

export interface ReviewTotals {
  schools: number;
  schoolsBehind: number;
  notStarted: number;
  incomplete: number;
}

export function reviewTotals(schools: readonly NeedsReviewSchool[]): ReviewTotals {
  let schoolsBehind = 0;
  let notStarted = 0;
  let incomplete = 0;
  for (const s of schools) {
    let behind = false;
    for (const key of MODULE_KEYS) {
      const { status } = moduleResult(s, key);
      if (status === "not_started") notStarted += 1;
      if (status === "incomplete") incomplete += 1;
      if (needsReview(status)) behind = true;
    }
    if (behind) schoolsBehind += 1;
  }
  return { schools: schools.length, schoolsBehind, notStarted, incomplete };
}

// ---------------------------------------------------------------------------
// The division's workbook layout
// ---------------------------------------------------------------------------

const pct = (done: number, total: number): string =>
  total === 0 ? "" : `${((done / total) * 100).toFixed(1)}%`;

/**
 * The sheet as the division keeps it: three header rows (group, column,
 * sub-column) and one row per school. Attendance counts advisers, not every
 * teacher — see migration 226.
 */
export function needsReviewSheet(schools: readonly NeedsReviewSchool[]): {
  rows: (string | number)[][];
  merges: XLSX.Range[];
} {
  const r1 = ["School Name", "Books", "", "ARAL", "", "", "", "Examination", "", "", "Learners Health", "",
    "Class Record / ECCD / PACE", "", "", "Attendance (absenteeism)", "", "", "Rooms", "", "SBFP Data"];
  const r2 = ["", "Total Number", "Total Allocated", "CRLA", "", "PHIL-IRI", "", "TOS", "Summative Exam",
    "Item Analysis", "Total Learners", "With Measurement", "Total Number of Teachers", "Number of Teachers Using",
    "Percentage", "Total Number of Advisers", "Number of Advisers Using", "Percentage", "Total Number of Rooms",
    "Number of Rooms with complete data", "Beneficiaries"];
  const r3 = ["", "", "", "Total Learner", "Total Learner w/ CRLA", "Total Learner", "Total Learner w/ PHIL-IRI",
    "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
  const body = schools.map((s) => [
    s.school_name,
    s.books_total,
    s.books_allocated,
    s.crla_learners,
    s.crla_assessed,
    s.philiri_learners,
    s.philiri_assessed,
    s.tos_count,
    s.summative_exams,
    s.item_analyses,
    s.learners,
    s.learners_measured,
    s.teachers,
    s.class_record_teachers,
    pct(s.class_record_teachers, s.teachers),
    s.advisers,
    s.attendance_advisers,
    pct(s.attendance_advisers, s.advisers),
    s.rooms,
    s.rooms_complete,
    s.sbfp_program ? s.sbfp_beneficiaries : "No programme",
  ]);
  const m = (r: number, c: number, r2_: number, c2: number): XLSX.Range => ({ s: { r, c }, e: { r: r2_, c: c2 } });
  const merges = [
    m(0, 0, 2, 0), // School Name
    m(0, 1, 0, 2), // Books
    m(0, 3, 0, 6), // ARAL
    m(1, 3, 1, 4), // CRLA
    m(1, 5, 1, 6), // PHIL-IRI
    m(0, 7, 0, 9), // Examination
    m(0, 10, 0, 11), // Learners Health
    m(0, 12, 0, 14), // Class Record
    m(0, 15, 0, 17), // Attendance
    m(0, 18, 0, 19), // Rooms
    // Single columns span rows 2-3.
    ...[1, 2, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((c) => m(1, c, 2, c)),
  ];
  return { rows: [r1, r2, r3, ...body], merges };
}

export function exportNeedsReviewWorkbook(schools: readonly NeedsReviewSchool[], schoolYear: string): void {
  const { rows, merges } = needsReviewSheet(schools);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 48 }, ...rows[1].slice(1).map(() => ({ wch: 14 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Needs Review");
  XLSX.writeFile(wb, `needs_review_${schoolYear}.xlsx`);
}
