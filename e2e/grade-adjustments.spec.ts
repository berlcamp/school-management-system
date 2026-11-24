/** Additional points on a final grade (migration 239) and the bell. */
import { expect, test } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const me = (type: string) => ({
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: "Test User",
  type,
  school_id: TEST_USER.schoolId,
  is_active: true,
});

const BASE = {
  sms_staff_designations: [],
  sms_department_head_subjects: [],
  sms_user_roles: [],
  sms_user_schools: [],
  sms_role_menu_access: [],
  sms_schools: [{ id: TEST_USER.schoolId, name: "Test School", is_active: true }],
  sms_sections: [],
};

const ROW = {
  id: 9, student_name: "Learner, Test", subject_name: "Science 8", section_name: "Rizal",
  grade_level: 8, school_year: "2026-2027", semester: 0, points: 2,
  reason: "extracurricular", note: null, base_final: 77, current_final: 77,
  status: "pending", requested_by: 900, requester_name: "Other Teacher",
  requested_at: "2026-11-20T00:00:00Z", decider_name: null, decided_at: null,
  decision_remarks: null, revoker_name: null, revoked_at: null, revoke_remarks: null,
};

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("the bell shows the request and leads to the approval page", async ({ page }) => {
  let decided: Record<string, unknown> | null = null;
  let read: Record<string, unknown> | null = null;
  await installSupabaseMock(
    page,
    {
      ...BASE,
      sms_users: [me("school_head")],
      sms_notifications: [
        {
          id: 3, user_id: TEST_USER.systemUserId, kind: "grade_adjustment_request", ref_id: 9,
          title: "Additional points need approval", body: "Learner, Test: +2 in Science 8 (Rizal)",
          link_path: "/grade-adjustments", created_at: "2026-11-20T00:00:00Z", read_at: null,
        },
      ],
    },
    {
      announcement_unread_count: () => 0,
      announcement_inbox: () => [],
      grade_adjustment_pending_count: () => 1,
      grade_adjustment_list: (args) => (args.p_pending ? (decided ? [] : [ROW]) : []),
      grade_adjustment_decide: (args) => ((decided = args), null),
      notifications_mark_read: (args) => ((read = args), null),
    },
  );
  await page.goto("/profile");
  await page.getByRole("button", { name: "Notifications, 1 unread" }).click();
  await page.getByText("Additional points need approval").click();
  await page.waitForURL("**/grade-adjustments");
  expect(read).toEqual({ p_ids: [3] });

  await expect(page.getByText("77 + 2 =")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Nothing is waiting for approval.")).toBeVisible();
  expect(decided).toMatchObject({ p_id: 9, p_approve: true });
});

test("a rejection needs remarks", async ({ page }) => {
  await installSupabaseMock(page, { ...BASE, sms_users: [me("school_head")] }, {
    announcement_unread_count: () => 0,
    grade_adjustment_pending_count: () => 1,
    grade_adjustment_list: (args) => (args.p_pending ? [ROW] : []),
  });
  await page.goto("/grade-adjustments");
  await page.getByRole("button", { name: "Reject" }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Reject" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Remarks").fill("No supporting document");
  await expect(confirm).toBeEnabled();
});

test("a plain teacher is refused the approval page", async ({ page }) => {
  await installSupabaseMock(page, { ...BASE, sms_users: [me("teacher")] }, {
    announcement_unread_count: () => 0,
  });
  await page.goto("/grade-adjustments");
  await expect(page.getByText("You do not have permission to view this page.")).toBeVisible();
});

test("a teacher asks for points beside the final grade", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  const sec = { id: 70, name: "Rizal", grade_level: 8, school_year: "2026-2027", school_id: TEST_USER.schoolId, shs_curriculum: null, strand: null };
  const sub = { id: 50, name: "Science 8", is_graded: true, is_madrasah: false, selective_enrolment: false, mapeh_component: null, tle_component: null, shs_category: null };
  const stu = { id: 1, lrn: "1", first_name: "Test", last_name: "Learner", middle_name: null, gender: "female" };
  await page.clock.setFixedTime(new Date("2026-11-24T08:00:00Z"));
  await installSupabaseMock(
    page,
    {
      ...BASE,
      sms_users: [me("teacher")],
      sms_sections: [sec],
      sms_subjects: [sub],
      sms_students: [stu],
      sms_enrollments: [{ id: 1, student_id: 1, section_id: 70, school_year: "2026-2027", status: "approved", enrollment_status: "active", student: stu, students: stu }],
      sms_subject_schedules: [
        { id: 1, subject_id: 50, section_id: 70, teacher_id: TEST_USER.systemUserId, school_id: TEST_USER.schoolId, school_year: "2026-2027", grading_periods: null, subjects: sub, sections: sec },
      ],
      sms_grades: [1, 2, 3].map((p) => ({ student_id: 1, subject_id: 50, section_id: 70, school_year: "2026-2027", grading_period: p, grade: 77 })),
      sms_class_records: [], sms_class_record_items: [], sms_class_record_scores: [],
      sms_class_record_blocks: [], sms_section_subject_terms: [], sms_student_subjects: [],
      sms_school_settings: [], sms_school_term_dates: [], sms_grade_adjustments: [],
    },
    {
      announcement_unread_count: () => 0,
      grade_adjustment_request: (args) => ((sent = args), 1),
    },
  );
  await page.goto("/teacher/class-record");
  await page.getByRole("combobox").filter({ hasText: /subject/i }).first().click();
  await page.getByRole("option", { name: /Science 8/ }).click();
  await page.getByRole("button", { name: "Final Grade", exact: true }).click();
  await page.getByRole("button", { name: /Additional points for/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Points to add").fill("2");
  await expect(dialog.getByText("Final grade if approved: 79")).toBeVisible();
  await dialog.getByLabel("Reason").click();
  await page.getByRole("option", { name: "Extra-curricular activity points" }).click();
  await dialog.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByText("Sent for approval")).toBeVisible();
  expect(sent).toMatchObject({ p_student_id: 1, p_subject_id: 50, p_section_id: 70, p_semester: 0, p_points: 2, p_reason: "extracurricular" });
});
