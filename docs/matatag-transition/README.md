# MATATAG transition — sign-off pack

Everything needed to take the grading-scheme change (migration 177) to the division
office for approval.

| File | What it is |
|---|---|
| `SIGNOFF-MEMO.md` | The approval request. Bracketed `_[values]_` are placeholders — fill from the figures the query returns on the day. |
| `affected_learners.sql` | **Read-only.** Produces the authoritative affected-learner list. Run on the database that will actually be migrated. |
| `out/pass_fail_crossings.csv` | Sample output from the local clone. **Indicative only — not for signature.** |

## Procedure

1. **Regenerate the list on production, on the day.** A list from the clone is out of
   date the moment a teacher encodes a score.

   ```
   psql "$PROD" -f affected_learners.sql
   ```

   For the signature annex, uncomment the pass-mark filter at the bottom of the query so
   only learners crossing 75 are listed.

2. **Send each School Head their own school's rows first.** Only the teacher of record
   can say whether the encoded scores are complete. Division approval over an unverified
   list approves the wrong thing.

3. **Fill in the memo** from the returned counts and route it.

4. **On approval:** full backup, then apply `177_class_record_adopt_matatag_scheme.sql`.
   Narrow step 2's `WHERE` to `AND use_transmutation` if only Cohort A was approved.

5. **Furnish affected schools** their learner list afterwards, for records and for
   advising the parents of learners whose status changed.

## Handling note

The CSV in `out/` carries learner names and LRNs from a clone of live DepEd records.
Keep it local, share it only with the school it belongs to, and delete it once the
signed annex has been regenerated from production. Do not attach it to anything
public and do not upload it to an external service.
