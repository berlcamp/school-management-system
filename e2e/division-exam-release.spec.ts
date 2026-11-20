/**
 * Migrations 236 and 237, against the intercepted Supabase: QA grants
 * authorship and competency access separately, to any role; a contributor's
 * add-only catalogue; the
 * division office shows a division exam to teachers and generates a school
 * passcode; a school head enables it for the school, and a teacher is told to
 * ask their school head. The database enforces every rule; these pin what the
 * screens ask it to do.
 */
import { expect, test } from "@playwright/test";
import { DIVISION_EXAM, EXAM_ID } from "./support/fixtures";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const me = (type: string, schoolId: number | null = TEST_USER.schoolId) => ({
  id: TEST_USER.systemUserId,
  user_id: TEST_USER.authId,
  email: TEST_USER.email,
  name: TEST_USER.name,
  type,
  school_id: schoolId,
  is_active: true,
});

const APPROVED_EXAM = { ...DIVISION_EXAM, review_status: "approved", is_published: false };

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("QA sees every role and grants the two rights separately", async ({ page }) => {
  const contributors: Record<string, unknown>[] = [];
  // The handler below runs only after this assignment, when a switch is clicked.
  const mock = await installSupabaseMock(
    page,
    {
      sms_users: [
        me("qa", null),
        { id: 620, name: "Reyes, Ana", type: "teacher", school_id: 7, is_active: true, school: { name: "E2E Elementary School" } },
        { id: 621, name: "Santos, Carlo", type: "school_head", school_id: 7, is_active: true, school: { name: "E2E Elementary School" } },
        { id: 622, name: "Uy, Dina", type: "division_admin", school_id: null, is_active: true, school: null },
        { id: 623, name: "Vela, Eric", type: "security_guard", school_id: 7, is_active: true, school: { name: "E2E Elementary School" } },
      ],
      sms_exam_qa_authors: [
        { id: 1, user_id: 620, is_active: true, authorized_at: "2026-10-01T00:00:00Z" },
      ],
      sms_competency_contributors: contributors,
    },
    {
      exam_qa_authorize: () => null,
      exam_qa_set_competency_access: (args) => {
        const { p_user_id } = args as { p_user_id: number };
        contributors.push({ user_id: p_user_id, is_active: true, granted_at: "2026-11-20T00:00:00Z" });
        mock.setRows("sms_competency_contributors", [...contributors]);
        return null;
      },
    },
  );
  await page.goto("/qa/authors");
  await expect(page.getByRole("heading", { name: "Division Authors" })).toBeVisible();

  // Every role is listed, not only teachers.
  const head = page.getByRole("listitem").filter({ hasText: "Santos, Carlo" });
  await expect(head).toContainText("School Head");
  await expect(page.getByRole("listitem").filter({ hasText: "Uy, Dina" })).toContainText("Division office");
  // An account that cannot sign in is listed, with no switches.
  const guard = page.getByRole("listitem").filter({ hasText: "Vela, Eric" });
  await expect(guard).toContainText("This role cannot sign in");
  await expect(guard.getByRole("switch")).toHaveCount(0);

  // The teacher is an author but has no competency access: two separate switches.
  const teacher = page.getByRole("listitem").filter({ hasText: "Reyes, Ana" });
  await expect(teacher.getByRole("switch", { name: /may write Division TOS/ })).toBeChecked();
  await expect(teacher.getByRole("switch", { name: /may add competencies/ })).not.toBeChecked();

  // Competency access for the school head, without making them an author.
  await head.getByRole("switch", { name: /may add competencies/ }).click();
  await expect.poll(() => mock.writesTo("rpc/exam_qa_set_competency_access").length).toBe(1);
  expect(mock.writesTo("rpc/exam_qa_set_competency_access")[0].body).toEqual({
    p_user_id: 621,
    p_enabled: true,
  });
  await expect(head.getByRole("switch", { name: /may add competencies/ })).toBeChecked();
  await expect(head.getByRole("switch", { name: /may write Division TOS/ })).not.toBeChecked();
  expect(mock.writesTo("rpc/exam_qa_authorize")).toHaveLength(0);

  // The author switch asks first, then authorizes.
  await head.getByRole("switch", { name: /may write Division TOS/ }).click();
  await page.getByRole("button", { name: "Authorize" }).click();
  await expect.poll(() => mock.writesTo("rpc/exam_qa_authorize").length).toBe(1);
  expect(mock.writesTo("rpc/exam_qa_authorize")[0].body).toEqual({ p_user_id: 621 });
});

