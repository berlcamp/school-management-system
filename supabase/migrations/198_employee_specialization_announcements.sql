-- ============================================================================
-- 198. Employee specialization + division announcements
-- ============================================================================
--
-- WHY
-- ---
-- (a) The division needs every employee's academic and work specialization,
--     answered by the employee on /profile rather than typed by a school admin.
--     Part 3 ("specialization at DepEd") is 146's `learning_area`, so its 205
--     existing answers and the Teaching Specialization report carry over.
--     Parts 1-2 are two new nullable TEXT columns, app-validated against
--     lib/constants/employeeMajors.ts per the 119/132 precedent: a value is a
--     list code or 'other:<typed text>'.
-- (b) The notification bell read `public.adm_notifications`, which no migration
--     creates and which is absent from the schema — it has always shown 0. This
--     adds division announcements as the bell's source.
--
-- DESIGN
-- ------
-- No fan-out: posting writes one row, not one per employee. Unread = targeted
-- announcements minus the caller's read rows, so staff added later still see
-- live announcements. Targeting is ONE predicate, `announcement_targets`, used
-- by RLS, by the inbox RPCs and by the read-count stats, so the three cannot
-- disagree. It reads the caller's ACTIVE type and school (134/163 —
-- invariants 12-13), never "any assigned role".
-- Authors: division_admin, division_type, super admin. Announcements are
-- archived, never deleted (no DELETE policy).
--
-- WHAT IS NOT CHANGED
-- -------------------
-- No existing table, policy, trigger or function is touched; no row modified.
-- Two nullable columns on sms_users; two new tables; new functions only.
-- ============================================================================

ALTER TABLE procurements.sms_users ADD COLUMN IF NOT EXISTS undergrad_major TEXT;
ALTER TABLE procurements.sms_users ADD COLUMN IF NOT EXISTS graduate_major TEXT;

