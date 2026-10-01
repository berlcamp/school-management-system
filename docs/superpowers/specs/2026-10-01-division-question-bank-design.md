# Division Question Bank — Design

Date: 2026-10-01 · Migration: **195** · Extends: migration 194 (`docs/superpowers/specs/2026-10-01-division-exam-qa-design.md`) · Status: approved in conversation, pending spec review

## 1. Intent

DepEd builds division exams from a **Question Bank**: a pool of QA-approved,
reusable questions. QA-authorized teachers contribute questions; every question
passes its own QA review; a Division Exam item is filled either from an approved
bank question or by writing a new one, which enters the bank and QA like any
other. A Division Exam cannot be approved until every bank-linked question in it
is approved. Personal and school-wide exams are untouched.

QA approval now happens at three levels: **who may contribute** (teacher
authorization, 194), **what content is valid** (TOS and question approval), and
**what reaches the division** (exam approval).

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Reuse scope of a bank question | **Bound to one Division TOS item** (`sms_tos_items.id`). Usable only by exams built on that same TOS, same item number (Set A / Set B / make-up). No cross-TOS reuse. |
| Q2 | Question types in the bank | **`multiple_choice` and `true_false` only** (99.9 % of existing questions; one item, one answer — what the OMR sheet reads). Matching / completion / short answer / essay stay exam-only as in 194. |
| Q3 | New questions when the exam is submitted | **Submitting the exam also submits the author's draft/returned linked questions.** Each keeps its own QA decision and audit event. |
| Q4 | Storage | **Option 1: separate bank tables; exam rows hold a server-written copy** with `source_bank_question_id`; copies refreshed from the approved bank version at exam approval. |
| Q5 | Who reads approved bank questions | **QA-authorized teachers, QA and the division office only** — not every teacher, or the bank would leak a release-code-sealed exam's paper (161). |

## 3. Existing state relied on

- `sms_exam_questions` (099): `exam_id NOT NULL`, `tos_item_id` (nullable, used by 29/11 016 rows), `item_number`, `item_count`, `question_type` (7 values), `question_text`, `answer_key`, `points`, `position`, `image_path`/`image_name` (159). `sms_exam_options` (choices, `is_correct`), `sms_exam_subitems` (matching/completion), `sms_exam_answer_keys` (132: flat `item_number → correct_answer`, `choice_count`, `points`).
- `sms_tos_items` (096): one row per `(tos_id, item_number)` with `competency_id`, `cognitive_level` — 14 044 rows / 326 TOS locally.
- 194: review columns on `sms_tos`/`sms_exams`; helpers `exam_me_id`, `exam_me_type`, `is_exam_qa`, `is_exam_oversight`, `is_division_author`; flag `sms.exam_review`; `exam_review_table/load/transition`; RPCs `exam_review_submit/withdraw/start/decide/reopen(p_entity, p_id …)`; audit `sms_exam_review_events` (`entity_type` CHECK `tos|exam|author`); `can_edit_exam`; `exam_guard_review_fields`; paper SELECT via `can_read_exam_paper`. **194 is applied in production and its file is never edited** — 195 replaces functions with `CREATE OR REPLACE` (same signatures).

## 4. Data model (195)

### 4.1 `sms_exam_bank_questions`
| Column | Notes |
|---|---|
| `id` BIGSERIAL PK | |
| `tos_item_id` BIGINT NOT NULL → `sms_tos_items(id)` ON DELETE RESTRICT | slot; competency, cognitive level, item number, TOS all derived |
| `question_type` TEXT NOT NULL CHECK IN (`multiple_choice`,`true_false`) | |
| `question_text` TEXT, `answer_key` TEXT (TF: `T`/`F`), `image_path` TEXT, `image_name` TEXT | same meaning as on `sms_exam_questions` |
| `created_by` BIGINT → `sms_users(id)` ON DELETE SET NULL | nullable only so the FK action works; required on insert (policy `created_by = exam_me_id()`) |
| `review_status` TEXT NOT NULL DEFAULT 'draft' CHECK (5 values), `submitted_at`, `reviewed_by` → `sms_users` ON DELETE SET NULL, `reviewed_at`, `review_comment` | identical to 194 |
| `created_at`, `updated_at` | `update_updated_at_column` trigger |

Index on `tos_item_id`; **no uniqueness** (many candidates per item). Index on `(review_status)`.

