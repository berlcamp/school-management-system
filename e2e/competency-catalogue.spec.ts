/**
 * Competency Catalogue (migration 195) screen, against the intercepted
 * Supabase: the redesigned area rail, grade chips with counts, the retired
 * toggle, and the Excel import dialog's check-before-import step.
 */
import { expect, test, type Page } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const DIVISION_ADMIN = {
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: "Division Admin",
  type: "division_admin",
  school_id: null,
  is_active: true,
};

const AREAS = [
  { id: 3, name: "Mathematics", is_active: true },
  { id: 4, name: "English", is_active: true },
  { id: 9, name: "Old Area", is_active: false },
];

const entry = (id: number, grade: number, lc: string, text: string, active = true) => ({
  id,
  learning_area_id: 3,
  grade_level: grade,
  lc_code: lc,
  competency_text: text,
  is_active: active,
});

const COMPETENCIES = [
  entry(41, 1, "M1NS-IA-1.1", "Visualizes numbers from 0 to 100"),
  entry(42, 1, "M1NS-IA-2.1", "Counts the number of objects in a set"),
  entry(43, 1, "M1NS-IA-3.1", "An old wording, since replaced", false),
  entry(44, 5, "M5NS-ID-4", "Divides fractions"),
];

async function open(page: Page) {
  const mock = await installSupabaseMock(page, {
    sms_users: [DIVISION_ADMIN],
    sms_learning_areas: AREAS,
    sms_competency_catalogue: COMPETENCIES,
  });
  await page.goto("/division/competencies");
  // Areas list alphabetically, so the page opens on English (first active).
  await expect(page.getByRole("heading", { name: "English", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Mathematics", exact: true }).click();
  return mock;
}

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("lists areas with retired ones apart, shows per-grade counts and hides retired entries", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: "Mathematics", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mathematics", exact: true })).toHaveAttribute("aria-current", "true");
  // The retired area sits under its own heading in the rail.
  await expect(page.getByText("Retired", { exact: true }).first()).toBeVisible();

  const grade1 = page.getByRole("group", { name: "Grade level" }).getByRole("button", { name: /Grade 1\b/ });
  await expect(grade1).toHaveAttribute("aria-pressed", "true");
  await expect(grade1).toContainText("2");

  await expect(page.getByText("Visualizes numbers from 0 to 100")).toBeVisible();
  await expect(page.getByText("An old wording, since replaced")).toBeHidden();
  await page.getByLabel("Show retired").click();
  await expect(page.getByText("An old wording, since replaced")).toBeVisible();

  await page.screenshot({ path: "test-results/catalogue-light.png", fullPage: true });
});

test("search narrows the list and says when nothing matches", async ({ page }) => {
  await open(page);
  await page.getByLabel("Search competencies").fill("counts");
  await expect(page.getByText("Counts the number of objects in a set")).toBeVisible();
  await expect(page.getByText("Visualizes numbers from 0 to 100")).toBeHidden();
  await page.getByLabel("Search competencies").fill("zzz");
  await expect(page.getByText("No competency matches “zzz”.")).toBeVisible();
});

test("the import dialog explains the sheet, then shows what will be imported and skipped", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Import from Excel" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Prepare the sheet")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Import 0 rows/ })).toBeDisabled();
  await expect(dialog.getByText("Choose a file to import.")).toBeVisible();

  await page.screenshot({ path: "test-results/catalogue-import-empty.png" });

  const csv = [
    "Learning Area,Grade,LC Code,Competency",
    "Mathematics,1,M1NS-IA-9.9,Compares numbers using less than and greater than",
    "Mathematics,14,M1NS-IA-9.8,Out of range grade",
  ].join("\n");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "math.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  await expect(dialog.getByText("math.csv")).toBeVisible();
  await expect(dialog.getByText("Check before importing")).toBeVisible();
  await expect(dialog.getByText(/Rows that will be skipped \(1\)/)).toBeVisible();
  await expect(dialog.getByText(/Row 3:/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Import 1 row" })).toBeEnabled();

  await page.screenshot({ path: "test-results/catalogue-import-checked.png" });
});
