# Request for Approval — Adoption of the MATATAG Transmutation Table on Encoded Grades

**To:** Schools Division Superintendent, Schools Division of Bayugan City
**Through:** Chief, Curriculum Implementation Division · Education Program Supervisors
**From:** _[name, Information Technology Officer / SMS administrator]_
**Date:** _[date]_
**Subject:** Approval to apply the MATATAG transmutation table to Term 1 grades already encoded in the School Management System for SY 2026-2027

---

## 1. What is being requested

Approval to apply one database change to the School Management System that moves all
SY 2026-2027 class records from the DepEd Order No. 8, s. 2015 grading scheme to the
MATATAG scheme of the updated K to 10 Electronic Class Record.

**This is not a correction of a system error.** The system has been computing correctly
under DO 8, s. 2015. The change is the adoption of a new DepEd instrument, and it moves
grades that have already been encoded and posted.

## 2. Why approval is needed rather than a routine update

The MATATAG transmutation table **moves the passing floor from an Initial Grade of 60.00
to 70.00**:

| Initial Grade | DO 8, s. 2015 | MATATAG |
|---|---|---|
| 60.00 | 75 — **passing** | 72 |
| 65.00 | 78 — **passing** | 73 |
| 69.99 | 81 — **passing** | 74 |
| 70.00 | 81 — **passing** | 75 — **passing** |

A learner with an Initial Grade between 60.00 and 69.99 passes under the old table and
does not pass under the new one. The learner's work has not changed; the conversion has.

## 3. Measured effect

Figures below are drawn from _[database, date]_ and must be regenerated on the day of
approval — see §6.

| | Learner-terms |
|---|---|
| Currently passing, would not pass | **_[230]_** |
| Currently not passing, would pass | **_[374]_** |
| Schools with at least one learner ceasing to pass | **_[13]_** |
| Teachers whose posted grades are affected | **_[26]_** |

Two distinct populations are affected, and they may be approved separately:

**Cohort A — records already using transmutation.** A direct substitution of one DepEd
table for another. Accounts for all _[230]_ learners who cease to pass; _[229]_ of them
have an Initial Grade between 58.00 and 69.99.

**Cohort B — records not using transmutation.** These post the rounded Initial Grade and
have never been transmuted. Adopting MATATAG applies transmutation for the first time.
No learner ceases to pass; _[357]_ begin to pass. Average increase _[+26.88]_ points.

## 4. Decision requested

- [ ] **Approve both cohorts.** The MATATAG scheme applies to all SY 2026-2027 records.
- [ ] **Approve Cohort A only.** Adopt the new table; records not currently transmuting
      continue to post the rounded Initial Grade until a teacher enables it.
- [ ] **Approve Cohort B only.** Apply transmutation where it is absent; leave existing
      transmuted records on DO 8, s. 2015 for Term 1.
- [ ] **Defer to Term 2.** Term 1 closes under DO 8, s. 2015; MATATAG applies onward.
- [ ] **Do not approve.**

## 5. Verification before approval

Annex A lists every affected learner by school, section, subject, teacher, LRN, Initial
Grade, current grade and resulting grade. It is requested that **each School Head confirm
their own school's list** before division approval, since only the teacher of record can
say whether the encoded scores are complete and correct.

Two data conditions were found during preparation and are **not** caused by this change.
Both are listed in Annex B and warrant separate attention:

1. **_[245]_ encoded scores exceed the maximum score of their assessment item** (for
   example 110 on a 10-point quiz), producing an Initial Grade above 100 for _[26]_
   learner-terms. These are transcription errors in the class record.
2. **_[70]_ posted grades have no scores behind them** — the learner's scores were
   cleared after the grade was posted, and the system does not withdraw a posted grade.
   All are failing grades.

## 6. If approved

1. The affected-learner list is regenerated on the production database on the day of
   approval and re-attached as the final Annex A. Grades move as teachers encode; the
   list signed must be the list that is true at signing.
2. A full database backup is taken.
3. The change is applied. Every affected grade is snapshotted first and the change is
   fully reversible.
4. Affected schools are furnished their own learner list for records and for advising
   parents of learners whose status changes.

---

**Recommended:**

_______________________________
_[name]_ — _[position]_

**Reviewed:**

_______________________________
Chief, Curriculum Implementation Division

**Approved / Disapproved:**

_______________________________
Schools Division Superintendent

---

### Annexes
- **Annex A** — Affected learners by school (`out/pass_fail_crossings.csv`)
- **Annex B** — Data conditions requiring separate action
- **Annex C** — Source of the transmutation table used (updated K to 10 E-Class Record)
