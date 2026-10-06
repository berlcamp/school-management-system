/**
 * Competency Catalogue (migration 195) screen, against the intercepted
 * Supabase: the learning-area picker, the grade picker with counts, the
 * retired toggle, the add-area / add-competency dialogs, and the Excel import
 * dialog's check-before-import step.
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

async function pickArea(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Learning area" }).click();
  await page.getByRole("option", { name }).click();
}

async function open(page: Page) {
  const mock = await installSupabaseMock(page, {
    sms_users: [DIVISION_ADMIN],
    sms_learning_areas: AREAS,
    sms_competency_catalogue: COMPETENCIES,
  });
  await page.goto("/division/competencies");
  // Areas list alphabetically, so the page opens on English (first active).
  await expect(page.getByRole("combobox", { name: "Learning area" })).toContainText("English");
  await pickArea(page, "Mathematics");
  return mock;
}

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("lists areas with retired ones apart, shows per-grade counts and hides retired entries", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("combobox", { name: "Learning area" })).toContainText("Mathematics");

  // The retired area sits under its own heading in the picker.
  await page.getByRole("combobox", { name: "Learning area" }).click();
  await expect(page.getByRole("group", { name: "Retired" }).getByRole("option", { name: "Old Area" })).toBeVisible();
  await page.keyboard.press("Escape");

  const grade = page.getByRole("combobox", { name: "Grade level" });
  await expect(grade).toContainText("Grade 1");
  await expect(grade).toContainText("2");

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

test("a learning area is added from a dialog, not from the page", async ({ page }) => {
  const mock = await open(page);
  await page.getByRole("combobox", { name: "Learning area" }).click();
  await page.getByRole("option", { name: "New learning area" }).click();

  const dialog = page.getByRole("dialog", { name: "New learning area" });
  await expect(dialog.getByRole("button", { name: "Add learning area" })).toBeDisabled();
  await dialog.getByLabel("Name").fill("Science");
  await dialog.getByRole("button", { name: "Add learning area" }).click();

  await expect(dialog).toBeHidden();
  await expect.poll(() => mock.writesTo("sms_learning_areas").map((w) => w.body)).toContainEqual([{ name: "Science" }]);
});

test("a competency is added from a dialog into the picked area and grade", async ({ page }) => {
  const mock = await open(page);
  await page.getByRole("button", { name: "Add competency" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Add competency" });
  await expect(dialog.getByText("Mathematics · Grade 1")).toBeVisible();
  await dialog.getByLabel("LC code").fill("M1NS-IA-4.1");
  await dialog.getByLabel("Competency").fill("Reads numbers up to 100");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect
    .poll(() => mock.writesTo("sms_competency_catalogue").map((w) => w.body))
    .toContainEqual([
      { learning_area_id: 3, grade_level: 1, lc_code: "M1NS-IA-4.1", competency_text: "Reads numbers up to 100" },
    ]);
});

test("retiring a competency waits for confirmation", async ({ page }) => {
  const mock = await open(page);
  await page.getByRole("button", { name: "Retire M1NS-IA-1.1" }).click();

  const dialog = page.getByRole("dialog", { name: "Retire M1NS-IA-1.1?" });
  await expect(dialog).toBeVisible();
  expect(mock.writesTo("sms_competency_catalogue")).toHaveLength(0);

  await dialog.getByRole("button", { name: "Retire" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => mock.writesTo("sms_competency_catalogue").map((w) => w.body)).toContainEqual({ is_active: false });
});
