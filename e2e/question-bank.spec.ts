/**
 * Question Bank (migration 195), against the intercepted Supabase. The
 * database enforces the rules; these pin what the screens ASK it and show.
 *
 * Spec §10.3: the Map competencies step blocks Save until mapped; Least
 * Learned → Write question; the exam builder's bank pick with the
 * level-mismatch confirmation; QA exam review shows Source and Level override.
 */
import { expect, test } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const AUTHORIZED = { sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }] };

const MATH = { id: 3, name: "Mathematics", is_active: true };

const CATALOGUE_ENTRY = {
  id: 41,
  learning_area_id: 3,
  grade_level: 5,
  lc_code: "M5NS-ID-4",
  competency_text: "Divides fractions",
  is_active: true,
};

const DIVISION_TOS = {
  id: 7101,
  title: "Mathematics 5 Q1 Division TOS",
  subject_name: "Mathematics",
  learning_area_id: 3,
  grade_level: 5,
  school_year: "2026-2027",
  grading_period: 1,
  exam_type: "Summative Test",
  total_items: 2,
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

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("Least Learned asks for the chosen area, grade and year and lists the result", async ({ page }) => {
  const mock = await installSupabaseMock(
    page,
    { ...AUTHORIZED, sms_learning_areas: [MATH] },
    {
      division_llc: () => [
        { catalogue_competency_id: 41, lc_code: "M5NS-ID-4", competency_text: "Divides fractions", mps: 12.5, learners: 80, sections: 4, schools: 2, results: 4 },
      ],
      division_llc_coverage: () => [{ results: 4, schools: 2, learners: 80 }],
    },
  );
  await page.goto("/teacher/examinations/division/llc");
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Mathematics" }).click();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Grade 5", exact: true }).click();
  await expect(page.getByText("Divides fractions")).toBeVisible();
  await expect(page.getByText("12.50%")).toBeVisible();
  const call = mock.writesTo("rpc/division_llc")[0];
  expect(call.body).toMatchObject({ p_learning_area_id: 3, p_grade_level: 5 });
  await page.getByRole("button", { name: "Write question" }).click();
  await expect(page.getByText("Write a Question Bank question")).toBeVisible();
});

test("an unauthorized teacher sees the notice on Least Learned", async ({ page }) => {
  await installSupabaseMock(page, { sms_exam_qa_authors: [], sms_learning_areas: [] });
  await page.goto("/teacher/examinations/division/llc");
  await expect(page.getByText(/not currently authorized/)).toBeVisible();
});

