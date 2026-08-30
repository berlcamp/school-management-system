/**
 * Custom Report Builder.
 *
 * The assertions are on what the page ASKED FOR, not only on what it drew: the
 * builder's whole job is to turn a set of clicks into one RPC call, and a table
 * that looks right over the wrong `p_filters` is a report the SDO would act on.
 *
 * The case that matters most is the last one — paging after editing a filter
 * must page the report that was RUN, not the one now in the pickers.
 */

import { expect, test } from "@playwright/test";
import {
  installSupabaseMock,
  seedSession,
  TEST_USER,
} from "./support/supabaseMock";

const BUILDER = "/division/reports/builder";
const SCHOOL_BUILDER = "/school-reports/builder";
const SCHOOL_ID = 7;

/** The signed-in user, switched to the division office (DivisionGuard). */
const DIVISION_USER = {
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: "Test Division Officer",
  type: "division_admin",
  school_id: null,
  is_active: true,
  position: "Education Program Supervisor",
};

/** The same person signed in as a school head, pinned to one school (134/164). */
const SCHOOL_HEAD = {
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: "Test School Head",
  type: "school_head",
  school_id: SCHOOL_ID,
  is_active: true,
  position: "Principal II",
};

const DATASETS = [
  {
    key: "learners",
    label: "Learners",
    description: "One row per learner record.",
    view_name: "v_report_learners",
    row_key: "student_id",
    default_sort: "full_name",
    requires_school_year: false,
    school_year_column: null,
    sort_order: 10,
    is_active: true,
  },
];

const FIELDS = [
  f("lrn", "LRN", "text", null, true, 10),
  f("full_name", "Name", "text", null, true, 20),
  f("grade_level", "Grade Level", "number", "grade_level", true, 30),
  f("sex", "Sex", "enum", "sex", false, 40),
  f("is_4ps", "4Ps", "boolean", null, false, 50),
  f("student_id", "Student ID", "number", null, false, 60),
  // Last, so "Add filter" still seeds LRN: it takes the first filterable field.
  f("school_name", "School", "text", null, false, 70),
  f("district", "District", "enum", "district", false, 80),
];

function f(
  field_key: string,
  label: string,
  data_type: string,
  enum_source: string | null,
  default_selected: boolean,
  sort_order: number,
) {
  return {
    dataset_key: "learners",
    field_key,
    label,
    data_type,
    enum_source,
    filterable: true,
    default_selected,
    sort_order,
  };
}

const LEARNERS = [
  {
    lrn: "100000000001",
    full_name: "BAUTISTA, ANA",
    grade_level: 5,
    sex: "female",
    is_4ps: true,
  },
  {
    lrn: "100000000002",
    full_name: "CRUZ, BEN",
    grade_level: 6,
    sex: "male",
    is_4ps: false,
  },
];

/** Serves whatever columns the page asked for, from the two rows above. */
const runHandler = (args: Record<string, unknown>) => {
  const columns = (args.p_columns as string[]) ?? [];
  const offset = Number(args.p_offset ?? 0);
  return LEARNERS.slice(offset, offset + Number(args.p_limit ?? 50)).map(
    (row) => ({
      row_data: Object.fromEntries(
        columns.map((c) => [c, (row as Record<string, unknown>)[c] ?? null]),
      ),
    }),
  );
};

async function install(page: Parameters<typeof installSupabaseMock>[0]) {
  return installSupabaseMock(
    page,
    {
      sms_users: [DIVISION_USER],
      sms_schools: [{ id: 7, name: "E2E Elementary School", is_active: true }],
      sms_report_datasets: DATASETS,
      sms_report_dataset_fields: FIELDS,
      sms_report_definitions: [],
    },
    {
      division_report_run: runHandler,
      // Larger than a page, so the pager is reachable. The run handler still
      // serves the two fixture rows; these specs assert on the REQUEST.
      division_report_count: () => 120,
    },
  );
}

