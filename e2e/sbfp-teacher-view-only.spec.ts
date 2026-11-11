/**
 * Feeding Program, migration 230, against the intercepted Supabase: a teacher
 * views every tab and files only Hot Meals Quality evaluations; a manager may
 * name a barangay as the Assigned Kitchen (Kitchen tool, 230; Food Dispatch, 233),
 * and must then choose which one.
 */
import { expect, test, type Page } from "@playwright/test";
import { BAYUGAN_BARANGAYS } from "../lib/constants/sbfp";
import { getCurrentSchoolYear } from "../lib/utils/schoolYear";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const account = (type: string) => ({
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: TEST_USER.name,
  type,
  school_id: TEST_USER.schoolId,
  is_active: true,
});

const PROGRAM = {
  id: 900,
  school_id: TEST_USER.schoolId,
  school_year: getCurrentSchoolYear(),
  focal_person_id: null,
};

const SECTION = {
  id: 70,
  name: "Rizal",
  grade_level: 3,
  school_id: TEST_USER.schoolId,
  school_year: PROGRAM.school_year,
  section_adviser_id: TEST_USER.systemUserId,
  is_active: true,
};

async function openModule(page: Page, type: string, extra: Record<string, unknown[]> = {}) {
  const mock = await installSupabaseMock(page, {
    sms_users: [account(type)],
    sms_sbfp_settings: [{ id: true, is_enabled: true }],
    sms_sbfp_programs: [PROGRAM],
    sms_sbfp_contacts: [],
    sms_sbfp_kitchens: [],
    sms_sbfp_kitchen_logs: [],
    sms_sbfp_dispatch_logs: [],
    sms_sbfp_receiving_logs: [],
    sms_sbfp_quality_questions: [
      { id: 1, code: "q1", kind: "face", prompt: "Lami ba ang pagkaon?", sort_order: 1, is_active: true },
    ],
    sms_sbfp_quality_responses: [],
    sms_sbfp_beneficiaries: [],
    sms_sbfp_feedback: [],
    sms_sbfp_deliveries: [],
    sms_sbfp_delivery_meals: [],
    sms_sbfp_feeding_days: [],
    sms_staff_designations: [],
    sms_sections: [SECTION],
    sms_school_settings: [],
    ...extra,
  });
  await page.goto("/sbfp");
  await expect(page.getByRole("tab", { name: "Monitoring" })).toBeEnabled();
  return mock;
}

