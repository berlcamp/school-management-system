/**
 * Book catalogue publisher and source fields (migration 228), against the
 * intercepted Supabase: what the form writes, and what the list shows.
 */
import { expect, test, type Page } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const SCHOOL_HEAD = {
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: "School Head",
  type: "school_head",
  school_id: TEST_USER.schoolId,
  is_active: true,
};

const BOOK = {
  id: 501,
  school_id: TEST_USER.schoolId,
  title: "English Grade 7",
  subject_area: "English",
  grade_level: 7,
  isbn: null,
  quantity: 40,
  is_active: true,
  publisher: "Sample Press",
  source: "division_office",
};

// A book saved before 228 was applied carries neither field.
const OLD_BOOK = {
  ...BOOK,
  id: 502,
  title: "Science Grade 7",
  subject_area: "Science",
  publisher: null,
  source: null,
};

async function open(page: Page) {
  const mock = await installSupabaseMock(page, {
    sms_users: [SCHOOL_HEAD],
    sms_books: [BOOK, OLD_BOOK],
    sms_book_allocations: [],
  });
  await page.goto("/books");
  await expect(page.getByRole("cell", { name: BOOK.title })).toBeVisible();
  return mock;
}

async function openEdit(page: Page, title: string) {
  await page
    .getByRole("row", { name: new RegExp(title) })
    .getByRole("button", { name: "Open menu" })
    .click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
}

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("the list shows publisher and the source's label, with a dash when unset", async ({ page }) => {
  await open(page);
  const row = page.getByRole("row", { name: new RegExp(BOOK.title) });
  await expect(row.getByText("Sample Press")).toBeVisible();
  await expect(row.getByText("Division Office")).toBeVisible();

  const oldRow = page.getByRole("row", { name: new RegExp(OLD_BOOK.title) });
  await expect(oldRow.getByText("—")).toHaveCount(3); // ISBN, publisher, source
});

test("the dropdown offers exactly the four sources, and a new book saves both fields", async ({ page }) => {
  const mock = await open(page);
  await page.getByRole("button", { name: "Add Book" }).click();

  await page.getByLabel(/^Title/).fill("Filipino Grade 8");
  await page.getByLabel(/^Subject Area/).fill("Filipino");
  await page.getByLabel(/^Publisher/).fill("  Another Press  ");

  await page.getByRole("combobox", { name: "Source" }).click();
  await expect(page.getByRole("option")).toHaveText([
    "Not specified",
    "Central Office",
    "Regional Office",
    "Division Office",
    "Library Hub",
  ]);
  await page.getByRole("option", { name: "Library Hub" }).click();
  await page.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(() => mock.writesTo("sms_books").map((w) => w.body))
    .toContainEqual([
      expect.objectContaining({ publisher: "Another Press", source: "library_hub" }),
    ]);
});

test("both fields stay optional on a new book", async ({ page }) => {
  const mock = await open(page);
  await page.getByRole("button", { name: "Add Book" }).click();
  await page.getByLabel(/^Title/).fill("Filipino Grade 8");
  await page.getByLabel(/^Subject Area/).fill("Filipino");
  await page.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(() => mock.writesTo("sms_books").map((w) => w.body))
    .toContainEqual([expect.objectContaining({ publisher: null, source: null })]);
});

test("editing loads the saved values, and a source can be cleared", async ({ page }) => {
  const mock = await open(page);
  await openEdit(page, BOOK.title);

  await expect(page.getByLabel(/^Publisher/)).toHaveValue("Sample Press");
  const source = page.getByRole("combobox", { name: "Source" });
  await expect(source).toContainText("Division Office");

  await source.click();
  await page.getByRole("option", { name: "Not specified" }).click();
  await page.getByRole("button", { name: "Update" }).click();

  await expect
    .poll(() => mock.writesTo("sms_books").map((w) => w.body))
    .toContainEqual(expect.objectContaining({ publisher: "Sample Press", source: null }));
});