async function installAsSchoolHead(
  page: Parameters<typeof installSupabaseMock>[0],
) {
  return installSupabaseMock(
    page,
    {
      sms_users: [SCHOOL_HEAD],
      sms_schools: [
        { id: SCHOOL_ID, name: "E2E Elementary School", is_active: true },
      ],
      sms_report_datasets: DATASETS,
      sms_report_dataset_fields: FIELDS,
      sms_report_definitions: [],
    },
    {
      division_report_run: runHandler,
      division_report_count: () => 120,
    },
  );
}

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("runs the dataset's default columns and renders them formatted", async ({
  page,
}) => {
  const mock = await install(page);

  await page.goto(BUILDER);
  await expect(
    page.getByRole("heading", { name: "Custom Report Builder" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Run report" }).click();
  await expect
    .poll(() => mock.writesTo("rpc/division_report_run").length)
    .toBeGreaterThan(0);

  // The dataset's default_selected fields, in catalogue order, and only those.
  const call = mock.writesTo("rpc/division_report_run").at(-1);
  expect((call?.body as Record<string, unknown>).p_columns).toEqual([
    "lrn",
    "full_name",
    "grade_level",
  ]);
  expect((call?.body as Record<string, unknown>).p_school_id).toBeNull();

  await expect(page.getByRole("cell", { name: "BAUTISTA, ANA" })).toBeVisible();
  // A raw 5 read back through the grade-level picklist.
  await expect(page.getByRole("cell", { name: "Grade 5" })).toBeVisible();
});

test("sends the filter the user built, and nothing until Run is pressed", async ({
  page,
}) => {
  const mock = await install(page);

  await page.goto(BUILDER);
  await expect(
    page.getByRole("heading", { name: "Custom Report Builder" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("combobox").filter({ hasText: "LRN" }).click();
  await page.getByRole("option", { name: "Grade Level" }).click();
  // A field with a picklist offers the picklist, not a box to type a code into.
  await page.getByRole("combobox").filter({ hasText: "Choose a value" }).click();
  await page.getByRole("option", { name: "Grade 5", exact: true }).click();

  // Building a filter must not have run anything.
  expect(mock.writesTo("rpc/division_report_run")).toHaveLength(0);

  await page.getByRole("button", { name: "Run report" }).click();
  await expect
    .poll(() => mock.writesTo("rpc/division_report_run").length)
    .toBeGreaterThan(0);

  const call = mock.writesTo("rpc/division_report_run").at(-1);
  expect((call?.body as Record<string, unknown>).p_filters).toEqual([
    { field: "grade_level", op: "eq", value: "5" },
  ]);
});

test("paging carries the report that was run, not the pickers' later edits", async ({
  page,
}) => {
  const mock = await install(page);

  await page.goto(BUILDER);
  await expect(
    page.getByRole("heading", { name: "Custom Report Builder" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("combobox").filter({ hasText: "LRN" }).click();
  await page.getByRole("option", { name: "Grade Level" }).click();
  await page.getByRole("combobox").filter({ hasText: "Choose a value" }).click();
  await page.getByRole("option", { name: "Grade 5", exact: true }).click();
  await page.getByRole("button", { name: "Run report" }).click();

  await expect(page.getByRole("cell", { name: "BAUTISTA, ANA" })).toBeVisible();

  // The user keeps fiddling AFTER running.
  await page.getByRole("combobox").filter({ hasText: "Grade 5" }).click();
  await page.getByRole("option", { name: "Grade 6", exact: true }).click();

  const before = mock.writesTo("rpc/division_report_run").length;
  // `exact` matters: Next.js's own dev-tools button also matches "Next".
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect
    .poll(() => mock.writesTo("rpc/division_report_run").length)
    .toBeGreaterThan(before);

  const paged = mock.writesTo("rpc/division_report_run").at(-1);
  const body = paged?.body as Record<string, unknown>;
  expect(body.p_offset).toBe(50);
  // Still grade 5: page 2 must answer the same question as page 1.
  expect(body.p_filters).toEqual([
    { field: "grade_level", op: "eq", value: "5" },
  ]);
});

test("a school head is pinned to their own school and never offered all schools", async ({
  page,
}) => {
  const mock = await installAsSchoolHead(page);

  await page.goto(SCHOOL_BUILDER);
  await expect(
    page.getByRole("heading", { name: "Custom Report Builder" }),
  ).toBeVisible();

  // No scope control at all — the school is settled before the page renders.
  await expect(page.getByText("All Schools")).toHaveCount(0);

  await page.getByRole("button", { name: "Run report" }).click();
  await expect
    .poll(() => mock.writesTo("rpc/division_report_run").length)
    .toBeGreaterThan(0);

  const call = mock.writesTo("rpc/division_report_run").at(-1);
  // Their own school, never null. The RPC refuses anything else anyway (166),
  // but the page must not even ask.
  expect((call?.body as Record<string, unknown>).p_school_id).toBe(SCHOOL_ID);
});

test("a school head is not offered division-wide sharing", async ({ page }) => {
  await installAsSchoolHead(page);

  await page.goto(SCHOOL_BUILDER);
  await expect(
    page.getByRole("heading", { name: "Custom Report Builder" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // `is_division_shared` is the division office's tier and 170 restricts
  // reading one to them, so ticking it would file a report out of sight.
  await expect(
    page.getByText("Share with the whole division office"),
  ).toHaveCount(0);
});

test("a school head is not offered school, district or school type as filters", async ({
  page,
}) => {
  await installAsSchoolHead(page);

  await page.goto(SCHOOL_BUILDER);
  await expect(
    page.getByRole("heading", { name: "Custom Report Builder" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("combobox").filter({ hasText: "LRN" }).click();

  const options = page.getByRole("option");
  await expect(options.filter({ hasText: "Grade Level" })).toHaveCount(1);
  // Each is the same value on every row at this scope.
  await expect(options.filter({ hasText: "School" })).toHaveCount(0);
  await expect(options.filter({ hasText: "District" })).toHaveCount(0);
});

test("the division builder still offers them", async ({ page }) => {
  await install(page);

  await page.goto(BUILDER);
  await expect(
    page.getByRole("heading", { name: "Custom Report Builder" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("combobox").filter({ hasText: "LRN" }).click();

  const options = page.getByRole("option");
  await expect(options.filter({ hasText: "School" })).toHaveCount(1);
  await expect(options.filter({ hasText: "District" })).toHaveCount(1);
});
