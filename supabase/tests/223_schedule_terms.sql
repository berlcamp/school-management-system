-- Migration 223 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/223_schedule_terms.sql
-- One transaction, rolled back at the end. Each case runs under a savepoint so
-- an expected ERROR does not abort the rest (ON_ERROR_STOP is off on purpose),
-- and so the FK re-check on a row updated twice in one transaction never fires.
-- Picks a real schedule row off the clone; teacher_b is a same-school teacher
-- with a login, no schedule that year and not the section's adviser, so the
-- only thing that can admit them in [8] is the term-scoped schedule branch.
\set ON_ERROR_STOP 0
BEGIN;
CREATE TEMP TABLE t AS
SELECT * FROM (
  SELECT s.id AS sched_id, s.subject_id, s.section_id, s.room_id, s.teacher_id AS teacher_a,
         s.school_year, s.school_id, s.days_of_week, s.start_time, s.end_time,
         (SELECT u.id FROM procurements.sms_users u
           WHERE u.school_id = s.school_id AND u.type = 'teacher' AND u.id <> s.teacher_id
             AND u.user_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM procurements.sms_subject_schedules x
                              WHERE x.teacher_id = u.id AND x.school_year = s.school_year)
             AND NOT EXISTS (SELECT 1 FROM procurements.sms_sections sec
                              WHERE sec.id = s.section_id AND sec.section_adviser_id = u.id)
           ORDER BY u.id
           LIMIT 1) AS teacher_b
  FROM procurements.sms_subject_schedules s
  WHERE s.teacher_id IS NOT NULL AND s.room_id IS NOT NULL AND s.grading_periods IS NULL
    AND NOT s.conflict_override
  ORDER BY s.id
) c
WHERE c.teacher_b IS NOT NULL
LIMIT 1;
SELECT * FROM t;

\echo [1] CHECK accepts NULL, {3}, {1,2}; rejects {} and {5}
SAVEPOINT a; UPDATE procurements.sms_subject_schedules SET grading_periods='{3}' WHERE id=(SELECT sched_id FROM t); ROLLBACK TO a;
SAVEPOINT a; UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t); ROLLBACK TO a;
SAVEPOINT a; UPDATE procurements.sms_subject_schedules SET grading_periods='{}' WHERE id=(SELECT sched_id FROM t); ROLLBACK TO a;   -- expect ERROR check
SAVEPOINT a; UPDATE procurements.sms_subject_schedules SET grading_periods='{5}' WHERE id=(SELECT sched_id FROM t); ROLLBACK TO a;  -- expect ERROR check

\echo [2] A{1,2} + B{3} in the same room/section/slot: no conflict
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}' FROM t RETURNING 'ok-2' AS result;
ROLLBACK TO a;

\echo [3] A whole year + B{3}: conflict (expect ERROR Schedule conflict detected)
SAVEPOINT a;
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}' FROM t;
ROLLBACK TO a;

\echo [4] conflict_override still exempts
SAVEPOINT a;
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods, conflict_override)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}', true FROM t RETURNING 'ok-4' AS result;
ROLLBACK TO a;

\echo [5] Temporary row with disjoint terms: room free (expect ok-5)
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, NULL, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}' FROM t RETURNING 'ok-5' AS result;
ROLLBACK TO a;

\echo [6] Re-terming an existing row onto a clash is re-checked (expect ERROR)
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}' FROM t;
UPDATE procurements.sms_subject_schedules SET grading_periods=NULL WHERE id=(SELECT sched_id FROM t);
ROLLBACK TO a;

\echo [7] get_grade_encoding_status: B for period 3 only, A for periods 1-2 only
SAVEPOINT a;
DELETE FROM procurements.sms_subject_schedules x USING t
 WHERE x.subject_id=t.subject_id AND x.section_id=t.section_id AND x.school_year=t.school_year AND x.id<>t.sched_id;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods, conflict_override)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}', true FROM t;
SELECT (SELECT name FROM procurements.sms_users WHERE id=t.teacher_a) AS teacher_a_name,
       (SELECT name FROM procurements.sms_users WHERE id=t.teacher_b) AS teacher_b_name FROM t;
