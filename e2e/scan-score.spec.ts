/**
 * Scan and score.
 *
 * A real answer sheet is rendered from the production layout, filled in, encoded
 * as a PNG and uploaded through the file input. The browser then runs the actual
 * decoder — no stubbing of the OMR — so this covers the join the unit tests
 * cannot: layout → print geometry → image → decode → key → saved rows.
 */

import { expect, test } from "@playwright/test";
import {
  EXAM_PAPER_OPEN,
  ENROLLMENT_ROWS,
  EXAM_ID,
  LEARNERS,
  OWNED_EXAM,
  SECTION_ROWS,
  STUDENT_ROWS,
  TEN_ITEM_KEY,
  TEN_ITEM_KEY_ROWS,
  learnerFullName,
} from "./support/fixtures";
import { renderSheetPng, renderUncutPagePng } from "./support/sheetFixture";
import { installSupabaseMock, seedSession } from "./support/supabaseMock";

const WORKSPACE = `/teacher/examinations/exam/${EXAM_ID}`;

/** The key is A C B D A B D C A B; this sheet gets items 3 and 7 wrong. */
const ANSWERS_WITH_TWO_WRONG = [
  "A",
  "C",
  "D",
  "D",
  "A",
  "B",
  "A",
  "C",
  "A",
  "B",
];

interface ResultStudentWrite {
  result_id: number;
  student_id: number;
  correct_items: number[];
  answers: string[];
  scan_source: string;
}

const seedRows = {
  sms_exams: [OWNED_EXAM],
  sms_exam_answer_keys: TEN_ITEM_KEY_ROWS,
  sms_subject_schedules: SECTION_ROWS,
  sms_enrollments: ENROLLMENT_ROWS,
  sms_students: STUDENT_ROWS,
  sms_exam_results: [],
  sms_exam_result_students: [],
};

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

async function openScanTab(page: import("@playwright/test").Page) {
  await page.goto(WORKSPACE);
  await expect(page.getByRole("tab", { name: /All 10 items keyed/ })).toBeVisible();
  await page.getByRole("tab", { name: "Scan & Score" }).click();
  await page.getByRole("combobox", { name: "Section" }).click();
  await page.getByRole("option", { name: "Rizal" }).click();
}

test("a scanned sheet is matched to its learner and scored", async ({
  page,
}) => {
  const mock = await installSupabaseMock(page, seedRows, EXAM_PAPER_OPEN);
  await openScanTab(page);

  const png = renderSheetPng({
    answerKey: TEN_ITEM_KEY,
    studentId: LEARNERS[1].id,
    answers: ANSWERS_WITH_TWO_WRONG,
  });

  await page.getByLabel("Scanned sheets").setInputFiles({
    name: "sheet-01.png",
    mimeType: "image/png",
    buffer: png,
  });

  await expect(page.getByText(/Read 1 sheet; 1 matched/)).toBeVisible();

  // Matched from the pre-printed ID block, with no human intervention.
  const learnerSelect = page.getByLabel("Learner for sheet-01.png");
  await expect(learnerSelect).toHaveValue(String(LEARNERS[1].id));

  const row = page.getByRole("row").filter({ hasText: "sheet-01.png" });
  await expect(row.getByText("matched", { exact: true })).toBeVisible();
  await expect(row).toContainText("/ 10");
  await expect(row).toContainText("80.0%");

  await page.getByRole("button", { name: /Save 1 result/ }).click();
  await expect(page.getByText(/Saved 1 learner result/)).toBeVisible();

  const rows = mock
    .writesTo("sms_exam_result_students")
    .find((w) => w.method === "POST")?.body as ResultStudentWrite[];

  expect(rows).toHaveLength(1);
  expect(rows[0].student_id).toBe(LEARNERS[1].id);
  expect(rows[0].scan_source).toBe("scan");
  // Items 3 and 7 were answered wrongly; everything else scores.
  expect(rows[0].correct_items).toEqual([1, 2, 4, 5, 6, 8, 9, 10]);
  // The raw answers are kept, including the wrong choices — this is what the
  // learner's printed slip and any distractor analysis read.
  expect(rows[0].answers).toEqual(ANSWERS_WITH_TWO_WRONG);
});

