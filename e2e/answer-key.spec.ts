/**
 * Answer key editor.
 *
 * The assertions are on what the page WROTE, not on what it displayed: a key
 * that renders correctly but persists the wrong letters mis-scores a whole
 * class silently, and that is exactly the failure a screenshot test would miss.
 */

import { expect, test } from "@playwright/test";
import {
  DIVISION_EXAM,
  EXAM_ID,
  OWNED_EXAM,
  TEN_ITEM_KEY_ROWS,
} from "./support/fixtures";
import { installSupabaseMock, seedSession } from "./support/supabaseMock";

const WORKSPACE = `/teacher/examinations/exam/${EXAM_ID}`;

interface KeyWriteRow {
  exam_id: number;
  item_number: number;
  correct_answer: string | null;
  choice_count: number;
  points: number;
}

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("pasting a key writes exactly those answers", async ({ page }) => {
  const mock = await installSupabaseMock(page, {
    sms_exams: [OWNED_EXAM],
    sms_exam_answer_keys: [],
  });

  await page.goto(WORKSPACE);
  await expect(
    page.getByRole("heading", { name: /Periodical Test in Science 5/ }),
  ).toBeVisible();

  await page.getByLabel("Number of items").fill("5");
  await page.getByRole("button", { name: "Apply" }).click();

  await page.getByRole("button", { name: "Paste key" }).click();
  await page.getByLabel(/Paste the key/).fill("ACBDA");
  await page.getByRole("button", { name: "Read answers" }).click();

  // The grid reflects the paste before anything is saved.
  await expect(
    page.getByRole("button", { name: "Item 1 answer A" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Item 2 answer C" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Save answer key" }).click();
  await expect(page.getByText("Answer key saved.")).toBeVisible();

  const writes = mock.writesTo("sms_exam_answer_keys");
  const upsert = writes.find((w) => w.method === "POST");
  expect(upsert, "the key should be upserted").toBeTruthy();

  const rows = upsert?.body as KeyWriteRow[];
  expect(rows).toHaveLength(5);
  expect(rows.map((r) => r.correct_answer)).toEqual(["A", "C", "B", "D", "A"]);
  expect(rows.map((r) => r.item_number)).toEqual([1, 2, 3, 4, 5]);
  expect(rows.every((r) => r.exam_id === EXAM_ID)).toBe(true);
  expect(rows.every((r) => r.choice_count === 4)).toBe(true);
});

test("clicking a letter sets it, and clicking it again clears it", async ({
  page,
}) => {
  const mock = await installSupabaseMock(page, {
    sms_exams: [OWNED_EXAM],
    sms_exam_answer_keys: TEN_ITEM_KEY_ROWS,
  });

  await page.goto(WORKSPACE);
  await expect(page.getByText("10 items keyed")).toBeVisible();

  // Item 1 is seeded as A; move it to D, then clear item 2 entirely.
  await page.getByRole("button", { name: "Item 1 answer D" }).click();
  await page.getByRole("button", { name: "Item 2 answer C" }).click();

  await expect(page.getByText("9 of 10 items keyed")).toBeVisible();

  await page.getByRole("button", { name: "Save answer key" }).click();
  await expect(page.getByText("Answer key saved.")).toBeVisible();

  const rows = mock
    .writesTo("sms_exam_answer_keys")
    .find((w) => w.method === "POST")?.body as KeyWriteRow[];

  expect(rows[0].correct_answer).toBe("D");
  expect(rows[1].correct_answer).toBeNull();
  expect(rows[2].correct_answer).toBe("B");
});

test("narrowing an item's choices drops a key that would fall off the sheet", async ({
  page,
}) => {
  const mock = await installSupabaseMock(page, {
    sms_exams: [OWNED_EXAM],
    sms_exam_answer_keys: TEN_ITEM_KEY_ROWS,
  });

  await page.goto(WORKSPACE);
  await expect(page.getByText("10 items keyed")).toBeVisible();

  // Item 4 is keyed D. Printing it with two circles leaves no D to shade, so
  // the key must be cleared rather than left pointing at a bubble that is gone.
  await page
    .getByLabel("Item 4 choices")
    .click();
  await page.getByRole("option", { name: "2", exact: true }).click();

  await expect(
    page.getByRole("button", { name: "Item 4 answer B" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Item 4 answer D" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Save answer key" }).click();
  await expect(page.getByText("Answer key saved.")).toBeVisible();

  const rows = mock
    .writesTo("sms_exam_answer_keys")
    .find((w) => w.method === "POST")?.body as KeyWriteRow[];

  expect(rows[3].choice_count).toBe(2);
  expect(rows[3].correct_answer).toBeNull();
});

test("a division-authored exam is read-only and writes nothing", async ({
  page,
}) => {
  const mock = await installSupabaseMock(page, {
    sms_exams: [DIVISION_EXAM],
    sms_exam_answer_keys: TEN_ITEM_KEY_ROWS,
  });

  await page.goto(WORKSPACE);

  // The subtitle marks the exam's provenance; the notice explains the lock.
  await expect(
    page.getByText(/Set A · Science · Grade 5 .* division office/),
  ).toBeVisible();
  await expect(
    page.getByText(/so its answer key is read-only here/),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Save answer key" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Item 1 answer D" }),
  ).toBeDisabled();

  expect(mock.writesTo("sms_exam_answer_keys")).toHaveLength(0);
});
