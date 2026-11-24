-- ============================================================================
-- 239: Final grade adjustments, approved, and personal notifications
-- ============================================================================
-- A subject teacher may ask for points on a learner's FINAL grade (77 + 2 = 79)
-- with a reason. Nothing changes until the subject's Department Head (216) or
-- the school's head / assistant head approves. Nobody decides their own request.
--
-- The final grade is stored nowhere, so the points are kept apart from
-- sms_grades (no grade row is ever touched) and added wherever a final is
-- computed. TS rule: lib/utils/gradeAdjustments.ts. SQL rule: the points are
-- added to each period of the subject in students_gpa_for_grade, which adds
-- them once to the mean. Change one, change the other.
--
-- semester: 0 = the year's final grade; 1 / 2 = an old-curriculum Senior High
-- semester final (189).
--
-- sms_notifications is a per-person bell item, beside 198's announcements.
--
-- Writes only through the SECURITY DEFINER functions below (no write policy).
-- students_gpa_for_grade is 235's body plus the adjustment join: with no
-- approved row every GPA is unchanged. Nothing is backfilled; no DML.
--
-- Requires 198, 216, 235. Before applying, compare on production:
--   SELECT pg_get_functiondef('procurements.students_gpa_for_grade'::regproc);
-- with 235's file, and confirm these are all non-null:
--   SELECT to_regprocedure('procurements.sms_heads_subject(bigint)'),
--          to_regprocedure('procurements.announcement_me_id()'),
--          to_regclass('procurements.sms_section_subject_terms');
-- Tests: supabase/tests/239_final_grade_adjustments.sql
-- ============================================================================

-- ------------------------------------------------------------------ tables --
CREATE TABLE IF NOT EXISTS procurements.sms_grade_adjustments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id     BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  student_id    BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  subject_id    BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE,
  section_id    BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_year   TEXT   NOT NULL,
  semester      SMALLINT NOT NULL DEFAULT 0 CHECK (semester IN (0, 1, 2)),
  points        SMALLINT NOT NULL CHECK (points BETWEEN 1 AND 10),
  -- Free TEXT, app-validated (lib/constants/gradeAdjustments.ts), per 119.
  reason        TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  note          TEXT,
  -- The final grade when the request was made, for the record.
  base_final    SMALLINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn', 'revoked')),
  requested_by  BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by    BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_remarks TEXT,
  revoked_by    BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  revoked_at    TIMESTAMPTZ,
  revoke_remarks TEXT
);

-- One live request per learner, subject and final grade.
CREATE UNIQUE INDEX IF NOT EXISTS sms_grade_adjustments_live_uq
  ON procurements.sms_grade_adjustments (student_id, subject_id, school_year, semester)
  WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS sms_grade_adjustments_school_idx
  ON procurements.sms_grade_adjustments (school_id, status);