test("a blank and a double-marked item are flagged, not guessed", async ({
  page,
}) => {
  await installSupabaseMock(page, seedRows, EXAM_PAPER_OPEN);
  await openScanTab(page);

  const answers: (string | null)[] = [...ANSWERS_WITH_TWO_WRONG];
  answers[4] = null; // item 5 left blank

  const png = renderSheetPng({
    answerKey: TEN_ITEM_KEY,
    studentId: LEARNERS[0].id,
    answers,
  });

  await page.getByLabel("Scanned sheets").setInputFiles({
    name: "sheet-blank.png",
    mimeType: "image/png",
    buffer: png,
  });

  await expect(page.getByText(/Read 1 sheet/)).toBeVisible();
  await expect(page.getByText("blank: 5")).toBeVisible();
});

test("an unreadable ID block blocks saving until a learner is chosen", async ({
  page,
}) => {
  const mock = await installSupabaseMock(page, seedRows, EXAM_PAPER_OPEN);
  await openScanTab(page);

  // A learner id that is not on this section's roster: decodes cleanly, but
  // belongs to nobody here.
  const png = renderSheetPng({
    answerKey: TEN_ITEM_KEY,
    studentId: 88888,
    answers: ANSWERS_WITH_TWO_WRONG,
  });

  await page.getByLabel("Scanned sheets").setInputFiles({
    name: "stranger.png",
    mimeType: "image/png",
    buffer: png,
  });

  await expect(page.getByText(/belong to a learner who is not in this section/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Save 1 result/ })).toBeDisabled();

  // Reassigning it to a real learner clears the block.
  await page
    .getByLabel("Learner for stranger.png")
    .selectOption(String(LEARNERS[2].id));

  const save = page.getByRole("button", { name: /Save 1 result/ });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText(/Saved 1 learner result/)).toBeVisible();

  const rows = mock
    .writesTo("sms_exam_result_students")
    .find((w) => w.method === "POST")?.body as ResultStudentWrite[];
  expect(rows[0].student_id).toBe(LEARNERS[2].id);
});

