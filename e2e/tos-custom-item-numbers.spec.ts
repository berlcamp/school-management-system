/**
 * TOS custom item numbering: a competency's items need not be consecutive
 * (competency 1 on items 1, 4 and 9). Against the intercepted Supabase.
 */
import { expect, test } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const AUTHORIZED = { sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }] };
const MATH = { id: 3, name: "Mathematics", is_active: true };

const CATALOGUE = [
  { id: 41, learning_area_id: 3, grade_level: 5, lc_code: "M5NS-ID-4", competency_text: "Divides fractions", is_active: true },
  { id: 42, learning_area_id: 3, grade_level: 5, lc_code: "M5NS-ID-5", competency_text: "Multiplies fractions", is_active: true },
];

const TOS = {
  id: 7201,
  title: "Mathematics 5 Q1 Division TOS",
  subject_name: "Mathematics",
  learning_area_id: 3,
  grade_level: 5,
  school_year: "2026-2027",
  grading_period: 1,
  exam_type: "Summative Test",
  total_items: 5,
  total_days: 10,
  school_id: null,
  is_school_shared: false,
  created_by: TEST_USER.systemUserId,
  is_active: true,
  review_status: "draft",
  review_comment: null,
  legend: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const COMPETENCIES = [
  { id: 6101, tos_id: 7201, competency_text: "Divides fractions", lc_code: "M5NS-ID-4", catalogue_competency_id: 41, no_of_days: 4, no_of_items: 2, position: 0 },
  { id: 6102, tos_id: 7201, competency_text: "Multiplies fractions", lc_code: "M5NS-ID-5", catalogue_competency_id: 42, no_of_days: 6, no_of_items: 3, position: 1 },
];

// Saved by hand: competency 1 on items 1 and 4, competency 2 on 2, 3 and 5.
const ITEMS = [
  { id: 1, tos_id: 7201, competency_id: 6101, item_number: 1, cognitive_level: "remembering" },
  { id: 2, tos_id: 7201, competency_id: 6102, item_number: 2, cognitive_level: "remembering" },
  { id: 3, tos_id: 7201, competency_id: 6102, item_number: 3, cognitive_level: "applying" },
  { id: 4, tos_id: 7201, competency_id: 6101, item_number: 4, cognitive_level: "analyzing" },
  { id: 5, tos_id: 7201, competency_id: 6102, item_number: 5, cognitive_level: "evaluating" },
];

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("a TOS placed by hand reopens that way and saves the numbers the teacher typed", async ({ page }) => {
  const mock = await installSupabaseMock(page, {
    ...AUTHORIZED,
    sms_tos: [TOS],
    sms_learning_areas: [MATH],
    sms_competency_catalogue: CATALOGUE,
    sms_tos_competencies: COMPETENCIES,
    sms_tos_items: ITEMS,
  });
  await page.goto("/teacher/examinations/division/tos");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();

  const toggle = page.getByRole("switch", { name: "Place item numbers myself" });
  await expect(toggle).toBeChecked();
  const fields = page.getByRole("textbox", { name: "Item nos." });
  await expect(fields.nth(0)).toHaveValue("1, 4");
  await expect(fields.nth(1)).toHaveValue("2–3, 5");

  // Put the same item under both competencies: Save is refused with a reason.
  await fields.nth(0).fill("1, 2");
  await fields.nth(0).press("Enter");
  await expect(page.getByText("Item 2 is placed under both competency 1 and competency 2.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  // The help-desk case: competency 1 on items 1 and 5, competency 2 between.
  await fields.nth(0).fill("1, 5");
  await fields.nth(0).press("Enter");
  await fields.nth(1).fill("2-4");
  await fields.nth(1).press("Enter");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect
    .poll(() => mock.writesTo("sms_tos_items").filter((w) => w.method === "POST").length)
    .toBe(1);
  const insert = mock.writesTo("sms_tos_items").find((w) => w.method === "POST");
  const rows = (insert?.body as { competency_id: number; item_number: number; cognitive_level: string }[])
    .map((r) => [r.competency_id, r.item_number, r.cognitive_level]);
  expect(rows).toEqual([
    // Levels follow the competency's items in ascending order.
    [6101, 1, "remembering"],
    [6101, 5, "analyzing"],
    [6102, 2, "remembering"],
    [6102, 3, "applying"],
    [6102, 4, "evaluating"],
  ]);
});

test("automatic numbering is unchanged: items run in competency order", async ({ page }) => {
  const mock = await installSupabaseMock(page, {
    ...AUTHORIZED,
    sms_tos: [TOS],
    sms_learning_areas: [MATH],
    sms_competency_catalogue: CATALOGUE,
    sms_tos_competencies: COMPETENCIES,
    sms_tos_items: [],
  });
  await page.goto("/teacher/examinations/division/tos");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();

  await expect(page.getByRole("switch", { name: "Place item numbers myself" })).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: "Item nos." })).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(() => mock.writesTo("sms_tos_items").filter((w) => w.method === "POST").length)
    .toBe(1);
  const insert = mock.writesTo("sms_tos_items").find((w) => w.method === "POST");
  const numbers = (insert?.body as { competency_id: number; item_number: number }[])
    .map((r) => [r.competency_id, r.item_number]);
  expect(numbers).toEqual([
    [6101, 1],
    [6101, 2],
    [6102, 3],
    [6102, 4],
    [6102, 5],
  ]);
});
