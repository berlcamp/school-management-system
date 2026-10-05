/**
 * Grade 1 workbook (/teacher/sections/[id]/grade1) against the intercepted
 * Supabase: the workbook's sheets as tabs, rating a class column by typing,
 * and the Term Summary narratives saving to the rows the card prints.
 */
import { expect, test, type Page } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const SY = "2026-2027";
const SECTION_ID = 4101;

const ADVISER = {
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: "Test Teacher",
  type: "teacher",
  school_id: TEST_USER.schoolId,
  is_active: true,
};

const SECTION = {
  id: SECTION_ID,
  name: "Sampaguita",
  school_id: TEST_USER.schoolId,
  school_year: SY,
  grade_level: 1,
  section_adviser_id: TEST_USER.systemUserId,
  is_active: true,
};

const SCHOOL = {
  id: TEST_USER.schoolId,
  name: "Bayugan Central Elementary School",
  school_id: "131501",
  region: null,
  district: "Central District",
  municipality_city: "Bayugan City",
};

const student = (id: number, first: string, last: string, gender: string, lrn: string) => ({
  id,
  first_name: first,
  middle_name: null,
  last_name: last,
  suffix: null,
  lrn,
  date_of_birth: "2020-03-15",
  gender,
});

const ENROLLMENTS = [
  student(80001, "Ana", "Bautista", "female", "100000000011"),
  student(80002, "Ben", "Cruz", "male", "100000000012"),
  student(80003, "Carlo", "Dela Cruz", "male", "100000000013"),
].map((s) => ({
  section_id: SECTION_ID,
  school_year: SY,
  status: "approved",
  enrollment_status: "active",
  student: s,
}));

const AREAS = [
  { id: 1, code: "RL", name: "Reading and Literacy", mode: "continuous", sort_order: 1, is_active: true },
  { id: 3, code: "MATH", name: "Mathematics", mode: "by_term", sort_order: 3, is_active: true },
];

let seq = 0;
const comp = (area_id: number, description: string, item_number: string | null, terms: number[], extra = {}) => {
  seq += 1;
  return {
    id: 600 + seq,
    area_id,
    code: `X-${seq}`,
    item_number,
    description,
    is_heading: false,
    terms,
    term_group: null,
    print_column: 1,
    sort_order: seq,
    is_active: true,
    ...extra,
  };
};
const heading = (area_id: number, description: string) =>
  comp(area_id, description, null, [], { is_heading: true });

const COMPETENCIES = [
  heading(1, "Phonological Awareness"),
  comp(1, "Identify rhyming words.", "1", [1]),
  comp(1, "Blend sounds to make words.", "2", [1, 2, 3]),
  comp(1, "Comprehend stories.", "20", []),
  comp(1, "a. Note important details in stories.", null, [1, 2, 3]),
  heading(3, "Number and Algebra"),
  comp(3, "Count up to 100.", "1", [1], { term_group: 1 }),
  heading(3, "Number and Algebra"),
  comp(3, "Order numbers up to 100.", "1", [2], { term_group: 2 }),
];

async function open(page: Page, query = "") {
  const mock = await installSupabaseMock(page, {
    sms_users: [ADVISER],
    sms_sections: [SECTION],
    sms_schools: [SCHOOL],
    sms_enrollments: ENROLLMENTS,
    sms_pace_areas: AREAS,
    sms_pace_competencies: COMPETENCIES,
    sms_pace_ratings: [
      { student_id: 80002, competency_id: 602, section_id: SECTION_ID, school_year: SY, term: 1, rating: "A" },
    ],
    sms_grade1_progress_narratives: [],
    sms_attendance: [],
  });
  await page.goto(`/teacher/sections/${SECTION_ID}/grade1${query}`);
  await expect(page.getByRole("heading", { name: "Grade 1 - Sampaguita" })).toBeVisible();
  return mock;
}

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("groups the workbook's sheets into five views and opens on Input Data", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("tab")).toHaveText([
    "Input Data",
    "Rate Competencies",
    "Progress Card",
    "Attendance",
    "Print",
  ]);
  await expect(page.getByText("Workbook sheet: INPUT DATA")).toBeVisible();
  await expect(page.getByRole("main").getByText("Bayugan Central Elementary School")).toBeVisible();
  await expect(page.getByText("MALE (2)")).toBeVisible();
  await expect(page.getByText("FEMALE (1)")).toBeVisible();
  await page.screenshot({ path: "test-results/grade1-input.png", fullPage: true });
});