const openMonitoring = async (page: Page, tool: string) => {
  await page.getByRole("tab", { name: "Monitoring" }).click();
  await page.getByRole("tab", { name: tool }).click();
};

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("a teacher is told the module is view only and cannot save on the Program tab", async ({ page }) => {
  await openModule(page, "teacher");
  await expect(page.getByText("View only, except Hot Meals Quality evaluations")).toBeVisible();
  // The form has rendered, so the missing Save below is the rule and not a blank tab.
  await expect(page.getByText("Form header")).toBeVisible();
  await expect(page.getByRole("textbox").first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
});

for (const [tabName, marker] of [
  ["Beneficiaries", "Section"],
  ["Weighing", "No beneficiaries in this section"],
  ["Daily Feeding", "Set by the focal person or school head"],
  ["Deliveries", "Print"],
] as const) {
  test(`a teacher sees ${tabName} and writes nothing there`, async ({ page }) => {
    const mock = await openModule(page, "teacher");
    await page.getByRole("tab", { name: tabName }).click();
    await expect(page.getByRole("tabpanel").getByText(marker).first()).toBeVisible();
    await expect(page.getByRole("tabpanel").getByRole("button", { name: /^(Save|Add|Mark every school day)/ })).toHaveCount(0);
    expect(mock.writes.filter((w) => w.table.startsWith("sms_sbfp_"))).toHaveLength(0);
  });
}

test("a teacher does not open the year's programme by visiting the page", async ({ page }) => {
  const mock = await installSupabaseMock(page, {
    sms_users: [account("teacher")],
    sms_sbfp_settings: [{ id: true, is_enabled: true }],
    sms_sbfp_programs: [],
    sms_sbfp_contacts: [],
    sms_staff_designations: [],
    sms_sections: [SECTION],
    sms_school_settings: [],
  });
  await page.goto("/sbfp");
  await expect(page.getByText(/No feeding programme has been opened/)).toBeVisible();
  expect(mock.writesTo("sms_sbfp_programs")).toHaveLength(0);
});

for (const tool of ["Kitchen", "Food Dispatch", "Receiving & Feeding"]) {
  test(`a teacher has no entry form on Monitoring > ${tool}`, async ({ page }) => {
    await openModule(page, "teacher");
    await openMonitoring(page, tool);
    await expect(page.getByText(/^Read only\. /)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  });
}

test("a teacher has no entry form on Feedback Mechanism", async ({ page }) => {
  await openModule(page, "teacher");
  await page.getByRole("tab", { name: "Feedback Mechanism" }).click();
  await expect(page.getByText("Record an issue or concern")).toHaveCount(0);
});

test("a teacher can submit a Hot Meals Quality evaluation", async ({ page }) => {
  const mock = await openModule(page, "teacher");
  await openMonitoring(page, "Hot Meals Quality");
  await expect(page.getByText(/^Read only\. /)).toHaveCount(0);
  await page.getByRole("button", { name: "Oo gyud" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => mock.writesTo("sms_sbfp_quality_responses").map((w) => w.body))
    .toContainEqual(expect.objectContaining({ answers: { "1": 5 } }));
});

test("Barangay shows a required list of all 43, and saves the one chosen", async ({ page }) => {
  const mock = await openModule(page, "school_head");
  await openMonitoring(page, "Kitchen");

  await expect(page.getByRole("combobox", { name: "Barangay", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Assigned kitchen" }).click();
  await page.getByRole("option", { name: "Barangay", exact: true }).click();

  // Required: nothing is written until one is chosen.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Select the barangay")).toBeVisible();
  expect(mock.writesTo("sms_sbfp_kitchen_logs")).toHaveLength(0);

  await page.getByRole("combobox", { name: "Barangay", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(BAYUGAN_BARANGAYS.length);
  await page.getByRole("option", { name: "Santo Niño", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => mock.writesTo("sms_sbfp_kitchen_logs").map((w) => w.body))
    .toContainEqual(expect.objectContaining({ kitchen_id: null, kitchen_barangay: "Santo Niño" }));
});

test("going back to At school site clears the barangay", async ({ page }) => {
  const mock = await openModule(page, "school_head");
  await openMonitoring(page, "Kitchen");
  await page.getByRole("combobox", { name: "Assigned kitchen" }).click();
  await page.getByRole("option", { name: "Barangay", exact: true }).click();
  await page.getByRole("combobox", { name: "Assigned kitchen" }).click();
  await page.getByRole("option", { name: "At school site" }).click();
  await expect(page.getByRole("combobox", { name: "Barangay", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => mock.writesTo("sms_sbfp_kitchen_logs").map((w) => w.body))
    .toContainEqual(expect.objectContaining({ kitchen_id: null, kitchen_barangay: null }));
});

test("a filed barangay entry names it in the list", async ({ page }) => {
  await openModule(page, "school_head", {
    sms_sbfp_kitchen_logs: [
      {
        id: 1,
        program_id: PROGRAM.id,
        logged_at: `${PROGRAM.school_year.slice(0, 4)}-07-01T00:00:00Z`,
        kitchen_id: null,
        kitchen_barangay: "Poblacion",
        target_school_ids: [],
        actual_school_ids: [],
        hygiene_checklist: {},
        vehicle_checklist: {},
        created_by: TEST_USER.systemUserId,
      },
    ],
  });
  await openMonitoring(page, "Kitchen");
  await page.getByRole("combobox").filter({ hasText: /[A-Za-z]+ \d{4}|All months/ }).first().click();
  await page.getByRole("option", { name: "All months" }).click();
  await expect(page.getByRole("cell", { name: "Barangay Poblacion" })).toBeVisible();
});

// Migration 233: Food Dispatch offers the same Barangay choice as the Kitchen tool.
test("Food Dispatch: Barangay is required and saves the one chosen", async ({ page }) => {
  const mock = await openModule(page, "school_head");
  await openMonitoring(page, "Food Dispatch");

  await page.getByRole("combobox", { name: "Assigned kitchen" }).click();
  await page.getByRole("option", { name: "Barangay", exact: true }).click();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Select the barangay")).toBeVisible();
  expect(mock.writesTo("sms_sbfp_dispatch_logs")).toHaveLength(0);

  await page.getByRole("combobox", { name: "Barangay", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(BAYUGAN_BARANGAYS.length);
  await page.getByRole("option", { name: "Santo Niño", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => mock.writesTo("sms_sbfp_dispatch_logs").map((w) => w.body))
    .toContainEqual(expect.objectContaining({ kitchen_id: null, kitchen_barangay: "Santo Niño" }));
});

test("Food Dispatch: a filed barangay entry names it in the list", async ({ page }) => {
  await openModule(page, "school_head", {
    sms_sbfp_dispatch_logs: [
      {
        id: 1,
        program_id: PROGRAM.id,
        logged_at: `${PROGRAM.school_year.slice(0, 4)}-07-01T00:00:00Z`,
        kitchen_id: null,
        kitchen_barangay: "Poblacion",
        school_ids: [],
        created_by: TEST_USER.systemUserId,
      },
    ],
  });
  await openMonitoring(page, "Food Dispatch");
  await page.getByRole("combobox").filter({ hasText: /[A-Za-z]+ \d{4}|All months/ }).first().click();
  await page.getByRole("option", { name: "All months" }).click();
  await expect(page.getByRole("cell", { name: "Barangay Poblacion" })).toBeVisible();
});
