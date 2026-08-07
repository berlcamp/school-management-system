# DepEd Workflow Reference

## Enrollment Status Lifecycle

```
new student → active
existing student re-enrolling → active
transferee → pending_transfer → pending_review → active (or dropped)
end of school year → active → promoted | completed | graduated | retained | dropped
transfer out → active → transferred_out
```

### Status Definitions
| Status | Meaning |
|--------|---------|
| `active` | Currently enrolled for this school year |
| `completed` | Finished school year (not yet promoted — awaiting promotion action) |
| `promoted` | Passed and will enroll in the next grade level next SY |
| `graduated` | Completed final grade level (Gr6 or Gr12) |
| `retained` | Failed; will repeat the same grade level |
| `dropped` | Left school mid-year without completing |
| `transferred_out` | Formally transferred to another school |
| `pending_transfer` | Destination school enrolled them; waiting for origin to release records |
| `pending_review` | Origin approved record release; destination reviewing before finalizing |

### Critical Invariants
1. `promoted` enrollment MUST NOT have a `section_id` set — section assignment happens during new-SY enrollment
2. `graduated` is only valid for Grade 6 (Elementary) and Grade 12 (SHS)
3. `pending_transfer` → `pending_review` transition requires `record_access_granted = true` on `sms_record_requests`
4. `pending_review` → `active` transition requires explicit `review_transfer_enrollment` RPC call — no auto-approval
5. `transferred_out` students going to another school still require the full two-stage approval — no bypass

## Grade Level Mappings

| Education Level | Grades | Final Grade (Graduation) |
|----------------|--------|--------------------------|
| Kindergarten | Kinder | — |
| Elementary | 1–6 | Grade 6 → `graduated` |
| Junior High School (JHS) | 7–10 | Grade 10 → `promoted` to SHS |
| Senior High School (SHS) | 11–12 | Grade 12 → `graduated` |

## Grading System

- Grading periods: 1, 2, 3, 4
- Grade scale: 0–100 (DepEd standard: 75 = passing)
- Composite final grade = average of 4 grading periods
- GPA thresholds for promotion are configurable per school (see `sms_gpa_thresholds`)

## School Year Format

Format: `YYYY-YYYY` (e.g., `2024-2025`)
- School year runs June–March (Philippines academic calendar)
- `getCurrentSchoolYear()` returns current SY based on month (June+ = new SY)

## Evaluation System

- Type A: Student evaluates Teacher (`student_to_teacher`)
- Type B: Teacher evaluates Principal (`teacher_to_principal`)
- Likert scale: 1 (Strongly Disagree) to 5 (Strongly Agree)
- One submission per respondent per questionnaire (unique constraint)
- Students can only evaluate teachers of their enrolled sections in the current SY

## Transfer Workflow (Two-Stage)

### Stage 1 — Destination School
1. Staff looks up LRN → student found at different school
2. Entry mode = `transferee` (always, regardless of origin status)
3. Call `enroll_student_with_record_request` RPC
   - Creates `sms_record_requests` with `status = pending`
   - Creates `sms_enrollments` with `status = pending_transfer`

### Stage 2 — Origin School
1. Staff sees incoming request in Manage Requests → Incoming tab
2. Reviews and approves → sets `record_access_granted = true`
3. Enrollment moves to `pending_review`
4. RLS policies now allow destination school to read origin's grades, attendance, health data

### Stage 3 — Destination School
1. Staff reviews transferred student's academic history in `TransferRecordViewer`
2. Explicitly approves → `review_transfer_enrollment` RPC sets status = `active`
3. Or rejects → status = `dropped`, `record_access_granted` revoked

## Book System

- Allocation: Division/School Manager → Teacher (tracked in `sms_book_allocations`)
- Issuance: Teacher → Student (tracked in `sms_book_issuances`)
- Return codes: `FM` (found missing), `TDO` (turned over damaged), `NEG` (negligence)

## Form 137 / Document Requests

Status flow: `pending` → `approved` → `completed`
- Public users submit requests
- School staff process them
- Completed requests may include uploaded SF10 PDF
