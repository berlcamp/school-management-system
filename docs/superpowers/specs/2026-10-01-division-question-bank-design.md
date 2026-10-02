# Division Question Bank — Design

Date: 2026-10-01 (rewritten 2026-10-02) · Migration: **195** · Extends: migration 194 (`docs/superpowers/specs/2026-10-01-division-exam-qa-design.md`) · Status: rewritten after the DepEd workflow was clarified; pending spec review

> **Supersedes the 2026-10-01 draft.** That draft anchored a bank question to a
> Division TOS slot, sent every exam-authored question into the bank as a
> draft, and blocked exam approval until each was approved. None of that is
> the DepEd process. Removed: `origin_tos_item_id`, the "New Question → bank
> draft" path (old R5), the rule that every MC/TF item of a division exam must
> be bank-linked, the per-question gate on exam approval, and `exam_bank_sync`.

## 1. Intent — the DepEd flow

1. A QA-authorized teacher opens a learning area + grade and sees its **Least
   Learned Competencies (LLC)**, computed from **Summative Test** results only
   (never Term Exams), pooled across the whole division.
2. For a competency on that list they write questions with answers. **Each
   question is QA-reviewed**; once approved it is in the **Question Bank**.
3. When an authorized teacher builds a division exam, each item is either
   **taken from the bank** or **written new** in the exam.
4. QA reviews the **questionnaire as a whole** (194, unchanged in its rules).

The bank is fed **only** through steps 1–2. A question written inside an exam
stays in that exam.

Making step 1 possible needs one thing the system does not have: a way to know
that two teachers' TOS name the *same* competency. Competency text is typed
freely today (0 of 2 799 competencies on the local clone carry an LC code;
140 spellings of subject name). So this design adds a **division competency
catalogue** that every TOS picks from.

## 2. Business rules (confirmed by the user, 2026-10-02)

| # | Rule | Decision |
|---|---|---|
| R1 | LLC source | **Every `Summative Test` result in the division** for the learning area + grade + school year — division, school-wide and private exams alike. Term Exam results never count. |
| R2 | Competency identity | A **division competency catalogue** (learning area + grade + LC code + text). A TOS **picks** competencies from it; aggregation is by catalogue id, never by text. |
| R3 | Catalogue applies to | **Every TOS** — personal, school-wide and division, Term Exam and Summative Test alike — on creation and on every save of a draft. Approved/archived TOS are never re-checked. |
| R4 | Catalogue maintainers | **Division office and QA**, equal rights. Entries are **retired, never deleted**; an edit is for typos only — a curriculum change is a new entry. |
| R5 | New question in an exam | **Stays in that exam only**; reviewed as part of the questionnaire. It never enters the bank. |
| R6 | "Least learned" | The **3 lowest competencies by pooled MPS**, ties at third place included. N lives in one SQL function (`llc_count()` = 3). |
| R7 | Who may write a bank question for what | Only for a competency **on the current LLC list** at creation time. A draft whose competency later drops off the list may still be finished and submitted. |
| R8 | Bank → exam match | **Same catalogue competency is required.** Cognitive level is a **warning**: matching level is listed first; a mismatch is allowed after an explicit "intentional mismatch" confirmation, recorded on the exam row. |
| R9 | Question types | Launch set **`multiple_choice`, `true_false`**, held in `bank_supported_types()`; schema accepts all seven exam types. (Carried over from the previous draft.) |
| R10 | Permissions are separate decisions | View LLC / browse approved bank = QA-authorized teachers, QA, division office. Write bank questions = QA-authorized teachers. Review = QA only, never one's own. Catalogue = division office + QA. |

## 3. Existing state relied on