test("two sheets for the same learner must be resolved before saving", async ({
  page,
}) => {
  await installSupabaseMock(page, seedRows, EXAM_PAPER_OPEN);
  await openScanTab(page);

  const png = renderSheetPng({
    answerKey: TEN_ITEM_KEY,
    studentId: LEARNERS[0].id,
    answers: ANSWERS_WITH_TWO_WRONG,
  });

  await page.getByLabel("Scanned sheets").setInputFiles([
    { name: "dup-a.png", mimeType: "image/png", buffer: png },
    { name: "dup-b.png", mimeType: "image/png", buffer: png },
  ]);

  await expect(page.getByText(/Read 2 sheets/)).toBeVisible();
  await expect(page.getByText(/two sheets/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Save 2 results/ }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Remove dup-b.png" }).click();
  await expect(page.getByRole("button", { name: /Save 1 result/ })).toBeEnabled();
});

test("correcting a read answer changes the saved score", async ({ page }) => {
  const mock = await installSupabaseMock(page, seedRows, EXAM_PAPER_OPEN);
  await openScanTab(page);

  const png = renderSheetPng({
    answerKey: TEN_ITEM_KEY,
    studentId: LEARNERS[0].id,
    answers: ANSWERS_WITH_TWO_WRONG,
  });

  await page.getByLabel("Scanned sheets").setInputFiles({
    name: "sheet-fix.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByText(/Read 1 sheet/)).toBeVisible();

  // Open the per-item view and correct item 3 from D to the key's B.
  await page.getByRole("button", { name: "Show the answers read from sheet-fix.png" }).click();
  await page.getByRole("button", { name: "sheet-fix.png item 3 B" }).click();

  await page.getByRole("button", { name: /Save 1 result/ }).click();
  await expect(page.getByText(/Saved 1 learner result/)).toBeVisible();

  const rows = mock
    .writesTo("sms_exam_result_students")
    .find((w) => w.method === "POST")?.body as ResultStudentWrite[];

  expect(rows[0].answers[2]).toBe("B");
  expect(rows[0].correct_items).toContain(3);
  expect(rows[0].correct_items).toHaveLength(9);
});

test("printable result slips list every scored learner", async ({ page }) => {
  await installSupabaseMock(page, {
    ...seedRows,
    sms_exam_results: [
      {
        id: 5001,
        exam_id: EXAM_ID,
        section_id: SECTION_ROWS[0].section_id,
        school_year: OWNED_EXAM.tos.school_year,
        mps: 80,
        date_administered: "2026-08-01",
        total_items: 10,
      },
    ],
    sms_exam_result_students: LEARNERS.map((learner, index) => ({
      id: 6000 + index,
      result_id: 5001,
      student_id: learner.id,
      correct_items: [1, 2, 4, 5, 6, 8, 9, 10],
      answers: ANSWERS_WITH_TWO_WRONG,
      scan_source: "scan",
    })),
  }, EXAM_PAPER_OPEN);

  await page.goto(WORKSPACE);
  await expect(page.getByRole("tab", { name: /All 10 items keyed/ })).toBeVisible();
  await page.getByRole("tab", { name: "Results" }).click();
  await page.getByRole("combobox", { name: "Section" }).click();
  await page.getByRole("option", { name: "Rizal" }).click();

  await expect(page.getByText("Class MPS")).toBeVisible();
  for (let i = 0; i < LEARNERS.length; i += 1) {
    await expect(
      page.getByRole("row").filter({ hasText: learnerFullName(i) }).first(),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Print all result slips" }),
  ).toBeEnabled();
});

test("the item analysis is computed from the saved results, with no extra step", async ({
  page,
}) => {
  await installSupabaseMock(page, {
    ...seedRows,
    sms_exam_results: [
      {
        id: 5001,
        exam_id: EXAM_ID,
        section_id: SECTION_ROWS[0].section_id,
        school_year: OWNED_EXAM.tos.school_year,
        mps: 80,
        total_items: 10,
      },
    ],
    // Two learners get item 3 wrong, one gets it right: enough for the
    // difficulty index on that item to be something other than 0 or 1.
    sms_exam_result_students: LEARNERS.map((learner, index) => ({
      id: 6000 + index,
      result_id: 5001,
      student_id: learner.id,
      correct_items:
        index === 0
          ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
          : [1, 2, 4, 5, 6, 8, 9, 10],
      answers: index === 0 ? TEN_ITEM_KEY.map((k) => k.correctAnswer as string) : ANSWERS_WITH_TWO_WRONG,
      scan_source: "scan",
    })),
  }, EXAM_PAPER_OPEN);

  await page.goto(WORKSPACE);
  await expect(page.getByRole("tab", { name: /All 10 items keyed/ })).toBeVisible();
  await page.getByRole("tab", { name: "Results" }).click();
  await page.getByRole("combobox", { name: "Section" }).click();
  await page.getByRole("option", { name: "Rizal" }).click();

  // The section heading on the tab, and the report's own printed title.
  await expect(
    page.getByRole("heading", { name: "Item analysis", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Item Analysis", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("computed from these results")).toBeVisible();

  // The report carries a verdict per item, which is the whole point of it.
  await expect(page.getByText(/Retain|Revise|Reject/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print item analysis" }),
  ).toBeEnabled();
});

// ---------------------------------------------------------------------------
// Cut strips and the phone flow
// ---------------------------------------------------------------------------

test("a phone photo of a cut ¼ strip is read and saved on one tap", async ({
  page,
}) => {
  const mock = await installSupabaseMock(page, seedRows, EXAM_PAPER_OPEN);
  await openScanTab(page);

  const png = renderSheetPng({
    answerKey: TEN_ITEM_KEY,
    studentId: LEARNERS[1].id,
    answers: ANSWERS_WITH_TWO_WRONG,
    format: "quarter",
  });
  await page.getByLabel("Photo of an answer sheet").setInputFiles({
    name: "IMG_0001.png",
    mimeType: "image/png",
    buffer: png,
  });

  await expect(page.getByText("Matched by the learner code")).toBeVisible();
  await expect(page.getByLabel("Learner for this photo")).toHaveValue(
    String(LEARNERS[1].id),
  );
  // The photo is shown from memory for the teacher to compare against.
  await expect(
    page.getByRole("img", { name: "The photographed answer sheet" }),
  ).toHaveAttribute("src", /^blob:/);

  await page
    .getByRole("button", { name: `Save ${learnerFullName(1)}` })
    .click();
  await expect(
    page.getByText(new RegExp(`Saved ${learnerFullName(1)}`)),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Take next photo" })).toBeVisible();

  const rows = mock
    .writesTo("sms_exam_result_students")
    .find((w) => w.method === "POST")?.body as ResultStudentWrite[];
  expect(rows).toHaveLength(1);
  expect(rows[0].student_id).toBe(LEARNERS[1].id);
  expect(rows[0].correct_items).toEqual([1, 2, 4, 5, 6, 8, 9, 10]);
  // The class MPS is brought up to date after the save.
  expect(
    mock
      .writesTo("sms_exam_results")
      .some((w) => w.method === "PATCH" && (w.body as { mps?: number }).mps !== undefined),
  ).toBe(true);
  // Nothing but answers is stored: no upload of the photo anywhere.
  expect(
    mock.writes.some((w) => /storage/.test(w.url)),
  ).toBe(false);
});

test("a photo with a double-marked item cannot be saved until it is fixed", async ({
  page,
}) => {
  const mock = await installSupabaseMock(page, seedRows, EXAM_PAPER_OPEN);
  await openScanTab(page);

  // Item 2 carries C (the key) and D: the reader must ask, not pick one.
  const png = renderSheetPng({
    answerKey: TEN_ITEM_KEY,
    studentId: LEARNERS[0].id,
    answers: ANSWERS_WITH_TWO_WRONG,
    format: "half",
    doubleMarked: [2],
  });
  await page.getByLabel("Photo of an answer sheet").setInputFiles({
    name: "IMG_0002.png",
    mimeType: "image/png",
    buffer: png,
  });

  await expect(page.getByText(/Two marks on item 2/)).toBeVisible();
  const save = page.getByRole("button", { name: `Save ${learnerFullName(0)}` });
  await expect(save).toBeDisabled();

  await page.locator("summary", { hasText: "Check or correct the answers" }).click();
  await page.getByRole("button", { name: "Photo item 2 C" }).click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText(new RegExp(`Saved ${learnerFullName(0)}`))).toBeVisible();

  const rows = mock
    .writesTo("sms_exam_result_students")
    .find((w) => w.method === "POST")?.body as ResultStudentWrite[];
  expect(rows[0].answers[1]).toBe("C");
  expect(rows[0].correct_items).toContain(2);
});

test("an uncut page of ½ strips reads as one row per learner", async ({
  page,
}) => {
  await installSupabaseMock(page, seedRows, EXAM_PAPER_OPEN);
  await openScanTab(page);

  const png = renderUncutPagePng({
    answerKey: TEN_ITEM_KEY,
    format: "half",
    sheets: [
      { studentId: LEARNERS[0].id, answers: ANSWERS_WITH_TWO_WRONG },
      { studentId: LEARNERS[2].id, answers: ANSWERS_WITH_TWO_WRONG },
    ],
  });
  await page.getByLabel("Scanned sheets").setInputFiles({
    name: "uncut.png",
    mimeType: "image/png",
    buffer: png,
  });

  await expect(page.getByText(/Read 2 sheets; 2 matched/)).toBeVisible();
  await expect(page.getByLabel("Learner for uncut.png — strip 1")).toHaveValue(
    String(LEARNERS[0].id),
  );
  await expect(page.getByLabel("Learner for uncut.png — strip 2")).toHaveValue(
    String(LEARNERS[2].id),
  );
});

test("answer sheets print as ¼ strips when that size is picked", async ({
  page,
}) => {
  await installSupabaseMock(page, seedRows, EXAM_PAPER_OPEN);
  await page.goto(WORKSPACE);
  await expect(page.getByRole("tab", { name: /All 10 items keyed/ })).toBeVisible();
  await page.getByRole("tab", { name: "Answer Sheets" }).click();
  await page.getByRole("combobox", { name: "Section" }).click();
  await page.getByRole("option", { name: "Rizal" }).click();

  await page.getByRole("radio", { name: /¼ sheet lengthwise/ }).click();
  await expect(page.getByText(/4 per A4 page, 1 page in all/)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download answer sheets (PDF)" }).click();
  expect((await download).suggestedFilename()).toMatch(/-quarter\.pdf$/);
});