CREATE TABLE IF NOT EXISTS procurements.sms_notifications (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  ref_id      BIGINT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link_path   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sms_notifications_user_idx
  ON procurements.sms_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_notifications_ref_idx
  ON procurements.sms_notifications (kind, ref_id);

-- ----------------------------------------------------------------- helpers --
-- May the caller decide on this subject's adjustments? Active role and active
-- school only (invariants 12, 13).
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_can_decide(
  p_subject_id BIGINT, p_school_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.user_id = auth.uid() AND u.is_active
      AND (u.type = 'super admin'
           OR (u.type IN ('school_head', 'assistant_school_head')
               AND u.school_id = p_school_id)
           OR (u.school_id = p_school_id
               AND procurements.sms_heads_subject(p_subject_id))));
$$;

-- The final grade as Class Record's Final Grade view shows it: NULL until every
-- required period of the section is posted.
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_base_final(
  p_student_id BIGINT, p_subject_id BIGINT, p_section_id BIGINT, p_semester SMALLINT)
RETURNS SMALLINT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_sy TEXT; v_old BOOLEAN; v_periods INT[]; v_n INT; v_avg NUMERIC;
BEGIN
  SELECT s.school_year::TEXT, COALESCE(s.shs_curriculum, '') = 'old'
    INTO v_sy, v_old FROM sms_sections s WHERE s.id = p_section_id;
  IF v_sy IS NULL OR v_old <> (p_semester <> 0) THEN RETURN NULL; END IF;

  IF p_semester = 1 THEN v_periods := '{1,2}';
  ELSIF p_semester = 2 THEN v_periods := '{3,4}';
  ELSE
    SELECT o.terms::INT[] INTO v_periods FROM sms_section_subject_terms o
     WHERE o.section_id = p_section_id AND o.subject_id = p_subject_id
       AND o.school_year = v_sy;
    v_periods := COALESCE(v_periods,
      CASE WHEN v_sy >= '2026-2027' THEN '{1,2,3}'::INT[] ELSE '{1,2,3,4}'::INT[] END);
  END IF;

  SELECT count(DISTINCT g.grading_period), avg(g.grade) INTO v_n, v_avg
    FROM sms_grades g
   WHERE g.student_id = p_student_id AND g.subject_id = p_subject_id
     AND g.section_id = p_section_id AND g.school_year = v_sy
     AND g.grading_period::INT = ANY (v_periods) AND g.grade > 0;
  IF v_n < cardinality(v_periods) THEN RETURN NULL; END IF;
  RETURN round(v_avg)::SMALLINT;
END $$;

-- "Subject · Section" for a notification.
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_label(p_id BIGINT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT concat_ws(', ', st.last_name, st.first_name) || ': +' || a.points
         || ' in ' || sub.name || ' (' || sec.name || ')'
  FROM sms_grade_adjustments a
  JOIN sms_students st ON st.id = a.student_id
  JOIN sms_subjects sub ON sub.id = a.subject_id
  JOIN sms_sections sec ON sec.id = a.section_id
  WHERE a.id = p_id;
$$;

-- --------------------------------------------------------------------- RLS --
ALTER TABLE procurements.sms_grade_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON procurements.sms_grade_adjustments, procurements.sms_notifications
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON procurements.sms_grade_adjustments, procurements.sms_notifications
  TO authenticated;
GRANT ALL ON procurements.sms_grade_adjustments, procurements.sms_notifications
  TO service_role;

-- An approved adjustment is part of the grade, and sms_grades is readable by
-- every signed-in user; anything else only by those it concerns.
DROP POLICY IF EXISTS "sms_grade_adjustments: select" ON procurements.sms_grade_adjustments;
CREATE POLICY "sms_grade_adjustments: select" ON procurements.sms_grade_adjustments
  FOR SELECT TO authenticated USING (
    status = 'approved'
    OR requested_by = procurements.announcement_me_id()
    OR procurements.grade_adjustment_can_decide(subject_id, school_id)
    OR EXISTS (
      SELECT 1 FROM procurements.sms_subject_schedules ss
      WHERE ss.section_id = sms_grade_adjustments.section_id
        AND ss.subject_id = sms_grade_adjustments.subject_id
        AND ss.teacher_id = procurements.announcement_me_id()));

DROP POLICY IF EXISTS "sms_notifications: select" ON procurements.sms_notifications;
CREATE POLICY "sms_notifications: select" ON procurements.sms_notifications
  FOR SELECT TO authenticated
  USING (user_id = procurements.announcement_me_id());

-- ------------------------------------------------------------ notifications --
CREATE OR REPLACE FUNCTION procurements.notifications_mark_read(p_ids BIGINT[])
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = procurements, public AS $$
  UPDATE sms_notifications SET read_at = now()
   WHERE id = ANY (p_ids) AND read_at IS NULL
     AND user_id = procurements.announcement_me_id();
$$;

-- Everyone who can decide: the subject's Department Heads at the school and
-- the heads / assistant heads acting or holding that role there — never the
-- requester.
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_notify_approvers(p_id BIGINT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = procurements, public AS $$
  INSERT INTO sms_notifications (user_id, kind, ref_id, title, body, link_path)
  SELECT u.id, 'grade_adjustment_request', a.id,
         'Additional points need approval',
         procurements.grade_adjustment_label(a.id),
         '/grade-adjustments'
  FROM sms_grade_adjustments a
  JOIN sms_users u ON u.is_active AND u.id IS DISTINCT FROM a.requested_by
  WHERE a.id = p_id
    AND (
      (u.school_id = a.school_id AND u.type IN ('school_head', 'assistant_school_head'))
      OR EXISTS (SELECT 1 FROM sms_user_roles r
                 WHERE r.user_id = u.id AND r.school_id = a.school_id
                   AND r.role IN ('school_head', 'assistant_school_head'))
      OR EXISTS (SELECT 1 FROM sms_department_head_subjects l
                 JOIN sms_staff_designations d
                   ON d.user_id = l.user_id AND d.school_id = l.school_id
                  AND d.designation = 'department_head'
                 WHERE l.user_id = u.id AND l.subject_id = a.subject_id
                   AND l.school_id = a.school_id));
$$;

-- Nothing left to approve: clear the approvers' unread badges.
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_clear_requests(p_id BIGINT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = procurements, public AS $$
  UPDATE sms_notifications SET read_at = now()
   WHERE kind = 'grade_adjustment_request' AND ref_id = p_id AND read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION procurements.grade_adjustment_notify_teacher(
  p_id BIGINT, p_title TEXT, p_remarks TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = procurements, public AS $$
  INSERT INTO sms_notifications (user_id, kind, ref_id, title, body, link_path)
  SELECT a.requested_by, 'grade_adjustment_decision', a.id, p_title,
         procurements.grade_adjustment_label(a.id)
           || COALESCE(E'\n' || NULLIF(btrim(p_remarks), ''), ''),
         '/teacher/class-record'
  FROM sms_grade_adjustments a WHERE a.id = p_id AND a.requested_by IS NOT NULL;
$$;

-- ---------------------------------------------------------------- workflow --
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_request(
  p_student_id BIGINT, p_subject_id BIGINT, p_section_id BIGINT,
  p_semester SMALLINT, p_points INTEGER, p_reason TEXT, p_note TEXT DEFAULT NULL)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_me BIGINT; v_type TEXT; v_school BIGINT; v_sy TEXT; v_base SMALLINT; v_id BIGINT;
BEGIN
  SELECT u.id, u.type INTO v_me, v_type FROM sms_users u
   WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1;
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not signed in.'; END IF;

  SELECT s.school_id, s.school_year::TEXT INTO v_school, v_sy
    FROM sms_sections s WHERE s.id = p_section_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Section not found.'; END IF;

  IF v_type IN ('region_account', 'sbfp_viewer') OR NOT (
       v_type = 'super admin' OR EXISTS (
         SELECT 1 FROM sms_subject_schedules ss
         WHERE ss.section_id = p_section_id AND ss.subject_id = p_subject_id
           AND ss.school_year = v_sy AND ss.teacher_id = v_me)) THEN
    RAISE EXCEPTION 'Only the subject''s teacher in this section may request additional points.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sms_enrollments e
    WHERE e.student_id = p_student_id AND e.section_id = p_section_id
      AND e.status = 'approved') THEN
    RAISE EXCEPTION 'The learner is not enrolled in this section.';
  END IF;
  IF p_points IS NULL OR p_points NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Points must be a whole number from 1 to 10.';
  END IF;
  IF p_reason = 'other' AND NULLIF(btrim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'Describe the reason.';
  END IF;

  v_base := grade_adjustment_base_final(p_student_id, p_subject_id, p_section_id, p_semester);
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'The final grade is not complete yet.';
  END IF;
  IF v_base + p_points > 100 THEN
    RAISE EXCEPTION 'The final grade cannot go above 100.';
  END IF;

  BEGIN
    INSERT INTO sms_grade_adjustments (school_id, student_id, subject_id, section_id,
      school_year, semester, points, reason, note, base_final, requested_by)
    VALUES (v_school, p_student_id, p_subject_id, p_section_id, v_sy, p_semester,
      p_points, p_reason, NULLIF(btrim(p_note), ''), v_base, v_me)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This learner already has pending or approved points for this final grade.';
  END;
  PERFORM grade_adjustment_notify_approvers(v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION procurements.grade_adjustment_withdraw(p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  UPDATE sms_grade_adjustments SET status = 'withdrawn'
   WHERE id = p_id AND status = 'pending'
     AND requested_by = announcement_me_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only your own pending request can be withdrawn.';
  END IF;
  PERFORM grade_adjustment_clear_requests(p_id);
END $$;

CREATE OR REPLACE FUNCTION procurements.grade_adjustment_decide(
  p_id BIGINT, p_approve BOOLEAN, p_remarks TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE a sms_grade_adjustments; v_final SMALLINT;
BEGIN
  SELECT * INTO a FROM sms_grade_adjustments WHERE id = p_id FOR UPDATE;
  IF a.id IS NULL OR NOT grade_adjustment_can_decide(a.subject_id, a.school_id) THEN
    RAISE EXCEPTION 'Only the subject''s Department Head or the School Head may decide this request.';
  END IF;
  IF a.requested_by = announcement_me_id() THEN
    RAISE EXCEPTION 'You cannot decide your own request.';
  END IF;
  IF a.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is no longer pending.';
  END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'Approve or reject.'; END IF;
  IF p_approve THEN
    v_final := grade_adjustment_base_final(a.student_id, a.subject_id, a.section_id, a.semester);
    IF v_final IS NULL THEN
      RAISE EXCEPTION 'The final grade is no longer complete.';
    END IF;
    IF v_final + a.points > 100 THEN
      RAISE EXCEPTION 'The final grade cannot go above 100.';
    END IF;
  ELSIF NULLIF(btrim(p_remarks), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for rejecting.';
  END IF;

  UPDATE sms_grade_adjustments
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = announcement_me_id(), decided_at = now(),
         decision_remarks = NULLIF(btrim(p_remarks), '')
   WHERE id = p_id;
  PERFORM grade_adjustment_clear_requests(p_id);
  PERFORM grade_adjustment_notify_teacher(p_id,
    CASE WHEN p_approve THEN 'Additional points approved'
         ELSE 'Additional points rejected' END, p_remarks);
END $$;

CREATE OR REPLACE FUNCTION procurements.grade_adjustment_revoke(
  p_id BIGINT, p_remarks TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE a sms_grade_adjustments;
BEGIN
  SELECT * INTO a FROM sms_grade_adjustments WHERE id = p_id FOR UPDATE;
  IF a.id IS NULL OR NOT grade_adjustment_can_decide(a.subject_id, a.school_id) THEN
    RAISE EXCEPTION 'Only the subject''s Department Head or the School Head may revoke this.';
  END IF;
  IF a.requested_by = announcement_me_id() THEN
    RAISE EXCEPTION 'You cannot decide your own request.';
  END IF;
  IF a.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved points can be revoked.';
  END IF;
  IF NULLIF(btrim(p_remarks), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for revoking.';
  END IF;
  UPDATE sms_grade_adjustments
     SET status = 'revoked', revoked_by = announcement_me_id(),
         revoked_at = now(), revoke_remarks = btrim(p_remarks)
   WHERE id = p_id;
  PERFORM grade_adjustment_notify_teacher(p_id, 'Additional points revoked', p_remarks);
END $$;

-- The approval page: what the caller may decide at their active school
-- (super admin: the school passed), pending first.
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_list(
  p_school_id BIGINT, p_pending BOOLEAN, p_limit INTEGER DEFAULT 300)
RETURNS TABLE (
  id BIGINT, student_name TEXT, subject_name TEXT, section_name TEXT,
  grade_level INTEGER, school_year TEXT, semester SMALLINT, points SMALLINT,
  reason TEXT, note TEXT, base_final SMALLINT, current_final SMALLINT,
  status TEXT, requested_by BIGINT, requester_name TEXT, requested_at TIMESTAMPTZ,
  decider_name TEXT, decided_at TIMESTAMPTZ, decision_remarks TEXT,
  revoker_name TEXT, revoked_at TIMESTAMPTZ, revoke_remarks TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT a.id, concat_ws(', ', st.last_name, st.first_name)::TEXT, sub.name::TEXT,
         sec.name::TEXT, sec.grade_level::INTEGER, a.school_year, a.semester, a.points,
         a.reason, a.note, a.base_final,
         grade_adjustment_base_final(a.student_id, a.subject_id, a.section_id, a.semester),
         a.status, a.requested_by, rq.name::TEXT, a.requested_at,
         dc.name::TEXT, a.decided_at, a.decision_remarks,
         rv.name::TEXT, a.revoked_at, a.revoke_remarks
  FROM sms_grade_adjustments a
  JOIN sms_students st ON st.id = a.student_id
  JOIN sms_subjects sub ON sub.id = a.subject_id
  JOIN sms_sections sec ON sec.id = a.section_id
  LEFT JOIN sms_users rq ON rq.id = a.requested_by
  LEFT JOIN sms_users dc ON dc.id = a.decided_by
  LEFT JOIN sms_users rv ON rv.id = a.revoked_by
  WHERE a.school_id = p_school_id
    AND (a.status = 'pending') = p_pending
    AND grade_adjustment_can_decide(a.subject_id, a.school_id)
  ORDER BY COALESCE(a.revoked_at, a.decided_at, a.requested_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
$$;

-- The menu badge.
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_pending_count(p_school_id BIGINT)
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT count(*) FROM sms_grade_adjustments a
  WHERE a.school_id = p_school_id AND a.status = 'pending'
    AND a.requested_by IS DISTINCT FROM announcement_me_id()
    AND grade_adjustment_can_decide(a.subject_id, a.school_id);
$$;

-- ------------------------------------------------------------------ grants --
REVOKE ALL ON FUNCTION procurements.grade_adjustment_base_final(BIGINT, BIGINT, BIGINT, SMALLINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_label(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_notify_approvers(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_clear_requests(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_notify_teacher(BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION procurements.grade_adjustment_can_decide(BIGINT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.notifications_mark_read(BIGINT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_request(BIGINT, BIGINT, BIGINT, SMALLINT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_withdraw(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_decide(BIGINT, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_revoke(BIGINT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_list(BIGINT, BOOLEAN, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_pending_count(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.grade_adjustment_can_decide(BIGINT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.notifications_mark_read(BIGINT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.grade_adjustment_request(BIGINT, BIGINT, BIGINT, SMALLINT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.grade_adjustment_withdraw(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.grade_adjustment_decide(BIGINT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.grade_adjustment_revoke(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.grade_adjustment_list(BIGINT, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.grade_adjustment_pending_count(BIGINT) TO authenticated;

-- ---------------------------------------------------------- promotion GPA --
-- 235's body; the only change is + COALESCE(adj.points, 0) on each grade.
CREATE OR REPLACE FUNCTION procurements.students_gpa_for_grade(
  p_student_ids BIGINT[],
  p_grade_level INTEGER,
  p_school_year TEXT DEFAULT NULL,
  p_school_id   BIGINT DEFAULT NULL
)
RETURNS TABLE (student_id BIGINT, gpa NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT ids.sid, avg_row.value
  FROM unnest(COALESCE(p_student_ids, ARRAY[]::BIGINT[])) AS ids(sid)
  LEFT JOIN LATERAL (
    SELECT e.section_id, e.school_year, e.school_id
    FROM procurements.sms_enrollments e
    WHERE e.student_id = ids.sid
      AND e.grade_level = p_grade_level
      AND e.status = 'approved'
      AND (p_school_year IS NULL OR e.school_year = p_school_year)
      AND (p_school_id IS NULL OR e.school_id = p_school_id)
    ORDER BY e.school_year DESC, e.created_at DESC
    LIMIT 1
  ) src ON TRUE
  -- Only a section that actually uses offerings gets the per-subject rule, so
  -- no learner's GPA moves until their section sets one (anti-goal: no row =
  -- byte-identical).
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM procurements.sms_section_subject_terms o
      WHERE o.section_id = src.section_id AND o.school_year = src.school_year
    ) AS yes
  ) src_has_offering ON TRUE
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(collapsed.grade)::numeric, 2) AS value
    FROM (
      -- K-10 (234): one value per (period, bucket) across the year's sections.
      SELECT AVG(picked.grade) AS grade
      FROM (
        SELECT DISTINCT ON (g.subject_id, g.grading_period)
               g.subject_id, g.grading_period,
               g.grade + COALESCE(adj.points, 0) AS grade, s.mapeh_component
        FROM procurements.sms_grades g
        JOIN procurements.sms_subjects s ON s.id = g.subject_id
        JOIN procurements.sms_sections sec ON sec.id = g.section_id
        LEFT JOIN procurements.sms_grade_adjustments adj
          ON adj.student_id = g.student_id
         AND adj.subject_id = g.subject_id
         AND adj.school_year = g.school_year
         AND adj.status = 'approved'
         AND (adj.semester = 0
              OR adj.semester = CASE WHEN g.grading_period <= 2 THEN 1 ELSE 2 END)
        WHERE (p_grade_level < 11 OR NOT src_has_offering.yes)
          AND g.student_id  = ids.sid
          AND g.school_year = src.school_year
          AND COALESCE(s.is_madrasah, false) = false
          AND g.grade > 0
          AND (
            g.section_id = src.section_id
            OR (
              p_grade_level < 11
              AND sec.school_id::BIGINT    = src.school_id
              AND sec.school_year::TEXT    = src.school_year
              AND sec.grade_level::INTEGER = p_grade_level
            )
          )
        ORDER BY g.subject_id, g.grading_period,
                 (g.section_id = src.section_id) DESC, g.section_id ASC
      ) picked
      GROUP BY
        picked.grading_period,
        CASE WHEN picked.mapeh_component IS NOT NULL
             THEN 'mapeh'
             ELSE 'subj:' || picked.subject_id::text END

      UNION ALL

      -- Grades 11-12 (235): one value per bucket, its periods averaged first.
      SELECT AVG(per_period.grade) AS grade
      FROM (
        SELECT AVG(g.grade + COALESCE(adj.points, 0)) AS grade,
               CASE WHEN s.mapeh_component IS NOT NULL
                    THEN 'mapeh'
                    ELSE 'subj:' || s.id::text END AS bucket
        FROM procurements.sms_grades g
        JOIN procurements.sms_subjects s ON s.id = g.subject_id
        LEFT JOIN procurements.sms_section_subject_terms o
          ON o.section_id = src.section_id
         AND o.subject_id = g.subject_id
         AND o.school_year = src.school_year
        LEFT JOIN procurements.sms_grade_adjustments adj
          ON adj.student_id = g.student_id
         AND adj.subject_id = g.subject_id
         AND adj.school_year = g.school_year
         AND adj.status = 'approved'
         AND (adj.semester = 0
              OR adj.semester = CASE WHEN g.grading_period <= 2 THEN 1 ELSE 2 END)
        WHERE p_grade_level >= 11
          AND src_has_offering.yes
          AND g.student_id  = ids.sid
          AND g.section_id  = src.section_id
          AND g.school_year = src.school_year
          AND COALESCE(s.is_madrasah, false) = false
          AND g.grade > 0
          AND (o.terms IS NULL OR g.grading_period::SMALLINT = ANY (o.terms))
        GROUP BY g.grading_period,
                 CASE WHEN s.mapeh_component IS NOT NULL
                      THEN 'mapeh'
                      ELSE 'subj:' || s.id::text END
      ) per_period
      GROUP BY per_period.bucket
    ) collapsed
  ) avg_row ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;
