/**
 * The /staff modal's Position field and the SBFP Coordinator designation
 * (migration 229), against the intercepted Supabase.
 */
import { expect, test, type Page } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const HEAD = {
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: "School Head",
  type: "school_head",
  school_id: TEST_USER.schoolId,
  is_active: true,
};

const colleague = (id: number, name: string, position: string | null) => ({
  id,
  user_id: null,
  email: `${name.toLowerCase().replace(/\s/g, ".")}@deped.test`,
  name,
  type: "teacher",
  school_id: TEST_USER.schoolId,
  is_active: true,
  position,
  gender: "female",
});

const LISTED = colleague(601, "Ana Santos", "TEACHER III");
const UNLISTED = colleague(602, "Ben Cruz", "Reading Specialist");

async function openStaff(page: Page) {
  const mock = await installSupabaseMock(page, {
    sms_users: [HEAD, LISTED, UNLISTED],
    sms_staff_designations: [],
    sms_department_head_subjects: [],
    sms_subjects: [],
    sms_sections: [],
    sms_user_roles: [],
    sms_user_schools: [],
  });
  await page.goto("/staff");
  await expect(page.getByRole("cell", { name: LISTED.name })).toBeVisible();
  return mock;
}

async function openEdit(page: Page, name: string) {
  await page.getByRole("row", { name: new RegExp(name) }).getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
}

const positionField = (page: Page) => page.getByRole("dialog").getByRole("combobox").first();

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("a position picked on a new staff member is saved", async ({ page }) => {
  const mock = await openStaff(page);
  await page.getByRole("button", { name: /Add/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Enter full name").fill("Cara Reyes");
  await dialog.getByPlaceholder("staff@example.com").fill("cara@deped.test");
  await positionField(page).click();
  await page.getByRole("option", { name: "Master Teacher I", exact: true }).click();
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Teacher", exact: true }).click();
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(() => mock.writesTo("sms_users").map((w) => w.body))
    .toContainEqual([expect.objectContaining({ name: "Cara Reyes", position: "Master Teacher I" })]);
});

test("editing opens on the saved position, tidied to its listed spelling", async ({ page }) => {
  const mock = await openStaff(page);
  await openEdit(page, LISTED.name);
  await expect(positionField(page)).toHaveText("Teacher III");
  await page.getByRole("dialog").getByRole("button", { name: "Update" }).click();
  await expect
    .poll(() => mock.writesTo("sms_users").map((w) => w.body))
    .toContainEqual(expect.objectContaining({ position: "Teacher III" }));
});

test("a position not on the list stays as typed, and sex is not overwritten", async ({ page }) => {
  const mock = await openStaff(page);
  await openEdit(page, UNLISTED.name);
  await expect(page.getByLabel("Position — specify")).toHaveValue(UNLISTED.position as string);
  await page.getByRole("dialog").getByRole("button", { name: "Update" }).click();
  await expect
    .poll(() => mock.writesTo("sms_users").map((w) => w.body))
    .toContainEqual(expect.objectContaining({ position: UNLISTED.position }));
  const body = mock.writesTo("sms_users")[0].body as Record<string, unknown>;
  expect(body).not.toHaveProperty("gender");
});

test("SBFP Coordinator is offered among the designations and saved", async ({ page }) => {
  const mock = await openStaff(page);
  await openEdit(page, LISTED.name);
  const dialog = page.getByRole("dialog");
  await dialog.getByText("SBFP Coordinator").click();
  await dialog.getByRole("button", { name: "Update" }).click();
  await expect
    .poll(() => mock.writesTo("sms_staff_designations").map((w) => w.body))
    .toContainEqual([expect.objectContaining({ user_id: LISTED.id, designation: "sbfp_coordinator" })]);
});

const COUNSELOR = { ...HEAD, name: "Guidance Counselor", type: "guidance_counselor" };

async function openFeedingAsCounselor(page: Page, designations: Record<string, unknown>[]) {
  await installSupabaseMock(page, {
    sms_users: [COUNSELOR],
    sms_staff_designations: designations,
    sms_department_head_subjects: [],
    sms_sbfp_settings: [{ id: true, is_enabled: true }],
    sms_sbfp_programs: [{ id: 70, school_id: TEST_USER.schoolId, school_year: "2026-2027" }],
    sms_sections: [],
    sms_schools: [{ id: TEST_USER.schoolId, name: "Test School", is_active: true }],
  });
  await page.goto("/sbfp");
}

test("the designation opens the module and its menu link to a role without one", async ({ page }) => {
  await openFeedingAsCounselor(page, [
    { user_id: TEST_USER.systemUserId, school_id: TEST_USER.schoolId, designation: "sbfp_coordinator", grade_levels: null },
  ]);
  await expect(page.getByRole("heading", { name: "School-Based Feeding Program" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Feeding Program" })).toBeVisible();
});

test("without the designation that role is still refused", async ({ page }) => {
  await openFeedingAsCounselor(page, []);
  await expect(page.getByRole("heading", { name: "School-Based Feeding Program" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Feeding Program" })).toHaveCount(0);
});