### 4.2 `sms_exam_bank_options`
`id`, `question_id` → bank question ON DELETE CASCADE, `label`, `choice_text`, `is_correct` BOOLEAN NOT NULL DEFAULT false, `position`, `image_path`, `image_name`, timestamps.

### 4.3 Additive columns / constraints on existing tables
- `sms_exam_questions.source_bank_question_id` BIGINT NULL → `sms_exam_bank_questions(id)` ON DELETE RESTRICT; index.
- `sms_exam_review_events.entity_type` CHECK replaced: `tos|exam|author|question`.
- Nothing backfilled.

### 4.4 Guard triggers (cross-row rules)
- `bank_guard_tos_item` (BEFORE INSERT): the TOS item's TOS is `school_id IS NULL AND review_status = 'approved'`.
- `bank_guard_review_fields` (BEFORE INSERT OR UPDATE): same shape as 194's guard — on insert force `draft` and clear review fields; on update refuse review-field changes without `sms.exam_review = on`; refuse changes to `created_by` (except to NULL, the FK action), `tos_item_id`, `question_type`.
- `exam_guard_bank_copy` (BEFORE INSERT/UPDATE/DELETE on `sms_exam_questions`, `sms_exam_options`, `sms_exam_answer_keys`): for a **division** exam row that is (or would become) bank-linked, refuse any client write of content (`question_text`, `question_type`, `answer_key`, `image_*`, `points`, `source_bank_question_id`; options rows; the answer-key row for that item) unless `sms.exam_bank = on` (set only by §6 functions). Rows of exams with `school_id` set are never touched.

## 5. Access (RLS)

Helpers (SECURITY DEFINER, pinned search_path, EXECUTE revoked from PUBLIC/anon, granted to authenticated):
- `can_edit_bank_question(id)`: author = `exam_me_id()` AND `is_division_author()` AND status IN (`draft`,`rejected`).
- `can_see_bank_question(status, created_by)`: author, OR `is_exam_qa()`, OR `is_exam_oversight()`, OR (`status = 'approved'` AND `is_division_author()`).

| Table / cmd | Rule |
|---|---|
| bank questions SELECT | `can_see_bank_question(review_status, created_by)` |
| bank questions INSERT | `is_division_author() AND created_by = exam_me_id()` (status forced `draft` by trigger) |
| bank questions UPDATE | USING/WITH CHECK `can_edit_bank_question(id)` |
| bank questions DELETE | `can_edit_bank_question(id)` AND never approved (no `approve` event) — FK RESTRICT blocks deletion while an exam uses it |
| bank options SELECT | parent visible (EXISTS under parent policy) |
| bank options INSERT/UPDATE/DELETE | `can_edit_bank_question(question_id)` |

## 6. Functions

### 6.1 194 review functions extended to `'question'`
`exam_review_table('question') = 'sms_exam_bank_questions'`; `exam_review_load` handles a table without `school_id` (bank rows are always division) and returns `o_tos_id` NULL for questions. Additional rules:
- **submit (question):** author, authorized, status draft/rejected; MC → text or figure, ≥ 2 options, exactly one `is_correct`; TF → `answer_key IN ('T','F')`.
- **decide/start (question):** QA, reviewer ≠ author, reject needs reason.
- **reopen (question):** approved, reason, has an `approve` event, and **no `sms_exam_questions` row references it**.
- **submit (exam), additions:** every `multiple_choice`/`true_false` row of a division exam has `source_bank_question_id`; error names the first unlinked item ("Item 7 is not linked to a Question Bank question."); then submits each linked bank question that is the author's own and `draft`/`rejected` (own events), then `exam_bank_sync`.
- **decide approve (exam), additions:** refuse unless every linked bank question is `approved`; message lists them ("Item 4 — under review; Item 9 — returned"); then `exam_bank_sync` (re-copy from approved versions) before the status transition.