- `sms_tos` (096): `subject_name` free TEXT, `grade_level`, `school_year`, `exam_type` free TEXT (`'Term Exam' | 'Summative Test'` offered since f2262a1; older rows carry other strings), `school_id` (NULL = division). `sms_tos_competencies`: `competency_text NOT NULL`, `lc_code` nullable. `sms_tos_items`: `(tos_id, item_number)` → `competency_id`, `cognitive_level`.
- `sms_exams` (099): `tos_id NOT NULL`, `school_id`. `sms_exam_questions`, `_options`, `_answer_keys` (132), `image_path`/`image_name` (159).
- `sms_exam_results` / `sms_exam_result_students.correct_items INTEGER[]` (101).
- `lib/utils/itemAnalysis.ts` `competencyStats` — per-competency MPS = correct responses ÷ (items × learners). The pooled RPC uses the same formula.
- 194: review columns, `exam_review_*` RPCs, `sms_exam_review_events`, helpers `exam_me_id`, `is_exam_qa`, `is_exam_oversight`, `is_division_author`, flag `sms.exam_review`. **194 is applied in production; its file is never edited** — 195 uses `CREATE OR REPLACE` with identical signatures.
- 193: the `SECURITY DEFINER` aggregate-only pattern for division-wide reads.

## 4. Data model (195)

### 4.1 Catalogue

**`sms_learning_areas`** — `id`, `name` TEXT NOT NULL, `is_active` BOOLEAN DEFAULT true, timestamps. Unique on `lower(btrim(name))`.

**`sms_competency_catalogue`** — `id`, `learning_area_id` → `sms_learning_areas` ON DELETE RESTRICT, `grade_level` INTEGER NOT NULL (0–12), `lc_code` TEXT NOT NULL (stored normalized: trimmed, upper-cased), `competency_text` TEXT NOT NULL, `is_active` BOOLEAN DEFAULT true, `created_by` → `sms_users` ON DELETE SET NULL, timestamps. Unique `(learning_area_id, grade_level, lc_code)`. Index `(learning_area_id, grade_level, is_active)`.

Neither table has a DELETE policy. Retiring (`is_active = false`) hides an entry from pickers; every TOS and bank question already pointing at it keeps working.

### 4.2 Links on existing tables (additive, nullable, nothing backfilled)

- `sms_tos.learning_area_id` → `sms_learning_areas` ON DELETE RESTRICT.
- `sms_tos_competencies.catalogue_competency_id` → `sms_competency_catalogue` ON DELETE RESTRICT. On pick, the catalogue's `competency_text` and `lc_code` are **copied** into the row's existing columns — the printed TOS reads its own row (the 112/121/152 snapshot rule), so every current reader is untouched and a later catalogue typo fix never rewrites a signed TOS. `subject_name` is likewise set from the learning area's name.
- `sms_exam_questions.source_bank_question_id` → bank question ON DELETE RESTRICT; `sms_exam_questions.bank_level_override` BOOLEAN NOT NULL DEFAULT false.
- `sms_exam_review_events.entity_type` CHECK replaced: `tos | exam | author | question`.

### 4.3 Bank

**`sms_exam_bank_questions`**
| Column | Notes |
|---|---|
| `id` BIGSERIAL PK | |
| `catalogue_competency_id` BIGINT NOT NULL → catalogue ON DELETE RESTRICT | the competency it addresses — the match key (R8) |
| `cognitive_level` TEXT NOT NULL | same 6-value CHECK as `sms_tos_items`; set by the author, correctable by QA during review |
| `source_llc_school_year` TEXT NOT NULL | the LLC list it was written from — provenance only |
| `question_type` TEXT NOT NULL CHECK IN (7 exam types) | launch set enforced by `bank_supported_types()` |
| `question_text`, `answer_key`, `image_path`, `image_name` | same meaning as on `sms_exam_questions` |
| `created_by` → `sms_users` ON DELETE SET NULL | required on insert by policy |
| `review_status` (5-value CHECK, DEFAULT `draft`), `submitted_at`, `reviewed_by`, `reviewed_at`, `review_comment` | identical to 194 |
| timestamps | `update_updated_at_column` trigger |

Index `(catalogue_competency_id, review_status, cognitive_level)`. No uniqueness — many questions per competency.

**`sms_exam_bank_options`** — `id`, `question_id` → bank question ON DELETE CASCADE, `label`, `choice_text`, `is_correct` BOOLEAN NOT NULL DEFAULT false, `position`, `image_path`, `image_name`, timestamps.

