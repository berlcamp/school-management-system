/**
 * Role Permissions (migration 232) and the School Counselor Associate role,
 * against the intercepted Supabase.
 */
import { expect, test } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const me = (type: string, name: string) => ({
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name,
  type,
  school_id: TEST_USER.schoolId,
  is_active: true,
});

const BASE = {
  sms_staff_designations: [],
  sms_department_head_subjects: [],
  sms_user_roles: [],
  sms_user_schools: [],
  sms_schools: [{ id: TEST_USER.schoolId, name: "Test School", is_active: true }],
  sms_sections: [],
};

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("a School Counselor Associate gets the guidance pages", async ({ page }) => {
  await installSupabaseMock(page, {
    ...BASE,
    sms_users: [me("school_counselor_associate", "Counselor Associate")],
    sms_role_menu_access: [],
  });
  await page.goto("/home");
  const sidebar = page.locator("[data-sidebar=sidebar]").first();
  for (const name of ["Anecdotal Record", "Manifestation Tagging", "Learner Cardex"]) {
    await expect(sidebar.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(sidebar.getByRole("link", { name: "Class Record" })).toHaveCount(0);
});

test("a page switched off leaves the menu and is refused", async ({ page }) => {
  await installSupabaseMock(page, {
    ...BASE,
    sms_users: [me("school_counselor_associate", "Counselor Associate")],
    sms_role_menu_access: [
      { user_type: "school_counselor_associate", item_key: "/teacher/cardex", is_enabled: false },
    ],
  });
  await page.goto("/teacher/cardex");
  await expect(page.getByText("You do not have permission to view this page.")).toBeVisible();
  const sidebar = page.locator("[data-sidebar=sidebar]").first();
  await expect(sidebar.getByRole("link", { name: "Anecdotal Record", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Learner Cardex" })).toHaveCount(0);
});

test("the super admin's matrix saves only what changed", async ({ page }) => {
  const mock = await installSupabaseMock(page, {
    ...BASE,
    sms_users: [me("super admin", "Super Admin")],
    sms_role_menu_access: [],
  });
  await page.goto("/division/permissions");
  await expect(page.getByRole("heading", { name: "Role Permissions" })).toBeVisible();

  const cardexForSca = page.getByRole("checkbox", {
    name: "School Counselor Associate: Learner Cardex",
  });
  await expect(cardexForSca).toBeChecked();
  await cardexForSca.uncheck();
  await page.getByRole("checkbox", { name: "School Nurse: Learner Cardex" }).check();
  await page.getByRole("button", { name: "Save 2 changes" }).click();

  await expect
    .poll(() => mock.writesTo("rpc/role_menu_access_save").map((w) => w.body))
    .toContainEqual({
      p_changes: [
        { user_type: "school_counselor_associate", item_key: "/teacher/cardex", is_enabled: false },
        { user_type: "school_nurse", item_key: "/teacher/cardex", is_enabled: true },
      ],
    });
});

test("nobody but the super admin opens the matrix", async ({ page }) => {
  await installSupabaseMock(page, {
    ...BASE,
    sms_users: [me("school_head", "School Head")],
    sms_role_menu_access: [],
  });
  await page.goto("/division/permissions");
  await expect(page).toHaveURL(/\/home$/);
});
