# Division Question Bank — Design

Date: 2026-10-01 · Migration: **195** · Extends: migration 194 (`docs/superpowers/specs/2026-10-01-division-exam-qa-design.md`) · Status: revised after business-rule clarification, pending spec review

## 1. Intent

DepEd builds division exams from a **Question Bank**: a pool of QA-approved,
reusable questions. QA-authorized teachers contribute questions; every question
passes its own QA review; a Division Exam item is filled either from an approved
bank question or by writing a **new question, which is created in the Question
Bank as a draft and goes through the same QA review as any other**. A Division
Exam cannot be approved until every bank-linked question in it is approved, and
QA approves the exam as a separate decision. Personal and school-wide exams are
untouched.

QA approval happens at three levels: **who may contribute** (teacher
authorization, 194), **what content is valid** (TOS and question approval), and
**what reaches the division** (exam approval).

## 2. Business rules (confirmed by the user, 2026-10-01)

| # | Rule | Decision | Source |
|---|---|---|---|
| R1 | Reuse scope | **Across Division TOS by context**: a bank question fits any exam slot whose TOS item has the **same LC code, grade level and cognitive level**. | User confirmed "across TOS by context". |
| R2 | Competency match key | **LC code**, and every competency of a **Division** TOS must carry one before the TOS can be submitted to QA. Personal/school TOS are unaffected. Exact-text matching rejected (typo-fragile). | User confirmed. Local data: 0 of 2 799 competencies carry an LC code today; 140 subject spellings (106 normalized). |
| R3 | Question types | **Schema supports all seven exam question types**; the set **accepted at launch is `multiple_choice`, `true_false`**, held in one SQL function (`bank_supported_types()`) so enabling another type is a function change, not a schema redesign. | User confirmed "MC + TF at launch". Not stated as a DepEd rule — a launch choice. |
| R4 | Permissions are three separate decisions | **Contribute** = QA-authorized teacher (`sms_exam_qa_authors`, 194). **Browse/select approved questions** = QA-authorized teachers, QA, division office. **Review/approve** = QA only. Each is its own SQL helper even where two coincide today. | User confirmed browse set. Reason: approved bank questions are future/sealed exam content (161). |
| R5 | "New Question" meaning | Exam item → **Create New Question** → created in the **Question Bank as DRAFT** (author = exam author, context = that slot's TOS item) → linked to the exam item immediately **as pending** so authoring can continue → QA reviews it as a bank question → **APPROVED** → it is a valid question for the exam → QA **separately** approves the whole exam. A new question never bypasses bank QA; the exam cannot be approved while any linked question is not approved. | User's stated workflow. |
| R6 | Submitting an exam | Submitting the exam also submits the author's own draft/returned linked questions (each keeps its own QA decision and audit event). | Earlier decision Q3. |
| R7 | Storage | Separate bank tables; exam rows hold a **server-written copy** (`source_bank_question_id`); copies refreshed from the approved bank version at exam approval. | Earlier decision (option 1). |

**Not verified against a DepEd document:** no DepEd source for R1/R3 exists in this repository; the rules above are the user's confirmed business decisions. Both are isolated (R1 in `bank_question_fits_slot`, R3 in `bank_supported_types`) so a later DepEd clarification is a function change.

## 3. Existing state relied on

- `sms_exam_questions` (099): `exam_id NOT NULL`, `tos_item_id` (nullable), `item_number`, `item_count`, `question_type` (7 values), `question_text`, `answer_key`, `points`, `position`, `image_path`/`image_name` (159). `sms_exam_options`, `sms_exam_subitems`, `sms_exam_answer_keys` (132).
- `sms_tos` (096): `subject_name` (free text), `grade_level`. `sms_tos_competencies`: `competency_text`, `lc_code` (nullable, unused today). `sms_tos_items`: one row per `(tos_id, item_number)` with `competency_id`, `cognitive_level` (6 values).
- 194: review columns on `sms_tos`/`sms_exams`; helpers `exam_me_id`, `exam_me_type`, `is_exam_qa`, `is_exam_oversight`, `is_division_author`; flag `sms.exam_review`; `exam_review_table/load/transition`; RPCs `exam_review_submit/withdraw/start/decide/reopen(p_entity, p_id …)`; audit `sms_exam_review_events`; `can_edit_tos`, `can_edit_exam`; guards. **194 is applied in production; its file is never edited** — 195 uses `CREATE OR REPLACE` with identical signatures.

## 4. Data model (195)

### 4.1 `sms_exam_bank_questions`
| Column | Notes |
|---|---|
| `id` BIGSERIAL PK | |
| `origin_tos_item_id` BIGINT NOT NULL → `sms_tos_items(id)` ON DELETE RESTRICT | the slot it was written from — provenance and default context; never the reuse rule |
| `lc_code` TEXT NOT NULL | normalized (upper, trimmed) copy of the origin competency's LC code — **the match key** |
| `grade_level` INTEGER NOT NULL | copied from the origin TOS |
| `cognitive_level` TEXT NOT NULL | copied from the origin TOS item (same 6-value CHECK as `sms_tos_items`) |
| `subject_name` TEXT, `competency_text` TEXT | copied for display and filtering only — not part of the match |
| `question_type` TEXT NOT NULL CHECK IN (all 7 exam types) | launch set enforced by `bank_supported_types()` (R3) |
| `item_count` INTEGER NOT NULL DEFAULT 1 CHECK (≥ 1) | > 1 only for future grouped types |
| `question_text`, `answer_key`, `image_path`, `image_name` | same meaning as on `sms_exam_questions` |
| `created_by` BIGINT → `sms_users(id)` ON DELETE SET NULL | nullable only so the FK action works; required on insert by policy |
| `review_status` TEXT NOT NULL DEFAULT 'draft' (5-value CHECK), `submitted_at`, `reviewed_by` → `sms_users` ON DELETE SET NULL, `reviewed_at`, `review_comment` | identical to 194 |
| `created_at`, `updated_at` | `update_updated_at_column` trigger |

Context columns are **copied at creation** (the origin TOS is approved and frozen, so they cannot drift) and are immutable thereafter. Index on `(lc_code, grade_level, cognitive_level, review_status)` — the browse/select path. **No uniqueness**: many candidates per context.

### 4.2 `sms_exam_bank_options`
`id`, `question_id` → bank question ON DELETE CASCADE, `label`, `choice_text`, `is_correct` BOOLEAN NOT NULL DEFAULT false, `position`, `image_path`, `image_name`, timestamps. (MC choices; matching Column-B pool when that type is enabled.)

### 4.3 `sms_exam_bank_subitems`
`id`, `question_id` → bank question ON DELETE CASCADE, `prompt_text`, `correct_answer`, `position`, timestamps — mirrors `sms_exam_subitems`. **Created now, unused at launch** (R3: grouped types later need no schema change).

### 4.4 Additive changes to existing objects
- `sms_exam_questions.source_bank_question_id` BIGINT NULL → bank question ON DELETE RESTRICT; index.
- `sms_exam_review_events.entity_type` CHECK replaced: `tos|exam|author|question`.
- Nothing backfilled.

### 4.5 Guard triggers
- `bank_guard_context` (BEFORE INSERT): origin TOS item's TOS is `school_id IS NULL AND review_status = 'approved'`; its competency has a non-blank LC code; **sets** `lc_code`, `grade_level`, `cognitive_level`, `subject_name`, `competency_text` from the origin (client values ignored).
- `bank_guard_fields` (BEFORE INSERT OR UPDATE): 194's shape — insert forces `draft` and clears review fields; update refuses review-field changes without `sms.exam_review = on`; refuses changes to `created_by` (except to NULL, the FK action), `origin_tos_item_id` and every context column; refuses a `question_type` outside `bank_supported_types()`.
- `exam_guard_bank_copy` (BEFORE INSERT/UPDATE/DELETE on `sms_exam_questions`, `sms_exam_options`, `sms_exam_answer_keys`): for a **division** exam's bank-linked row, refuses any client write of content or of `source_bank_question_id` unless `sms.exam_bank = on` (set only by §6.3 functions). Exams with `school_id` set are never touched.

## 5. Access (R4)

SECURITY DEFINER helpers, pinned search_path, EXECUTE revoked from PUBLIC/anon, granted to authenticated:

| Helper | Meaning | Today |
|---|---|---|
| `can_contribute_bank()` | may create questions | `is_division_author()` |
| `can_browse_bank()` | may browse/select **approved** questions | `is_division_author() OR is_exam_qa() OR is_exam_oversight()` |
| `can_review_bank()` | may start/approve/return/reopen | `is_exam_qa()` |
| `can_edit_bank_question(id)` | may edit this question | author = `exam_me_id()` AND `can_contribute_bank()` AND status IN (`draft`,`rejected`) |
| `can_see_bank_question(status, created_by)` | row visibility | author OR `can_review_bank()` OR `is_exam_oversight()` OR (`status = 'approved'` AND `can_browse_bank()`) |

| Table / cmd | Rule |
|---|---|
| bank questions SELECT | `can_see_bank_question(review_status, created_by)` |
| bank questions INSERT | `can_contribute_bank() AND created_by = exam_me_id()` |
| bank questions UPDATE | USING/WITH CHECK `can_edit_bank_question(id)` |
| bank questions DELETE | `can_edit_bank_question(id)` AND no `approve` event (FK RESTRICT blocks deletion while used) |
| bank options / subitems SELECT | parent visible (EXISTS under parent policy) |
| bank options / subitems INSERT/UPDATE/DELETE | `can_edit_bank_question(question_id)` |

## 6. Functions

### 6.1 Rules isolated in single functions
- `bank_supported_types() RETURNS TEXT[]` — `{multiple_choice,true_false}` at launch (R3).
- `bank_question_fits_slot(p_bank_question_id, p_exam_id, p_item_number) RETURNS BOOLEAN` (R1): the exam's TOS item at `p_item_number` exists; its competency's normalized LC code = the question's `lc_code`; the exam TOS `grade_level` = the question's; the item's `cognitive_level` = the question's; and `item_count = 1` (grouped types will extend this function). Used by the picker query and by `exam_bank_use`.

### 6.2 194 functions extended (same signatures)
- `exam_review_table('question') = 'sms_exam_bank_questions'`; `exam_review_load` handles a table without `school_id` (bank rows are always division) and returns `o_tos_id` NULL.
- **submit (tos), addition (R2):** every competency of the TOS has a non-blank LC code, else "Competency '…' has no LC code."
- **submit (question):** author, `can_contribute_bank()`, status draft/rejected, type in `bank_supported_types()`; MC → text or figure, ≥ 2 options, exactly one `is_correct`; TF → `answer_key IN ('T','F')`.
- **start / decide (question):** `can_review_bank()`, reviewer ≠ author, reject needs reason.
- **reopen (question):** approved, reason, has an `approve` event, **no `sms_exam_questions` row references it**.
- **submit (exam), additions:** every `multiple_choice`/`true_false` row of a division exam has `source_bank_question_id` ("Item 7 is not linked to a Question Bank question."); then submits each linked question that is the author's own and `draft`/`rejected` (own events); then `exam_bank_sync`.
- **decide approve (exam), additions:** refused unless every linked bank question is `approved` and still `bank_question_fits_slot` ("Item 4 — under review; Item 9 — returned"); then `exam_bank_sync` before the status transition.

### 6.3 Linking functions (author of a `draft`/`rejected` division exam, still authorized; `sms.exam_bank = on`; SECURITY DEFINER; granted to authenticated only)
- `exam_bank_use(p_exam_id, p_item_number, p_bank_question_id)`: requires `bank_question_fits_slot`, and the question is `approved` **or** a `draft`/`rejected` question by the exam's author. Upserts the exam row (question, options, answer-key row with `choice_count` = option count for MC (2–5) or 2 for TF, existing `points` kept), sets `tos_item_id` to the slot's item and `source_bank_question_id`.
- `exam_bank_new_question(p_exam_id, p_item_number, p_question_type, p_from_exam_question_id BIGINT DEFAULT NULL)` → bank id: creates a **draft** bank question whose origin is the slot's TOS item (requires an LC code on it), author = caller, content copied from `p_from_exam_question_id` when converting a pre-195 row; then `exam_bank_use`. This is R5's "Create New Question".
- `exam_bank_sync(p_exam_id)`: re-copies every linked row from its bank question.
- `exam_bank_clear(p_exam_id, p_item_number)`: deletes the slot's exam row, options and answer-key row.

## 7. UI

Wording is part of the requirement (R5): the builder says **"New Question (added to the Question Bank — needs QA approval)"**, and an item filled that way shows **"Pending QA — this exam can't be approved until this question is approved."**

### Teacher
- `/teacher/examinations` Division group: **Division TOS · Question Bank · Division Exams**.
- Division TOS builder: LC code field required for Division TOS (enforced at submit; inline hint while editing).
- `/teacher/examinations/division/questions`: tabs My Questions / Approved / Pending / Returned; filters LC code, grade, cognitive level, subject, status, search; **Add Question** → approved Division TOS → item # (shows LC code, competency, cognitive level) → `ExamQuestionEditor` single-question mode (launch types). Status badge + latest QA comment; Edit/Submit while draft/returned, Withdraw while submitted; history. Approved tab requires `can_browse_bank()` (authors/QA/division office). Unauthorized teachers → 194 notice, no authoring, no browsing.
- `ExamBuilderModal` (division mode): per launch-type item, `[Question Bank] [New Question]`. Bank → approved questions where `bank_question_fits_slot` (same LC code, grade, cognitive level — from any Division TOS), with search, author, origin TOS, approval date → `exam_bank_use`. New → editor writing the draft bank question, then `exam_bank_sync`, with the R5 wording and status badge / returned reason. Pre-195 unlinked rows → "Not in the Question Bank — convert". Slot whose TOS item lacks an LC code → "This TOS item has no LC code; the Question Bank can't be used for it" (only possible on TOS approved before 195). Other types unchanged.

### QA
- Dashboard: seven counters (adds Pending Questions, Approved Questions).
- Tabs add Pending / Approved / Returned Questions: LC code, Item # (origin), Question (truncated), Grade, Cognitive level, Teacher, School, Submitted, Status.
- `/qa/question/[id]`: origin TOS title and item #, LC code, competency, grade, cognitive level, question + figures, options A–D with the correct one marked, author/school, submitted date, history, `ReviewDecisionPanel` (entity `question`).
- Exam review page: per-item table Item # · Source (Question Bank / New Question / Not in bank) · Question status; blocking banner "Exam cannot be approved. N of M questions approved. …" with links; Approve disabled while blocked (server also refuses).

### Shared
- `lib/constants/examReview.ts`: `ReviewEntity` gains `'question'`; `BANK_SUPPORTED_TYPES` mirrors §6.1.
- `lib/utils/questionBank.ts`: RPC wrappers, pure `normalizeLcCode`, `bankApprovalSummary`, `questionSourceLabel`, `slotContext`.

## 8. Tests
1. `supabase/tests/195_question_bank.sql` (local only, rolled back): authorization (unauthorized insert refused; authorized ok; non-QA approve refused; self-approve refused incl. after role switch); permissions split (unauthorized teacher cannot browse approved questions; division office can browse but not contribute or review); context (question from TOS A item fits TOS B item with same LC code/grade/level; refused for different LC code, grade or level; client-supplied context ignored); Division TOS submit refused without LC codes; personal TOS unaffected; lifecycle (draft/submitted/under-review/rejected not usable by another author's exam; approved usable; many per context); unsupported type refused; copy protection; exam approval (unlinked MC refused at submit; submit auto-submits own drafts; approve refused while any linked question unapproved; ok when all approved, copies refreshed; returned question replaceable; approved question reusable by a second exam on a different TOS; reopen of a used question refused); regression — 194's test file passes unchanged; personal/school exam writes unaffected.
2. vitest: `normalizeLcCode`, `bankApprovalSummary`, `questionSourceLabel`, `slotContext`.
3. Playwright (mocked): teacher selects an approved bank question for an item (RPC args asserted); "New Question" shows the R5 wording; QA exam review shows the blocking banner.

## 9. Backward compatibility
- Personal / school-wide TOS and exams: untouched (no new column populated; every new trigger/policy skips `school_id IS NOT NULL`; LC-code requirement applies only to Division TOS submit).
- Approved Division TOS/exams (grandfathered and post-194): valid, never re-checked. A TOS approved before 195 without LC codes cannot anchor or receive bank questions; its existing exams are unaffected; new bank-based exams need a Division TOS with LC codes (author writes a new one).
- Division TOS drafts/returned since 194: must add LC codes before (re)submitting.
- Division Exam drafts since 194: convert path; submit refuses until linked.
- 194's file unchanged; 195 is additive + `CREATE OR REPLACE` with identical signatures.

## 10. Out of scope (deliberately)
Grouped types (matching/completion) and short answer/essay in the bank at launch (R3 — schema ready); notifications (deferred since 194); audit event for "question selected into exam"; fuzzy/text competency matching (R2).
