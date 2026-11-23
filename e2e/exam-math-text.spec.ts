/**
 * Superscripts / subscripts in the exam builder (lib/utils/mathText.ts),
 * against the intercepted Supabase. The toolbar writes `^{…}` / `_{…}` into the
 * plain text column; the builder shows how it prints; the save sends the text.
 */
import { expect, test } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const AUTHORIZED = { sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }] };

const TOS = {
  id: 8201,
  title: "Mathematics 8 Q1 Division TOS",
  subject_name: "Mathematics",
  learning_area_id: 3,
  grade_level: 8,
  school_year: "2026-2027",
  grading_period: 1,
  exam_type: "Summative Test",
  total_items: 1,
  total_days: 10,
  school_id: null,
  is_school_shared: false,
  created_by: TEST_USER.systemUserId,
  is_active: true,
  review_status: "approved",
  review_comment: null,
  legend: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("x² / x₂ buttons write markup, preview it, and save it as text", async ({ page }) => {
  const mock = await installSupabaseMock(page, {
    ...AUTHORIZED,
    sms_exams: [],
    sms_tos: [TOS],
    sms_tos_items: [
      {
        id: 1,
        tos_id: 8201,
        item_number: 1,
        cognitive_level: "remembering",
        competency: { catalogue_competency_id: 41, lc_code: "G8-001", competency_text: "Laws of exponents" },
      },
    ],
    sms_exam_bank_questions: [],
  });
  await page.goto("/teacher/examinations/division/exam?createFromTos=8201");
  await expect(page.getByRole("heading", { name: "Create Exam" })).toBeVisible();
  await page.getByRole("button", { name: "Add part: Multiple Choice" }).click();
  await page.getByRole("button", { name: /New question/ }).click();

  // Question: select the "2" of "x2 + 1" and make it an exponent.
  const question = page.getByPlaceholder("Type the question or statement…");
  await question.fill("x2 + 1");
  await question.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(1, 2));
  await page.getByRole("button", { name: "Superscript" }).click();
  await expect(question).toHaveValue("x^{2} + 1");

  // Choice A: nothing selected → empty braces, caret inside, keep typing.
  const choiceA = page.getByLabel("Choice A text");
  await choiceA.fill("H");
  await page.getByRole("button", { name: "Subscript" }).click();
  await page.keyboard.type("2");
  await page.keyboard.press("ArrowRight"); // step past the closing brace
  await page.keyboard.type("O");
  await expect(choiceA).toHaveValue("H_{2}O");

  // A symbol lands at the caret.
  const choiceB = page.getByLabel("Choice B text");
  await choiceB.fill("5 3");
  await choiceB.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 1));
  await page.getByRole("button", { name: "Insert ×" }).click();
  await expect(choiceB).toHaveValue("5× 3");

  const printed = page.getByText("How it prints").locator("..");
  await expect(printed.locator("sup")).toHaveText("2");
  await expect(printed.locator("sub")).toHaveText("2");

  await page.getByLabel("Choice C text").fill("other");
  await page.getByLabel("Choice D text").fill("none");
  await page.getByRole("button", { name: /Choice A — mark as correct/ }).click();

  await page.getByRole("button", { name: "Create exam" }).click();
  await expect.poll(() => mock.writesTo("sms_exam_questions").length).toBe(1);
  expect(mock.writesTo("sms_exam_questions")[0].body).toEqual([
    expect.objectContaining({ question_text: "x^{2} + 1" }),
  ]);
  await expect
    .poll(() => mock.writesTo("sms_exam_options").filter((w) => w.method === "POST").length)
    .toBe(1);
  const options = mock.writesTo("sms_exam_options").find((w) => w.method === "POST");
  expect(options?.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "A", choice_text: "H_{2}O", is_correct: true }),
      expect.objectContaining({ label: "B", choice_text: "5× 3" }),
    ]),
  );
});