(The previous draft's `sms_exam_bank_subitems` is dropped — YAGNI until a grouped type is enabled.)

### 4.4 Guard triggers

- **`tos_guard_catalogue`** (BEFORE INSERT OR UPDATE on `sms_tos`, `sms_tos_competencies`): on INSERT, and on UPDATE of a TOS that is **not** approved/archived (division: `review_status` not `approved`; school/private: always editable, so always checked), requires `learning_area_id` and every competency's `catalogue_competency_id`; the catalogue entry must match the TOS's learning area and grade and be active. Overwrites `competency_text` / `lc_code` / `subject_name` from the catalogue (client values ignored). Rows that are never touched again are never checked.
- **`bank_guard_fields`** (BEFORE INSERT OR UPDATE on bank questions): 194's shape — insert forces `draft` and clears review fields; review-field changes need `sms.exam_review = on`; `created_by`, `catalogue_competency_id`, `source_llc_school_year` immutable (except `created_by` → NULL by the FK); `question_type` must be in `bank_supported_types()`; `cognitive_level` changes after submit only inside the review flag (QA correction). INSERT additionally requires the competency to be on `division_llc(...)` for `source_llc_school_year` (R7).
- **`exam_guard_bank_copy`** (BEFORE INSERT/UPDATE/DELETE on `sms_exam_questions`, `_options`, `_answer_keys`): for a division exam's row with `source_bank_question_id` set, refuses client writes of content, of `source_bank_question_id` and of `bank_level_override` unless `sms.exam_bank = on` (set only by §6.3). Exams with `school_id` set are never touched.

## 5. Access (R10)

SECURITY DEFINER helpers, pinned `search_path`, EXECUTE revoked from PUBLIC/anon, granted to authenticated:

| Helper | Meaning | Today |
|---|---|---|
| `can_manage_catalogue()` | add/edit/retire catalogue entries | `is_exam_oversight() OR is_exam_qa()` |
| `can_view_llc()` | call `division_llc` | `is_division_author() OR is_exam_qa() OR is_exam_oversight()` |
| `can_contribute_bank()` | create bank questions | `is_division_author()` |
| `can_browse_bank()` | see **approved** bank questions | `is_division_author() OR is_exam_qa() OR is_exam_oversight()` |
| `can_review_bank()` | start/approve/return/reopen | `is_exam_qa()` |
| `can_edit_bank_question(id)` | edit this question | author = `exam_me_id()` AND `can_contribute_bank()` AND status IN (`draft`,`rejected`) |

| Table / cmd | Rule |
|---|---|
| learning areas, catalogue SELECT | `authenticated` (every TOS builder reads it) |
| learning areas, catalogue INSERT/UPDATE | `can_manage_catalogue()` |
| learning areas, catalogue DELETE | **no policy** |
| bank questions SELECT | author OR `can_review_bank()` OR `is_exam_oversight()` OR (`approved` AND `can_browse_bank()`) |
| bank questions INSERT | `can_contribute_bank() AND created_by = exam_me_id()` |
| bank questions UPDATE / DELETE | `can_edit_bank_question(id)`; DELETE also needs no `approve` event |
| bank options | SELECT follows parent; writes `can_edit_bank_question(question_id)` |

## 6. Functions

### 6.1 Rules isolated in one function each
- `llc_count() RETURNS INTEGER` — `3` (R6).
- `bank_supported_types() RETURNS TEXT[]` — `{multiple_choice,true_false}` (R9).

### 6.2 `division_llc(p_learning_area_id, p_grade_level, p_school_year)`
SECURITY DEFINER (it must read private exams' results across schools, which RLS hides — the 193 reason), guarded by `can_view_llc()`. **Only aggregates leave it.**

Scope: every `sms_exam_results` row of `p_school_year` whose exam's TOS has `exam_type = 'Summative Test'`, `learning_area_id = p_learning_area_id`, `grade_level = p_grade_level`, and `is_active`. Each result item maps through `sms_tos_items.item_number → competency_id → catalogue_competency_id`; items whose competency is unmapped are excluded.

Per catalogue competency: `correct` = Σ learners' correct responses on its items, `total` = Σ (its item count × learners) — `itemAnalysis.ts`'s formula, pooled. Returns `catalogue_competency_id, lc_code, competency_text, mps, learners, sections, schools, results`, keeping every competency whose `mps` ≤ the `mps` of the `llc_count()`-th row when sorted ascending (so MPS 30, 30, 40, 40, 50 returns the first four), ordered by `mps`; fewer than `llc_count()` competencies returns them all. Also returns (as a separate RPC `division_llc_coverage`, same args) the counts of summative results in scope and of those excluded as unmapped, for the page's "based on N results (M not mapped to the catalogue)" line.

### 6.3 Linking functions (author of a `draft`/`rejected` division exam, still authorized; set `sms.exam_bank = on`; SECURITY DEFINER)
- `exam_bank_use(p_exam_id, p_item_number, p_bank_question_id, p_level_override BOOLEAN DEFAULT false)`: question is `approved`; its `catalogue_competency_id` equals that of the exam TOS item's competency (else refused); if its `cognitive_level` differs from the item's, refused unless `p_level_override`. Upserts the exam row (text, figure, options, answer-key row with `choice_count` = option count for MC (2–5) or 2 for TF; existing `points` kept), sets `tos_item_id`, `source_bank_question_id`, `bank_level_override` (true only when a mismatch actually exists).
- `exam_bank_clear(p_exam_id, p_item_number)`: deletes the slot's exam row, options and answer-key row, so the item can be refilled from the bank or written new.

No sync function: an approved bank question is frozen, and reopen is refused while any exam row references it, so a copy cannot drift.

### 6.4 194 functions extended (same signatures)
- `exam_review_table('question') = 'sms_exam_bank_questions'`; `exam_review_load` handles a table without `school_id`.
- **submit (question):** author, `can_contribute_bank()`, status draft/rejected, type in `bank_supported_types()`; MC → text or figure, ≥ 2 options, exactly one `is_correct`; TF → `answer_key IN ('T','F')`.
- **start / decide (question):** `can_review_bank()`, reviewer ≠ author (by `exam_me_id()`, so a role switch does not help), reject needs a reason.
- **reopen (question):** approved, reason, has an `approve` event, **no `sms_exam_questions` row references it**.
- **submit (tos):** additionally requires the catalogue links of §4.4 (the trigger already enforces them on save; the submit check gives a readable message naming the unmapped competency).
- Exam submit / approve: **unchanged** from 194. Bank items need no extra check — they were approved when picked and are frozen.

## 7. UI

### Catalogue (shared component, `components/examinations/catalogue/`)
- Mounted at `/division/competencies` and `/qa/competencies`.
- Learning-area list (add, rename, retire/restore) → competency grid for an area + grade: LC code, text, active; add, edit (labelled "fix a typo — a curriculum change is a new entry"), retire/restore.
- **Excel import** (xlsx, already a dependency): columns `Learning Area | Grade | LC Code | Competency`. Preview first, then upsert by (area, grade, LC code): new → insert, existing → text updated, never deleted; unknown learning area → created. Without this the catalogue starts empty and blocks every TOS builder.

### TOS builder (`TosBuilderModal`, every TOS)
- Learning-area dropdown replaces free-text subject.
- Each competency row: searchable picker (LC code or text) filtered to the area + grade; the text field becomes read-only display.
- Opening a draft with unmapped rows shows a **"Map competencies"** step: each free-typed row beside a suggested catalogue match (LC code exact, else best text match — `lib/utils/catalogueMatch.ts`), with a picker to override. Save is disabled until every row is mapped. Approved/archived TOS open read-only as today.

### Teacher (`/teacher/examinations` Division group)
**Division TOS · Least Learned · Question Bank · Division Exams.** Unauthorized teachers see 194's notice for the last three.
- **Least Learned** (`/teacher/examinations/division/llc`): learning area, grade, school year (default current) → up to 3 (+ties) rows: LC code, competency, pooled MPS, learners / sections / schools; coverage line. Each row: **Write question** → single-question editor (MC/TF), cognitive level picker.
- **Question Bank** (`/teacher/examinations/division/questions`): tabs My Questions / Approved / Pending / Returned; filters learning area, grade, LC code, cognitive level, status, search. Status badge, latest QA comment, history; Edit/Submit while draft/returned, Withdraw while submitted.
- **Exam builder** (`ExamBuilderModal`, division mode): per MC/TF item **[Question Bank] [New Question]**.
  - Question Bank → approved questions for the item's catalogue competency; matching cognitive level first, others under "Different cognitive level". Picking one of those asks **"Use anyway — this level mismatch is intentional"**. Item then shows a "From Question Bank" badge (plus "Level override" when set) and is read-only; actions **Replace** / **Clear**.
  - New Question → today's editor, unchanged; the question stays in this exam.
  - A TOS item whose competency is unmapped (TOS approved before 195) → "This TOS item isn't linked to the competency catalogue; the Question Bank can't be used for it." New Question still works.

### QA
- Dashboard adds Pending Questions and Approved Questions counters; tabs Pending / Approved / Returned Questions (LC code, competency, cognitive level, question excerpt, teacher, school, submitted, status); **Catalogue** link.
- `/qa/question/[id]`: competency (LC code + text, area, grade), cognitive level (editable during review), the LLC school year it came from, question + figures, options with the correct one marked, author/school, history, `ReviewDecisionPanel` (entity `question`).
- Exam review page: per-item **Source** column (Question Bank / New) and a **Level override** flag. No blocking banner — nothing about bank status gates exam approval.

### Shared
- `lib/constants/examReview.ts`: `ReviewEntity` gains `'question'`; `BANK_SUPPORTED_TYPES`, `LLC_COUNT` mirror §6.1.
- `lib/utils/questionBank.ts`: RPC wrappers, `normalizeLcCode`, `llcCut` (pure top-N-with-ties, mirrors the SQL), `questionSourceLabel`.
- `lib/utils/catalogueImport.ts`: xlsx row parsing/validation. `lib/utils/catalogueMatch.ts`: map-competencies suggestions.

## 8. Migration and rollout

- **195**, the reserved number. 196/197 (staff roles) are unrelated, so applying 195 after them is safe.
- Additive only: new tables, nullable columns, guard triggers that skip untouched pre-195 rows, 194 functions `CREATE OR REPLACE`d with identical signatures, one CHECK replaced on `sms_exam_review_events`. **No DML, no backfill.**
- Header carries read-only `count(*)` queries showing no existing row changes, and the `proacl` check from 194.
- **Operational prerequisite:** the catalogue must be imported before teachers next save a TOS — from apply until import, every TOS save is refused. The rollout note in the header says so; the user applies 195 to production and imports the catalogue.

## 9. Backward compatibility

- Approved/archived TOS and exams: untouched, never re-checked, print exactly as before.
- Draft TOS (any tier): must map competencies on their next save.
- Summative results from TOS that are never mapped: excluded from the LLC list; never rewritten.
- Personal and school-wide exams: unchanged except the TOS builder's picker.
- Exam rows without `source_bank_question_id` (every existing one, and every "New Question"): behave exactly as today.
- 194's file and test file unchanged; 194's test must still pass.

## 10. Tests

1. **`supabase/tests/195_question_bank.sql`** (local only, one transaction, rolled back):
   - Catalogue: DELETE impossible for everyone; teacher cannot insert; division office and QA can; retired entry refused by new TOS rows, kept on old ones.
   - TOS guard: new TOS refused without learning area / catalogue links; mismatched area or grade refused; text/LC code overwritten from the catalogue; untouched pre-195 row never checked.
   - LLC: pooled MPS across two schools and a private exam equals hand-computed value; Term Exam results excluded; unmapped items excluded; ties at third place included; caller without `can_view_llc()` refused.
   - Bank: creation refused for a competency off the list; allowed on it; draft finishable after it drops off; unauthorized insert refused; self-approve refused including after a role switch; unapproved question invisible to other authors.
   - Exam use: different competency refused; level mismatch refused without override, accepted with it and flagged; client write to a bank copy refused; reopen refused while used; private/school exams unaffected.
   - Regression: `supabase/tests/194_exam_qa_review.sql` passes unchanged.
2. **vitest:** `normalizeLcCode`, `llcCut` (ties, fewer than 3, empty), `catalogueImport` parsing/validation, `catalogueMatch` suggestions, `questionSourceLabel`.
3. **Playwright (mocked):** Map competencies step blocks save until mapped; Least Learned → Write question; exam builder bank pick with level-mismatch confirmation (RPC args asserted); QA exam review shows Source and Level override.

## 11. Out of scope (deliberately)
- Promoting an exam-authored question into the bank (can be added later as its own per-question QA path).
- Grouped types (matching/completion), short answer, essay in the bank (R9 — schema accepts the types).
- Notifications (deferred since 194).
- Tunable LLC count (R6 is a function change).
- Mapping old *approved* TOS to the catalogue so their results join the LLC pool — possible later as an oversight-only action; not built now.
