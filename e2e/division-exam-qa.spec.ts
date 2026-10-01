/**
 * Division TOS through QA (migration 194), against the intercepted Supabase.
 * The database is what enforces the workflow; these tests pin what the screens
 * ASK it to do and what they show back.
 */

import { expect, test } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const QA_MESSAGE =
  "You are not currently authorized to create Division TOS. Please contact the Division QA administrator.";

const DRAFT_TOS = {
  id: 7101,
  title: "Science 5 Q1 Division TOS",
  subject_name: "Science",
  grade_level: 5,
  school_year: "2026-2027",
  grading_period: 1,
  exam_type: "Quarterly Examination",
  total_items: 40,
  total_days: 40,
  school_id: null,
  is_school_shared: false,
  created_by: TEST_USER.systemUserId,
  is_active: true,
  review_status: "draft",
  review_comment: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("an unauthorized teacher sees the notice and no Create button", async ({ page }) => {
  await installSupabaseMock(page, { sms_exam_qa_authors: [], sms_tos: [] });
  await page.goto("/teacher/examinations/division/tos");
  await expect(page.getByText(QA_MESSAGE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Division TOS" })).toHaveCount(0);
});

test("an authorized author submits a draft to QA", async ({ page }) => {
  const mock = await installSupabaseMock(
    page,
    {
      sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }],
      sms_tos: [DRAFT_TOS],
    },
    { exam_review_submit: () => null },
  );
  await page.goto("/teacher/examinations/division/tos");
  await expect(page.getByText("Science 5 Q1 Division TOS")).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Submit to QA" }).click();
  // The click resolves before the request is sent; wait for it to land.
  await expect.poll(() => mock.writesTo("rpc/exam_review_submit").length).toBe(1);
  const calls = mock.writesTo("rpc/exam_review_submit");
  expect(calls[0].body).toEqual({ p_entity: "tos", p_id: 7101 });
});

test("a returned TOS shows QA's reason to its author", async ({ page }) => {
  await installSupabaseMock(page, {
    sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }],
    sms_tos: [
      { ...DRAFT_TOS, review_status: "rejected", review_comment: "Item distribution does not match" },
    ],
  });
  await page.goto("/teacher/examinations/division/tos");
  await expect(page.getByText("Returned")).toBeVisible();
  await expect(page.getByText("QA: Item distribution does not match")).toBeVisible();
});

test("QA returns a submission with a reason", async ({ page }) => {
  const mock = await installSupabaseMock(
    page,
    {
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
      sms_tos: [{ ...DRAFT_TOS, review_status: "submitted", created_by: 999 }],
      sms_exam_review_events: [],
    },
    { exam_review_decide: () => null },
  );
  await page.goto("/qa/tos/7101");
  await expect(page.getByRole("button", { name: "Return with comments" })).toBeDisabled();
  await page.getByPlaceholder("Comments for the author (required to return)").fill("Item distribution does not match");
  await page.getByRole("button", { name: "Return with comments" }).click();
  await expect.poll(() => mock.writesTo("rpc/exam_review_decide").length).toBe(1);
  const calls = mock.writesTo("rpc/exam_review_decide");
  expect(calls[0].body).toEqual({
    p_entity: "tos",
    p_id: 7101,
    p_decision: "reject",
    p_comment: "Item distribution does not match",
  });
});