test("rates a class column by typing, moving down the learners", async ({ page }) => {
  const mock = await open(page);
  await page.getByRole("tab", { name: "Rate Competencies" }).click();
  await expect(page).toHaveURL(/view=rate/);
  await expect(page.getByText("Workbook sheet: TERM 1 READING AND LITERACY")).toBeVisible();
  // Area and term pickers carry progress: one of 3 learners x 3 columns.
  await expect(page.getByRole("button", { name: /Reading and Literacy/ })).toContainText("1/9");

  // Term 1 offers 1, 2 and 20a — never the parent "20".
  const header = page.locator("thead tr").last();
  await expect(header.locator("th")).toHaveText(["Learners’ Names", "1", "2", "20a"]);

  // Males first: Cruz, Dela Cruz, then Bautista.
  await expect(page.getByLabel("Cruz, Ben, competency 1")).toHaveValue("A");

  const carlo = page.getByLabel("Dela Cruz, Carlo, competency 1");
  await carlo.click();
  await expect(page.getByText("Identify rhyming words.")).toBeVisible();
  await carlo.press("b");
  await expect(carlo).toHaveValue("B");
  await expect(page.getByLabel("Bautista, Ana, competency 1")).toBeFocused();

  await expect.poll(() => mock.writesTo("sms_pace_ratings").length).toBe(1);
  expect(mock.writesTo("sms_pace_ratings")[0].body).toMatchObject({
    student_id: "80003",
    competency_id: "602",
    term: 1,
    rating: "B",
    section_id: String(SECTION_ID),
  });

  await carlo.click();
  await carlo.press("Backspace");
  await expect(carlo).toHaveValue("");
  await expect.poll(() => mock.writesTo("sms_pace_ratings").map((w) => w.method)).toEqual(["POST", "DELETE"]);
});

test("fills only the blank cells of a column in one save", async ({ page }) => {
  const mock = await open(page, "?view=rate&area=RL&term=1");
  // Column "1": Ben already holds A, so only Carlo and Ana are blank.
  await page.getByRole("button", { name: "Competency 1: 1 of 3 rated" }).click();
  await expect(page.getByText("Fill 2 blanks with")).toBeVisible();
  await page.getByRole("button", { name: "Fill blanks in column 1 with B, Benchmarking" }).click();

  await expect(page.getByLabel("Cruz, Ben, competency 1")).toHaveValue("A");
  await expect(page.getByLabel("Dela Cruz, Carlo, competency 1")).toHaveValue("B");
  await expect(page.getByLabel("Bautista, Ana, competency 1")).toHaveValue("B");
  await expect.poll(() => mock.writesTo("sms_pace_ratings").length).toBe(1);
  const body = mock.writesTo("sms_pace_ratings")[0].body as { student_id: string; rating: string }[];
  expect(body.map((r) => [r.student_id, r.rating]).sort()).toEqual([
    ["80001", "B"],
    ["80003", "B"],
  ]);
  await page.screenshot({ path: "test-results/grade1-grid.png", fullPage: true });
});

test("a deep link opens a by-term area on the chosen term", async ({ page }) => {
  await open(page, "?view=rate&area=MATH&term=2");
  await expect(page.getByText("Workbook sheet: TERM 1-3 MATHEMATICS")).toBeVisible();
  await expect(page.getByRole("button", { name: "Term 2", pressed: true })).toBeVisible();
  const header = page.locator("thead tr").last();
  await expect(header.locator("th")).toHaveText(["Learners’ Names", "1"]);
  await page.getByRole("button", { name: /Competency 1/ }).click();
  await expect(page.getByText("Order numbers up to 100.")).toBeVisible();
});

test("a Term Summary narrative saves both blocks for that term", async ({ page }) => {
  const mock = await open(page, "?view=card&term=2");
  await expect(page.getByText("0 of 3")).toBeVisible();
  await page.getByLabel("Bautista, Ana: What Your Child Can Do").fill("Reads short sentences.");
  await expect.poll(() => mock.writesTo("sms_grade1_progress_narratives").length, { timeout: 5000 }).toBe(1);
  expect(mock.writesTo("sms_grade1_progress_narratives")[0].body).toMatchObject({
    student_id: "80001",
    term: 2,
    can_do: "Reads short sentences.",
    to_improve: "",
  });
  await page.getByLabel("Bautista, Ana: What Your Child Is Learning To Improve").fill("Reading longer passages.");
  await expect(page.getByText("1 of 3")).toBeVisible();
  await page.screenshot({ path: "test-results/grade1-summary.png", fullPage: true });
});

test("attendance and the print list cover every learner", async ({ page }) => {
  await open(page, "?view=attendance");
  await expect(page.getByText("No. of school days")).toBeVisible();
  await page.getByRole("tab", { name: "Print" }).click();
  await expect(page.getByRole("button", { name: "Print PACE" })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Print Card" })).toHaveCount(3);
  await page.screenshot({ path: "test-results/grade1-print.png", fullPage: true });
});