SELECT g.grading_period, g.assigned_teachers
  FROM t, procurements.get_grade_encoding_status(t.school_id, t.school_year, 3) g
 WHERE g.subject_id=t.subject_id AND g.section_id=t.section_id ORDER BY 1;
ROLLBACK TO a;

\echo [8] unpost guard: B may unpost a period-3 record, not a period-1 one
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods, conflict_override)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}', true FROM t;
INSERT INTO procurements.sms_class_records (subject_id, section_id, grading_period, school_year, teacher_id, school_id)
SELECT subject_id, section_id, p, school_year, teacher_a, school_id FROM t, (VALUES (1),(3)) v(p)
ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_id FROM procurements.sms_users WHERE id=(SELECT teacher_b FROM t)), 'role','authenticated')::text, true);
SAVEPOINT b;
SELECT 'ok-8a' AS result, procurements.unpost_class_record_grades(cr.id) FROM procurements.sms_class_records cr, t
 WHERE cr.subject_id=t.subject_id AND cr.section_id=t.section_id AND cr.school_year=t.school_year AND cr.grading_period=3;
ROLLBACK TO b;
SELECT procurements.unpost_class_record_grades(cr.id) FROM procurements.sms_class_records cr, t
 WHERE cr.subject_id=t.subject_id AND cr.section_id=t.section_id AND cr.school_year=t.school_year AND cr.grading_period=1; -- expect ERROR Only the teacher
ROLLBACK TO a;

\echo [9] semester split: A{1,2} + B{3,4} in the same slot: no conflict (expect ok-sem)
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3,4}' FROM t RETURNING 'ok-sem' AS result;
ROLLBACK TO a;

\echo [9b] overlapping terms: A{1,2} + B{2,3} in the same slot share period 2 (expect ERROR Schedule conflict)
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{2,3}' FROM t;
ROLLBACK TO a;

\echo [10] unpost keeps a carried-over grade (200): no computed row left, carried row survives
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods, conflict_override)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}', true FROM t;
INSERT INTO procurements.sms_class_records (subject_id, section_id, grading_period, school_year, teacher_id, school_id)
SELECT subject_id, section_id, 3, school_year, teacher_a, school_id FROM t
ON CONFLICT DO NOTHING;
-- Start the slot clean, so grades already on the clone cannot skew the counts
DELETE FROM procurements.sms_grades g USING t
 WHERE g.subject_id=t.subject_id AND g.section_id=t.section_id AND g.school_year=t.school_year
   AND g.grading_period=3;
-- two learners: one computed grade, one carried from another school's SF9
INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, remarks, teacher_id, carried_from_school)
SELECT st.id, t.subject_id, t.section_id, 3, t.school_year, 88, 'Passed', t.teacher_a,
       CASE WHEN st.rn = 1 THEN NULL ELSE 'St. Jude Academy' END
  FROM t, (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM procurements.sms_students ORDER BY id LIMIT 2) st;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_id FROM procurements.sms_users WHERE id=(SELECT teacher_b FROM t)), 'role','authenticated')::text, true);
SELECT 'unposted' AS check, procurements.unpost_class_record_grades(cr.id) AS removed
  FROM procurements.sms_class_records cr, t
 WHERE cr.subject_id=t.subject_id AND cr.section_id=t.section_id AND cr.school_year=t.school_year AND cr.grading_period=3;
SELECT 'non-carried rows left (expect 0)' AS check, count(*) AS n
  FROM procurements.sms_grades g, t
 WHERE g.subject_id=t.subject_id AND g.section_id=t.section_id AND g.school_year=t.school_year
   AND g.grading_period=3 AND g.carried_from_school IS NULL;
SELECT 'carried rows left (expect 1)' AS check, count(*) AS n
  FROM procurements.sms_grades g, t
 WHERE g.subject_id=t.subject_id AND g.section_id=t.section_id AND g.school_year=t.school_year
   AND g.grading_period=3 AND g.carried_from_school = 'St. Jude Academy';
ROLLBACK TO a;
ROLLBACK;
