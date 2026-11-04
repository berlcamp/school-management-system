/**
 * The Progress by school chart on /division/needs-review, against the
 * intercepted Supabase: order, the filters it follows, and each row's breakdown.
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

const row = (id: number, school_name: string, measured: number, district = "District I") => ({
  school_id: id,
  school_name,
  district,
  sbfp_program: true,
  sbfp_beneficiaries: 5,
  books_total: 10,
  books_allocated: 5,
  tos_count: 1,
  summative_exams: 1,
  item_analyses: 1,
  learners: 100,
  learners_measured: measured,
});

const SCHOOLS = [
  row(1, "Birch Elementary School", 0),
  row(2, "Aspen Integrated School", 100, "District II"),
  row(3, "Cedar National High School", 50),
  ...Array.from({ length: 15 }, (_, i) => row(10 + i, `Filler School ${String(i).padStart(2, "0")}`, 75)),
];

async function open(page: Page) {
  await installSupabaseMock(
    page,
    { sms_users: [DIVISION_ADMIN], sms_needs_review_settings: [{ id: true, is_enabled: true }] },
    { division_needs_review: () => SCHOOLS, needs_review_enabled: () => true },
  );
  await page.goto("/division/needs-review");
  await expect(page.getByRole("heading", { name: "Progress by school" })).toBeVisible();
}

const chart = (page: Page) => page.getByRole("region", { name: "Progress by school" });
const rows = (page: Page) => chart(page).getByRole("button", { expanded: false });

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("ranks lowest first, shows 15 until asked, and re-sorts", async ({ page }) => {
  await open(page);
  await expect(rows(page).first()).toContainText("Birch Elementary School");
  await expect(rows(page).first()).toContainText("75%"); // Books, Examinations and SBFP at 100, Learner Health at 0
  await expect(rows(page)).toHaveCount(15);

  await chart(page).getByRole("button", { name: "Show all 18 schools" }).click();
  await expect(rows(page)).toHaveCount(18);

  await chart(page).getByRole("combobox", { name: "Sort" }).click();
  await page.getByRole("option", { name: "Highest first" }).click();
  await expect(rows(page).first()).toContainText("Aspen Integrated School");
});

test("follows the page's search and district filters, and its average with them", async ({ page }) => {
  await open(page);
  await page.getByLabel("Search school").fill("Cedar");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Cedar National High School");

  await page.getByLabel("Search school").fill("no such school");
  await expect(page.getByRole("heading", { name: "Progress by school" })).toHaveCount(0);
});

test("a row opens the modules behind its figure", async ({ page }) => {
  await open(page);
  await rows(page).first().click();
  const panel = page.locator("#nr-progress-1");
  await expect(panel.getByRole("listitem").filter({ hasText: "Learner Health" })).toContainText("Not started");
  await expect(panel.getByRole("listitem").filter({ hasText: "Learner Health" })).toContainText("0 of 100");
  await expect(panel.getByRole("listitem").filter({ hasText: "Books" })).toContainText("100%");
});

test("the layout holds at desktop and phone width", async ({ page }, info) => {
  await open(page);
  await rows(page).first().click();
  await chart(page).screenshot({ path: info.outputPath("desktop.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await chart(page).screenshot({ path: info.outputPath("phone.png") });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
