/**
 * The Print infographic button on /sbfp-viewer, against the intercepted
 * Supabase: it downloads a one-page PDF named after the filters.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const VIEWER = {
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: "SBFP Viewer",
  type: "sbfp_viewer",
  school_id: null,
  is_active: true,
};

const school = (id: number, name: string, district: string, n: number) => ({
  school_id: id,
  school_name: name,
  district,
  program_id: id,
  is_last_mile_school: false,
  feeding_start_date: "2026-07-01",
  feeding_end_date: "2026-11-30",
  has_grade_band: true,
  beneficiaries: n,
  male: Math.round(n * 0.54),
  female: n - Math.round(n * 0.54),
  primary_count: Math.round(n * 0.8),
  secondary_count: n - Math.round(n * 0.8),
  milk_participants: Math.round(n * 0.7),
  baseline_weighed: n,
  midline_weighed: Math.round(n * 0.9),
  endline_weighed: Math.round(n * 0.8),
  wasted_at_baseline: Math.round(n * 0.85),
  rehabilitated: Math.round(n * 0.52),
  feeding_days: 100,
  days_present: n * 91,
  deliveries: 12,
  packs_new: n * 90,
  packs_replacement: 40,
  packs_rejected: 15,
  hot_meal_deliveries: 30,
  servings_new: n * 30,
  servings_replacement: 12,
  servings_rejected: 4,
  feedback_open: 1,
  feedback_in_progress: 1,
  feedback_resolved: 6,
  kitchen_logs: 40,
  dispatch_logs: 38,
  receiving_logs: 76,
  quality_evaluations: 22,
});

const SCHOOLS = [
  school(1, "Aspen Elementary School", "Central District", 420),
  school(2, "Birch Integrated School", "North District", 310),
  school(3, "Cedar Central School", "South District", 268),
  school(4, "Dogwood Elementary School", "East District", 195),
  school(5, "Elm National High School", "West District", 142),
];

const nutrition = (period: string, bands: Record<string, number>) =>
  Object.entries(bands).map(([nutritional_status, learners]) => ({
    school_id: 1,
    period,
    grade_level: 3,
    sex: "male",
    nutritional_status,
    height_for_age: "normal",
    learners,
  }));

const BENEFICIARIES = [
  ...nutrition("baseline", { severely_wasted: 310, wasted: 825, normal: 200 }),
  ...nutrition("midline", { severely_wasted: 120, wasted: 480, normal: 590, overweight: 12 }),
  ...nutrition("endline", { severely_wasted: 40, wasted: 240, normal: 760, overweight: 28 }),
];
const ALL_LEARNERS = [
  ...nutrition("baseline", { severely_wasted: 410, wasted: 1100, normal: 12400, overweight: 520, obese: 170 }),
  ...nutrition("endline", { severely_wasted: 220, wasted: 730, normal: 13100, overweight: 560, obese: 190 }),
];

test("downloads a one-page PDF of the dashboard's figures", async ({ page, context, baseURL }) => {
  await seedSession(context, baseURL as string);
  await installSupabaseMock(
    page,
    { sms_users: [VIEWER], sms_sbfp_settings: [{ id: true, is_enabled: true }] },
    {
      sbfp_division_overview: () => SCHOOLS,
      sbfp_division_nutrition: () => BENEFICIARIES,
      sbfp_division_learner_nutrition: () => ALL_LEARNERS,
      sbfp_division_enrolled: () => [],
    },
  );
  await page.goto("/sbfp-viewer");

  const button = page.getByRole("button", { name: "Print infographic" });
  await expect(button).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Nutritional status of beneficiaries" })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toMatch(/^SBFP-Infographic-\d{4}-\d{4}\.pdf$/);

  const path = process.env.SBFP_INFOGRAPHIC_OUT ?? (await download.path());
  if (process.env.SBFP_INFOGRAPHIC_OUT) await download.saveAs(path);
  const pdf = fs.readFileSync(path).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
});
