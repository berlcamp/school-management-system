/**
 * Header role switcher for a division-level user (no school), against the
 * intercepted Supabase. `/division/users` saves a division user's roles at a
 * NULL school; the header offers Division User and QA Reviewer between them.
 */
import { expect, test } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const me = (type: string) => ({
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: "Division Person",
  type,
  school_id: null,
  is_active: true,
});

const role = (r: string, schoolId: number | null = null) => ({
  user_id: TEST_USER.systemUserId,
  role: r,
  school_id: schoolId,
});

const BASE = {
  sms_staff_designations: [],
  sms_department_head_subjects: [],
  sms_user_schools: [],
  sms_schools: [{ id: TEST_USER.schoolId, name: "Test School", is_active: true }],
  sms_sections: [],
  sms_role_menu_access: [],
  sms_region_account_access: [],
};

const switcher = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /^(Division User|QA Reviewer)$/ });

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("a Division User who is also a QA Reviewer switches from the header", async ({ page }) => {
  const mock = await installSupabaseMock(page, {
    ...BASE,
    sms_users: [me("division_type")],
    sms_user_roles: [role("division_type"), role("qa")],
  });
  await page.goto("/home");
  await switcher(page).click();
  await expect(page.getByRole("option", { name: "Division User" })).toBeVisible();
  await page.getByRole("option", { name: "QA Reviewer" }).click();
  await expect
    .poll(() => mock.writesTo("rpc/sms_switch_active_role").map((w) => w.body))
    .toContainEqual({ p_type: "qa" });
});

test("roles held at a school are not offered to a user with no school", async ({ page }) => {
  await installSupabaseMock(page, {
    ...BASE,
    sms_users: [me("division_type")],
    sms_user_roles: [role("division_type"), role("teacher", TEST_USER.schoolId), role("teacher")],
  });
  await page.goto("/home");
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await expect(switcher(page)).toHaveCount(0);
});

test("no switcher when the current role is not one the user holds", async ({ page }) => {
  await installSupabaseMock(page, {
    ...BASE,
    sms_users: [me("division_admin")],
    sms_user_roles: [role("division_type"), role("qa")],
  });
  await page.goto("/home");
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await expect(switcher(page)).toHaveCount(0);
});