test("a contributor adds competencies only, and sees the contributor flag", async ({ page }) => {
  await installSupabaseMock(page, {
    sms_exam_qa_authors: [],
    sms_competency_contributors: [{ user_id: TEST_USER.systemUserId, is_active: true, granted_at: "2026-11-01T00:00:00Z" }],
    sms_learning_areas: [{ id: 3, name: "Mathematics", is_active: true }],
    sms_competency_catalogue: [
      { id: 41, learning_area_id: 3, grade_level: 5, lc_code: "G5-001", competency_text: "Divides fractions", is_active: true, added_by_teacher: false },
      { id: 42, learning_area_id: 3, grade_level: 5, lc_code: "G5-002", competency_text: "Adds decimals", is_active: true, added_by_teacher: true },
    ],
  });

  // Not an author: the catalogue card is offered, the authoring cards are not.
  await page.goto("/teacher/examinations");
  await expect(page.getByRole("link", { name: /Competency Catalogue/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Division TOS/ })).toHaveCount(0);

  await page.goto("/teacher/examinations/division/competencies");
  await page.getByRole("combobox", { name: "Grade level" }).click();
  await page.getByRole("option", { name: "Grade 5" }).click();
  await expect(page.getByText("Adds decimals")).toBeVisible();
  await expect(page.getByText("Added by contributor", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Add competency" })).toBeEnabled();
  // Add only: no edit / retire, no learning-area menu.
  await expect(page.getByRole("button", { name: /Fix a typo/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More catalogue actions" })).toHaveCount(0);
});

test("an author without competency access is told so", async ({ page }) => {
  await installSupabaseMock(page, {
    sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }],
    sms_competency_contributors: [],
  });
  await page.goto("/teacher/examinations");
  await expect(page.getByRole("link", { name: /^Division TOS/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Competency Catalogue/ })).toHaveCount(0);
  await page.goto("/teacher/examinations/division/competencies");
  await expect(page.getByText("You are not allowed to add competencies")).toBeVisible();
});

test("an authorized division admin reaches Division Authoring from the menu", async ({ page }) => {
  await installSupabaseMock(page, {
    sms_users: [me("division_admin", null)],
    sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }],
    sms_competency_contributors: [],
  });
  await page.goto("/home");
  const link = page.getByRole("link", { name: "Division Authoring" });
  await expect(link).toHaveAttribute("href", "/teacher/examinations");
  await page.goto("/teacher/examinations");
  await expect(page.getByRole("link", { name: /^Division TOS/ })).toBeVisible();
  // No school: the personal / school tools are not offered.
  await expect(page.getByText("Personal / School")).toHaveCount(0);
});

test("the division office shows an exam to teachers, then generates a 6-character passcode", async ({ page }) => {
  let code: string | null = null;
  const mock = await installSupabaseMock(
    page,
    {
      sms_users: [me("division_admin", null)],
      sms_exams: [APPROVED_EXAM],
      sms_exam_answer_keys: [],
      sms_exam_school_unlocks: [],
    },
    {
      can_read_exam_paper: () => true,
      exam_get_release_code: () => code,
      exam_division_set_published: () => null,
      exam_division_set_passcode: (args) => {
        code = String(args.p_code);
        return null;
      },
    },
  );
  await page.goto(`/division/examinations/exam/${EXAM_ID}`);

  const generate = page.getByRole("button", { name: "Generate passcode" });
  await expect(generate).toBeDisabled();

  await page.getByRole("switch", { name: "Show to all teachers in the division" }).click();
  await expect.poll(() => mock.writesTo("rpc/exam_division_set_published").length).toBe(1);
  expect(mock.writesTo("rpc/exam_division_set_published")[0].body).toEqual({
    p_exam_id: EXAM_ID,
    p_published: true,
  });

  await expect(generate).toBeEnabled();
  await generate.click();
  await expect.poll(() => mock.writesTo("rpc/exam_division_set_passcode").length).toBe(1);
  const sent = mock.writesTo("rpc/exam_division_set_passcode")[0].body as { p_code: string };
  expect(sent.p_code).toMatch(/^[A-Z0-9]{6}$/);
  await expect(page.getByText(sent.p_code, { exact: true })).toBeVisible();
  await expect(page.getByText("Enabled at 0 schools")).toBeVisible();
});

test("a school head enables a sealed division exam for the school", async ({ page }) => {
  const mock = await installSupabaseMock(
    page,
    {
      sms_users: [me("school_head")],
      sms_exams: [{ ...APPROVED_EXAM, is_published: true }],
      sms_exam_answer_keys: [],
    },
    { can_read_exam_paper: () => false, exam_school_unlock: () => true },
  );
  await page.goto(`/teacher/examinations/exam/${EXAM_ID}`);
  await expect(page.getByText("Not yet enabled for your school")).toBeVisible();
  await page.getByLabel("School passcode").fill("k7qp4m");
  await page.getByRole("button", { name: "Enable for my school" }).click();
  await expect.poll(() => mock.writesTo("rpc/exam_school_unlock").length).toBe(1);
  expect(mock.writesTo("rpc/exam_school_unlock")[0].body).toEqual({
    p_exam_id: EXAM_ID,
    p_code: "K7QP4M",
  });
});

test("a teacher on a sealed division exam is sent to their school head", async ({ page }) => {
  await installSupabaseMock(
    page,
    {
      sms_exams: [{ ...APPROVED_EXAM, is_published: true }],
      sms_exam_answer_keys: [],
    },
    { can_read_exam_paper: () => false },
  );
  await page.goto(`/teacher/examinations/exam/${EXAM_ID}`);
  await expect(page.getByText("Not yet enabled for your school")).toBeVisible();
  await expect(page.getByText(/until your\s+school head enables it/)).toBeVisible();
  await expect(page.getByLabel("Release code")).toHaveCount(0);
  await expect(page.getByLabel("School passcode")).toHaveCount(0);
});
