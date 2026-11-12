/**
 * RMA scoresheet: the Levelling Guide follows the selected section's grade
 * level — its key stage in the title, and the bands of that grade's material.
 */
import { expect, test } from "@playwright/test";
import { getCurrentSchoolYear } from "../lib/utils/schoolYear";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const SY = getCurrentSchoolYear();

const section = (id: number, name: string, grade: number) => ({
  id,
  name,
  grade_level: grade,
  school_id: TEST_USER.schoolId,
  school_year: SY,
  section_adviser_id: TEST_USER.systemUserId,
  is_active: true,
});

const material = (id: number, grade: number) => ({
  id,
  title: `RMA Grade ${grade}`,
  grade_level: grade,
  school_id: null,
  is_active: true,
});

const band = (id: number, materialId: number, position: number, min: number, max: number, label: string) => ({
  id,
  material_id: materialId,
  position,
  min_score: min,
  max_score: max,
  label,
});

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("the guide follows the selected section's grade level and material", async ({ page }) => {
  await installSupabaseMock(page, {
    sms_users: [
      {
        id: TEST_USER.systemUserId,
        user_id: TEST_USER.authId,
        email: TEST_USER.email,
        name: TEST_USER.name,
        type: "teacher",
        school_id: TEST_USER.schoolId,
        is_active: true,
      },
    ],
    sms_sections: [section(1, "Rizal", 2), section(2, "Mabini", 5), section(3, "Bonifacio", 11)],
    sms_rma_materials: [material(10, 2), material(20, 5), material(30, 11)],
    sms_rma_items: [],
    sms_rma_bands: [
      band(1, 10, 0, 0, 74.99, "Intervention"),
      band(2, 10, 1, 75, 84.99, "Consolidation"),
      band(3, 10, 2, 85, 100, "Enhancement"),
      band(4, 20, 0, 0, 59.99, "Intervention"),
      band(5, 20, 1, 60, 79.99, "Consolidation"),
      band(6, 20, 2, 80, 100, "Enhancement"),
      band(7, 30, 0, 0, 74.99, "Intervention"),
    ],
    sms_enrollments: [],
    sms_students: [],
    sms_rma_records: [],
    sms_school_settings: [],
    sms_staff_designations: [],
    sms_role_menu_access: [],
  });
  await page.goto("/teacher/assessments/rma");

  // Before a section is picked: the KS1 profile.
  await expect(page.getByText("KS1 Levelling Guide (Percentage)", { exact: true })).toBeVisible();

  await page.getByRole("combobox").filter({ hasText: "Select advisory section" }).click();
  await page.getByRole("option", { name: /Rizal/ }).click();
  await expect(page.getByText("KS1 Levelling Guide (Percentage) — Grade 2")).toBeVisible();
  await expect(page.getByText("Below 75%: Intervention")).toBeVisible();

  await page.getByRole("combobox").filter({ hasText: /Rizal/ }).click();
  await page.getByRole("option", { name: /Mabini/ }).click();
  await expect(page.getByText("KS2 Levelling Guide (Percentage) — Grade 5")).toBeVisible();
  await expect(page.getByText("Below 60%: Intervention")).toBeVisible();
  await expect(page.getByText("60–79%: Consolidation")).toBeVisible();
  await expect(page.getByText("80% and above: Enhancement")).toBeVisible();

  await page.getByRole("combobox").filter({ hasText: /Mabini/ }).click();
  await page.getByRole("option", { name: /Bonifacio/ }).click();
  await expect(page.getByText("KS4 Levelling Guide (Percentage) — Grade 11")).toBeVisible();
});