CREATE TABLE IF NOT EXISTS procurements.sms_announcements (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  body        TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  audience    TEXT NOT NULL DEFAULT 'all'
              CHECK (audience IN ('all', 'teachers', 'school_heads')),
  school_id   BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  link_path   TEXT CHECK (link_path IS NULL
                          OR (link_path LIKE '/%' AND link_path NOT LIKE '//%')),
  created_by  BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sms_announcements_live_idx
  ON procurements.sms_announcements (created_at DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS procurements.sms_announcement_reads (
  announcement_id BIGINT NOT NULL
    REFERENCES procurements.sms_announcements(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL
    REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS sms_announcement_reads_user_idx
  ON procurements.sms_announcement_reads (user_id);

-- ---------------------------------------------------------------- helpers --

-- The one targeting rule. Pure, so RLS, inbox and stats share it exactly.
CREATE OR REPLACE FUNCTION procurements.announcement_targets(
  p_audience TEXT, p_school_id BIGINT, p_user_type TEXT, p_user_school BIGINT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_school_id IS NULL OR p_school_id = p_user_school)
     AND CASE p_audience
           WHEN 'all'          THEN true
           WHEN 'teachers'     THEN p_user_type IN ('teacher', 'volunteer_teacher')
           WHEN 'school_heads' THEN p_user_type IN ('school_head', 'assistant_school_head')
           ELSE false
         END;
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_me_id()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT u.id FROM procurements.sms_users u
  WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_is_author()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE((
    SELECT u.type IN ('division_admin', 'division_type', 'super admin')
    FROM procurements.sms_users u
    WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1), false);
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_targets_me(
  p_audience TEXT, p_school_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE((
    SELECT procurements.announcement_targets(p_audience, p_school_id, u.type, u.school_id)
    FROM procurements.sms_users u
    WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1), false);
$$;

-- created_by / created_at come from the caller, never the payload.
CREATE OR REPLACE FUNCTION procurements.announcement_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(procurements.announcement_me_id(), NEW.created_by);
    NEW.created_at := now();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sms_announcements_stamp ON procurements.sms_announcements;
CREATE TRIGGER sms_announcements_stamp
  BEFORE INSERT OR UPDATE ON procurements.sms_announcements
  FOR EACH ROW EXECUTE FUNCTION procurements.announcement_stamp();

-- -------------------------------------------------------------------- RLS --
ALTER TABLE procurements.sms_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_announcement_reads ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON procurements.sms_announcements TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_announcements_id_seq TO authenticated;
GRANT SELECT, INSERT ON procurements.sms_announcement_reads TO authenticated;

DROP POLICY IF EXISTS "sms_announcements: select" ON procurements.sms_announcements;
CREATE POLICY "sms_announcements: select" ON procurements.sms_announcements
  FOR SELECT TO authenticated
  USING (procurements.announcement_is_author()
         OR (archived_at IS NULL
             AND procurements.announcement_targets_me(audience, school_id)));

DROP POLICY IF EXISTS "sms_announcements: insert" ON procurements.sms_announcements;
CREATE POLICY "sms_announcements: insert" ON procurements.sms_announcements
  FOR INSERT TO authenticated
  WITH CHECK (procurements.announcement_is_author());

DROP POLICY IF EXISTS "sms_announcements: update" ON procurements.sms_announcements;
CREATE POLICY "sms_announcements: update" ON procurements.sms_announcements
  FOR UPDATE TO authenticated
  USING (procurements.announcement_is_author())
  WITH CHECK (procurements.announcement_is_author());

DROP POLICY IF EXISTS "sms_announcement_reads: select" ON procurements.sms_announcement_reads;
CREATE POLICY "sms_announcement_reads: select" ON procurements.sms_announcement_reads
  FOR SELECT TO authenticated
  USING (user_id = procurements.announcement_me_id()
         OR procurements.announcement_is_author());

DROP POLICY IF EXISTS "sms_announcement_reads: insert" ON procurements.sms_announcement_reads;
CREATE POLICY "sms_announcement_reads: insert" ON procurements.sms_announcement_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = procurements.announcement_me_id()
    AND EXISTS (
      SELECT 1 FROM procurements.sms_announcements a
      WHERE a.id = announcement_id
        AND a.archived_at IS NULL
        AND procurements.announcement_targets_me(a.audience, a.school_id)));

-- ------------------------------------------------------------------ inbox --
-- SECURITY INVOKER: RLS applies, and the explicit targeting filter keeps an
-- author's bell to what is addressed to them rather than everything they manage.
CREATE OR REPLACE FUNCTION procurements.announcement_inbox(p_limit INT DEFAULT 20)
RETURNS TABLE (id BIGINT, title TEXT, body TEXT, link_path TEXT,
               created_at TIMESTAMPTZ, is_read BOOLEAN)
LANGUAGE sql STABLE SET search_path = procurements, public AS $$
  SELECT a.id, a.title, a.body, a.link_path, a.created_at,
         EXISTS (SELECT 1 FROM procurements.sms_announcement_reads r
                 WHERE r.announcement_id = a.id
                   AND r.user_id = procurements.announcement_me_id())
  FROM procurements.sms_announcements a
  WHERE a.archived_at IS NULL
    AND procurements.announcement_targets_me(a.audience, a.school_id)
  ORDER BY a.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_unread_count()
RETURNS BIGINT LANGUAGE sql STABLE SET search_path = procurements, public AS $$
  SELECT count(*) FROM procurements.sms_announcements a
  WHERE a.archived_at IS NULL
    AND procurements.announcement_targets_me(a.audience, a.school_id)
    AND NOT EXISTS (SELECT 1 FROM procurements.sms_announcement_reads r
                    WHERE r.announcement_id = a.id
                      AND r.user_id = procurements.announcement_me_id());
$$;

-- ------------------------------------------------------------------ stats --
-- Unchecked body is internal (revoked below); the public wrapper guards it.
CREATE OR REPLACE FUNCTION procurements.announcement_read_stats_unchecked()
RETURNS TABLE (announcement_id BIGINT, read_count BIGINT, target_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = procurements, public AS $$
  SELECT a.id,
         (SELECT count(*) FROM procurements.sms_announcement_reads r
          WHERE r.announcement_id = a.id)::BIGINT,
         (SELECT count(*) FROM procurements.sms_users u
          WHERE u.is_active
            AND u.type NOT IN ('accounting', 'security_guard', 'utility_worker')
            AND procurements.announcement_targets(a.audience, a.school_id, u.type, u.school_id))::BIGINT
  FROM procurements.sms_announcements a;
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_read_stats()
RETURNS TABLE (announcement_id BIGINT, read_count BIGINT, target_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = procurements, public AS $$
BEGIN
  IF NOT procurements.announcement_is_author() THEN
    RAISE EXCEPTION 'Only the division office may view announcement statistics.'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM procurements.announcement_read_stats_unchecked();
END $$;

-- ------------------------------------------------------------- privileges --
REVOKE EXECUTE ON FUNCTION procurements.announcement_stamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION procurements.announcement_read_stats_unchecked() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION procurements.announcement_read_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION procurements.announcement_inbox(INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION procurements.announcement_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.announcement_read_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_inbox(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_targets(TEXT, BIGINT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_targets_me(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_me_id() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_is_author() TO authenticated;

NOTIFY pgrst, 'reload schema';