test("the Map competencies step keeps Save disabled until every competency is mapped", async ({ page }) => {
  const mock = await installSupabaseMock(page, {
    ...AUTHORIZED,
    sms_tos: [DIVISION_TOS],
    sms_learning_areas: [MATH],
    sms_competency_catalogue: [CATALOGUE_ENTRY],
    // Typed before the catalogue: no catalogue link, a loosely written LC code.
    sms_tos_competencies: [
      {
        id: 6001,
        tos_id: 7101,
        competency_text: "divide simple fractions",
        lc_code: "m5ns-id-4",
        catalogue_competency_id: null,
        no_of_days: 10,
        no_of_items: 2,
        position: 0,
      },
    ],
    sms_tos_items: [],
  });
  await page.goto("/teacher/examinations/division/tos");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();

  await expect(page.getByText("1 competency was typed before the competency catalogue.")).toBeVisible();
  await expect(page.getByText("Map 1 competency to the catalogue before saving.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  await page.getByRole("button", { name: "Apply suggestions" }).click();
  await expect(page.getByText("Map 1 competency to the catalogue before saving.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => mock.writesTo("sms_tos_competencies").length).toBe(1);
  const write = mock.writesTo("sms_tos_competencies")[0];
  expect(write.method).toBe("PATCH");
  expect(write.url).toContain("id=eq.6001");
  expect(write.body).toMatchObject({
    catalogue_competency_id: 41,
    lc_code: "M5NS-ID-4",
    competency_text: "Divides fractions",
  });
});

test("the exam builder confirms a cognitive-level mismatch before using a bank question", async ({ page }) => {
  const mock = await installSupabaseMock(page, {
    ...AUTHORIZED,
    sms_exams: [],
    sms_tos: [{ ...DIVISION_TOS, id: 8101, review_status: "approved" }],
    // TOS item 1 asks for Remembering on the catalogue competency.
    sms_tos_items: [
      {
        id: 1,
        tos_id: 8101,
        item_number: 1,
        cognitive_level: "remembering",
        competency: {
          catalogue_competency_id: 41,
          lc_code: "M5NS-ID-4",
          competency_text: "Divides fractions",
        },
      },
    ],
    // The only approved bank question for it is Applying.
    sms_exam_bank_questions: [
      {
        id: 9001,
        catalogue_competency_id: 41,
        question_type: "multiple_choice",
        question_text: "What is 1/2 divided by 1/4?",
        answer_key: null,
        image_path: null,
        image_name: null,
        cognitive_level: "applying",
        review_status: "approved",
        reviewed_at: "2026-09-20T00:00:00Z",
        options: [
          { id: 1, position: 0, choice_text: "2", is_correct: true, image_path: null, image_name: null },
          { id: 2, position: 1, choice_text: "1/8", is_correct: false, image_path: null, image_name: null },
        ],
        author: { name: "Ana Author", school: { name: "Other Elementary School" } },
      },
    ],
  });
  await page.goto("/teacher/examinations/division/exam?createFromTos=8101");
  await expect(page.getByRole("heading", { name: "Create Exam" })).toBeVisible();

  await page.getByRole("button", { name: "Add part: Multiple Choice" }).click();
  await page.getByRole("button", { name: "From Question Bank" }).click();

  const picker = page.getByRole("dialog", { name: "Question Bank — item 1" });
  await expect(picker.getByText("Different cognitive level")).toBeVisible();
  await expect(picker.getByText("Same cognitive level")).toHaveCount(0);
  // The mismatch is not taken on the first click: it asks for confirmation.
  await picker.getByRole("button", { name: "Use for item 1" }).click();
  await expect(picker).toBeVisible();
  await picker.getByLabel("Use anyway — this level mismatch is intentional").click();
  await expect(picker).toHaveCount(0);

  // The badge, not the "From Question Bank" button beside the part.
  await expect(page.locator("span").filter({ hasText: /^From Question Bank$/ })).toBeVisible();
  await expect(page.getByText("Level override", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create exam" }).click();
  await expect.poll(() => mock.writesTo("sms_exam_questions").length).toBe(1);
  const insert = mock.writesTo("sms_exam_questions")[0];
  expect(insert.method).toBe("POST");
  expect(insert.body).toEqual([
    expect.objectContaining({
      item_number: 1,
      question_type: "multiple_choice",
      question_text: "What is 1/2 divided by 1/4?",
      source_bank_question_id: 9001,
      bank_level_override: true,
    }),
  ]);
  // The copy's choices go in verbatim, correct answer included.
  await expect.poll(() => mock.writesTo("sms_exam_options").filter((w) => w.method === "POST").length).toBe(1);
  const options = mock.writesTo("sms_exam_options").find((w) => w.method === "POST");
  expect(options?.body).toEqual([
    expect.objectContaining({ label: "A", choice_text: "2", is_correct: true, position: 0 }),
    expect.objectContaining({ label: "B", choice_text: "1/8", is_correct: false, position: 1 }),
  ]);
});

test("QA's exam review shows each item's source and the level override", async ({ page }) => {
  await installSupabaseMock(page, {
    sms_users: [
      {
        id: TEST_USER.systemUserId,
        user_id: TEST_USER.authId,
        email: TEST_USER.email,
        name: "QA Reviewer",
        type: "qa",
        school_id: null,
        is_active: true,
      },
    ],
    sms_exams: [
      {
        id: 8201,
        tos_id: 8101,
        title: "Mathematics 5 Summative",
        version_label: "Set A",
        school_id: null,
        is_school_shared: false,
        created_by: 999,
        is_active: true,
        review_status: "under_review",
        review_comment: null,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ],
    sms_exam_questions: [
      { id: 1, exam_id: 8201, item_number: 1, question_type: "multiple_choice", source_bank_question_id: 9001, bank_level_override: true },
      { id: 2, exam_id: 8201, item_number: 2, question_type: "multiple_choice", source_bank_question_id: null, bank_level_override: false },
    ],
    sms_exam_review_events: [],
  });
  await page.goto("/qa/exam/8201");
  await expect(page.getByText("1 of 2 item(s) from the Question Bank")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Source" })).toBeVisible();

  const bankRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "1", exact: true }) });
  await expect(bankRow.getByRole("cell", { name: "Question Bank", exact: true })).toBeVisible();
  await expect(bankRow.getByText("Level override — cognitive level differs from the TOS item")).toBeVisible();

  const newRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "2", exact: true }) });
  await expect(newRow.getByRole("cell", { name: "New", exact: true })).toBeVisible();
  await expect(newRow.getByText(/Level override/)).toHaveCount(0);
});