### 6.2 New linking functions (author of a `draft`/`rejected` division exam, still authorized)
- `exam_bank_use(p_exam_id, p_item_number, p_bank_question_id)`: bank question's TOS item must have `tos_id = exam.tos_id` and `item_number = p_item_number`; it must be `approved`, or a `draft`/`rejected` question by the exam's author. Upserts the exam row for that item (question, options, answer-key row with `choice_count` = number of options for MC (2–5) or 2 for TF, existing `points` kept), sets `tos_item_id` and `source_bank_question_id`. Audit: no event (selection is visible in the exam's rows; optional future).
- `exam_bank_new_question(p_exam_id, p_item_number, p_question_type, p_from_exam_question_id BIGINT DEFAULT NULL)` → bank id: creates a draft bank question for the exam TOS's item `p_item_number` (copying content from `p_from_exam_question_id` when converting a pre-195 row), then `exam_bank_use`.
- `exam_bank_sync(p_exam_id)`: re-copies every linked row from its bank question.
- `exam_bank_clear(p_exam_id, p_item_number)`: deletes the slot's exam row (+ options, + answer-key row).

All set `sms.exam_bank = on` transaction-locally, SECURITY DEFINER, pinned search_path, granted to authenticated only.

## 7. UI

### Teacher
- `/teacher/examinations` Division group: **Division TOS · Question Bank · Division Exams**.
- `/teacher/examinations/division/questions`: tabs My Questions / Approved / Pending / Returned; filters TOS, item #, status, search; **Add Question** → approved Division TOS → item # (shows competency + cognitive level) → `ExamQuestionEditor` single-question mode (MC/TF); status badge + latest QA comment; Edit/Submit when draft/returned, Withdraw when submitted; history. Unauthorized → 194 notice, no authoring.
- `ExamBuilderModal` (division mode only): per MC/TF item, `[Question Bank] [New Question]`. Bank → approved questions for that TOS item with search, author, approval date, "Use selected question" → `exam_bank_use`. New → existing editor writing the bank draft, then `exam_bank_sync`; item shows the question's status badge and returned reason. Pre-195 unlinked rows show "Not in the Question Bank — convert" → `exam_bank_new_question(..., p_from_exam_question_id)`. Other types unchanged. Bank-linked slots are written only through §6.2.

### QA
- Dashboard: seven counters (adds Pending Questions, Approved Questions).
- Tabs add Pending / Approved / Returned Questions: Item #, Question (truncated), TOS, Competency, Cognitive level, Teacher, School, Submitted, Status.
- `/qa/question/[id]`: TOS title, item #, competency, cognitive level, question + figures, options A–D with correct answer marked, author/school, submitted date, history, `ReviewDecisionPanel` (entity `question`).
- Exam review page: per-item table Item # · Source (Question Bank / New Question / Not in bank) · Question status; blocking banner "Exam cannot be approved. N of M questions approved. …" with links; Approve disabled while blocked (server also refuses).

### Shared
- `lib/constants/examReview.ts`: `ReviewEntity` gains `'question'`.
- `lib/utils/questionBank.ts`: RPC wrappers (`useBankQuestion`, `newBankQuestion`, `syncExamBank`, `clearBankSlot`), pure `tosItemForSlot`, `bankApprovalSummary`, `questionSourceLabel`.

## 8. Tests
1. `supabase/tests/195_question_bank.sql` (local only, rolled back; reuses 194's `tst` helpers/fixtures pattern): authorization (unauthorized insert refused, authorized ok, non-QA approve refused, self-approve refused incl. after role switch); lifecycle (draft/submitted/under-review/rejected not usable by another author's exam; approved usable; many per item number); slot (wrong item number / wrong TOS refused); copy protection (client edit of linked row / option / key refused); exam approval (unlinked MC refused at submit; submit auto-submits own drafts; approve refused while any linked question unapproved; approve ok when all approved and copies refreshed; returned question replaceable; approved question reusable by second exam; reopen of used bank question refused); TOS item must be on an approved division TOS; approved bank not visible to unauthorized teacher; regression — 194's test file passes unchanged, personal/school exam question writes unaffected.
2. vitest: `tosItemForSlot`, `bankApprovalSummary`, `questionSourceLabel`.
3. Playwright (mocked): teacher picks an approved bank question for an item (RPC args asserted); QA exam review shows blocking banner.

## 9. Backward compatibility
- Personal / school-wide: no new column populated, every new trigger/policy skips `school_id IS NOT NULL` exams.
- Approved Division TOS/exams (grandfathered and post-194): valid, never re-checked.
- Post-194 division exam drafts: convert path; submit refuses until linked.
- 194's file unchanged; 195 is additive + `CREATE OR REPLACE` with identical signatures.

## 10. Out of scope
Cross-TOS reuse (Q1); bank support for matching/completion/short answer/essay (Q2); notifications (deferred since 194); audit event for "question selected into exam".
