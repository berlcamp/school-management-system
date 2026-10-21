-- =============================================================================
-- 218 — Help Desk, with a super admin on/off switch
-- =============================================================================
--
-- Concerns from signed-in users (teachers, school staff, division staff) and
-- from anyone through the public form at /contact, answered from one shared
-- inbox. Ported from PRIME-HRM's Help Desk (its 0046 + 0052) and adapted:
--
--   * Tables live in `procurements` with the `sms_` prefix; people are
--     `sms_users` rows (BIGINT id), resolved from `auth.uid()` through
--     `sms_users.user_id`, active only while `is_active` is not false.
--   * **Who answers** ("helpdesk staff"): an active `super admin` or
--     `division_admin` — `type` is the ACTIVE role (invariant 12) — plus anyone
--     a super admin puts on `sms_helpdesk_staff`. Every staff member sees every
--     ticket, replies, changes status and assigns; categories only filter.
--   * **No email and no per-user notification rows**: this system sends no
--     mail and its bell reads announcements (198), which are never fanned out.
--     A public submitter keeps the reference code shown after sending and
--     follows up at /contact/status with that code and their email. The app
--     shows counts in the sidebar instead of notifications.
--   * Attachments go to a NEW **private** bucket `helpdesk`
--     (`{ticket_id}/{uuid}-{name}`), images and PDF, ≤ 5 MB, ≤ 3 per message —
--     not `school-management`, which is public (078) and would make every
--     attached screenshot readable by URL.
--
-- **The switch.** `sms_helpdesk_settings` is one row, `is_enabled` DEFAULT
-- FALSE, so nothing appears on apply (the 153/160 rule); a super admin turns it
-- on at Division Office → Help Desk Settings. It is enforced here, not only in
-- the menu: while it is off, every write below except the settings functions
-- refuses ("The Help Desk is turned off."), including the public form. Reads
-- stay governed by RLS alone, so turning it off hides nothing from the
-- database's point of view and loses no data; turning it on again resumes.
-- The row is readable by `anon` (it is one boolean) so the public form can say
-- it is closed instead of failing on submit.
--
-- Reads go through RLS; every write goes through the SECURITY DEFINER
-- functions, so a ticket, its messages and its status always change together.
-- The public functions are granted to `service_role` only and called from the
-- server actions in `lib/helpdesk/publicActions.ts`, which do the honeypot and
-- timing checks and hash the caller's IP.
--
-- Nothing existing is touched: new tables, functions, one bucket and four new
-- storage policies scoped to that bucket. The only DML is the settings row.
-- Tests: supabase/tests/218_helpdesk.sql (one transaction, rolled back).
-- =============================================================================

-- 1. Tables -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS procurements.sms_helpdesk_settings (
  id         BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO procurements.sms_helpdesk_settings (id) VALUES (TRUE)
  ON CONFLICT (id) DO NOTHING;

-- People a super admin adds to the inbox beyond super admins and division admins.
CREATE TABLE IF NOT EXISTS procurements.sms_helpdesk_staff (
  user_id  BIGINT PRIMARY KEY REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  added_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurements.sms_helpdesk_tickets (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference_code    TEXT NOT NULL UNIQUE,
  subject           TEXT NOT NULL CHECK (char_length(subject) BETWEEN 5 AND 150),
  category          TEXT NOT NULL CHECK (category IN (
    'account_login', 'enrollment', 'grades', 'learner_records', 'reports',
    'bug', 'suggestion', 'other')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_progress', 'awaiting_reply', 'resolved', 'closed')),
  source            TEXT NOT NULL CHECK (source IN ('app', 'public')),
  submitter_user_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  submitter_name    TEXT NOT NULL,
  submitter_email   TEXT NOT NULL,
  -- App tickets: the role and school the person was acting in when they filed it.
  submitter_type    TEXT,
  school_id         BIGINT REFERENCES procurements.sms_schools(id) ON DELETE SET NULL,
  -- Public tickets: optional contact number and free-text school / office.
  submitter_contact TEXT,
  school_office     TEXT,
  assigned_to       BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_by   TEXT NOT NULL DEFAULT 'submitter'
    CHECK (last_message_by IN ('submitter', 'staff')),
  resolved_at       TIMESTAMPTZ,
  -- The inbox sorts on this; PostgREST cannot order by an expression.
  needs_attention   BOOLEAN GENERATED ALWAYS AS (
    last_message_by = 'submitter' AND status NOT IN ('resolved', 'closed')
  ) STORED
);

CREATE INDEX IF NOT EXISTS sms_helpdesk_tickets_inbox_idx
  ON procurements.sms_helpdesk_tickets (needs_attention DESC, last_message_at DESC);
CREATE INDEX IF NOT EXISTS sms_helpdesk_tickets_submitter_idx
  ON procurements.sms_helpdesk_tickets (submitter_user_id);
CREATE INDEX IF NOT EXISTS sms_helpdesk_tickets_assigned_idx
  ON procurements.sms_helpdesk_tickets (assigned_to);

CREATE TABLE IF NOT EXISTS procurements.sms_helpdesk_messages (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id      BIGINT NOT NULL REFERENCES procurements.sms_helpdesk_tickets(id) ON DELETE CASCADE,
  author_user_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  author_kind    TEXT NOT NULL CHECK (author_kind IN ('submitter', 'staff')),
  body           TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  is_internal    BOOLEAN NOT NULL DEFAULT FALSE,
  attachments    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_helpdesk_messages_ticket_idx
  ON procurements.sms_helpdesk_messages (ticket_id, created_at);

-- Rate-limit log for the public form. Never read by clients.
CREATE TABLE IF NOT EXISTS procurements.sms_helpdesk_public_hits (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('create', 'lookup', 'reply')),
  email      TEXT,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_helpdesk_public_hits_idx
  ON procurements.sms_helpdesk_public_hits (kind, ip_hash, created_at);

-- 2. Helpers ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.helpdesk_enabled()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT COALESCE((SELECT is_enabled FROM sms_helpdesk_settings WHERE id), FALSE);
$$;

-- Raises when the switch is off. Called first by every write except the settings.
CREATE OR REPLACE FUNCTION procurements.helpdesk_assert_enabled()
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  IF NOT helpdesk_enabled() THEN
    RAISE EXCEPTION 'The Help Desk is turned off.' USING ERRCODE = 'HD001';
  END IF;
END;
$$;

-- The caller's active sms_users row, or NULL (no session, deactivated, deleted).
CREATE OR REPLACE FUNCTION procurements.helpdesk_caller()
RETURNS procurements.sms_users
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT u.* FROM sms_users u
   WHERE u.user_id = auth.uid()
     AND u.is_active IS NOT FALSE
     AND u.deleted_at IS NULL
   LIMIT 1;
$$;

-- Just the id, for RLS (which runs as the caller, who may not call helpdesk_caller).
CREATE OR REPLACE FUNCTION procurements.helpdesk_caller_id()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT (helpdesk_caller()).id;
$$;

-- Who answers concerns. The role list mirrors HELPDESK_STAFF_TYPES in
-- lib/constants/helpdesk.ts — keep the two in sync.
CREATE OR REPLACE FUNCTION procurements.helpdesk_staff_ids()
RETURNS SETOF BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT u.id
    FROM sms_users u
   WHERE u.is_active IS NOT FALSE
     AND u.deleted_at IS NULL
     AND u.user_id IS NOT NULL
     AND (u.type IN ('super admin', 'division_admin')
          OR EXISTS (SELECT 1 FROM sms_helpdesk_staff s WHERE s.user_id = u.id));
$$;

-- Same rule for the caller only (RLS calls this per row, so it must not scan
-- every user).
CREATE OR REPLACE FUNCTION procurements.sms_is_helpdesk_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM sms_users u
     WHERE u.user_id = auth.uid()
       AND u.is_active IS NOT FALSE
       AND u.deleted_at IS NULL
       AND (u.type IN ('super admin', 'division_admin')
            OR EXISTS (SELECT 1 FROM sms_helpdesk_staff s WHERE s.user_id = u.id))
  );
$$;

CREATE OR REPLACE FUNCTION procurements.helpdesk_new_code()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code TEXT;
BEGIN
  LOOP
    SELECT 'HD-' || string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      INTO v_code
      FROM generate_series(1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM sms_helpdesk_tickets WHERE reference_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- Raises HD001 with the message the form shows next to the field. The category
-- list mirrors HELPDESK_CATEGORIES in lib/constants/helpdesk.ts.
CREATE OR REPLACE FUNCTION procurements.helpdesk_check_text(p_subject TEXT, p_category TEXT, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  IF char_length(trim(COALESCE(p_subject, ''))) NOT BETWEEN 5 AND 150 THEN
    RAISE EXCEPTION 'Subject must be 5 to 150 characters.' USING ERRCODE = 'HD001';
  END IF;
  IF COALESCE(p_category, '') NOT IN ('account_login', 'enrollment', 'grades',
      'learner_records', 'reports', 'bug', 'suggestion', 'other') THEN
    RAISE EXCEPTION 'Choose a category.' USING ERRCODE = 'HD001';
  END IF;
  IF char_length(trim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Message must be 1 to 5000 characters.' USING ERRCODE = 'HD001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION procurements.helpdesk_assert_enabled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_caller() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_staff_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_new_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_check_text(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_caller_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_caller_id() TO authenticated;
REVOKE ALL ON FUNCTION procurements.sms_is_helpdesk_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sms_is_helpdesk_staff() TO authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_enabled() TO anon, authenticated, service_role;

-- 3. RLS --------------------------------------------------------------------

ALTER TABLE procurements.sms_helpdesk_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_helpdesk_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_helpdesk_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_helpdesk_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_helpdesk_public_hits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "helpdesk settings select" ON procurements.sms_helpdesk_settings;
CREATE POLICY "helpdesk settings select" ON procurements.sms_helpdesk_settings
  FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "helpdesk staff select" ON procurements.sms_helpdesk_staff;
CREATE POLICY "helpdesk staff select" ON procurements.sms_helpdesk_staff
  FOR SELECT TO authenticated
  USING (procurements.sms_is_helpdesk_staff());

DROP POLICY IF EXISTS "helpdesk tickets select" ON procurements.sms_helpdesk_tickets;
CREATE POLICY "helpdesk tickets select" ON procurements.sms_helpdesk_tickets
  FOR SELECT TO authenticated
  USING (
    procurements.sms_is_helpdesk_staff()
    OR submitter_user_id = (SELECT procurements.helpdesk_caller_id())
  );

DROP POLICY IF EXISTS "helpdesk messages select" ON procurements.sms_helpdesk_messages;
CREATE POLICY "helpdesk messages select" ON procurements.sms_helpdesk_messages
  FOR SELECT TO authenticated
  USING (
    procurements.sms_is_helpdesk_staff()
    OR (NOT is_internal AND EXISTS (
      SELECT 1 FROM procurements.sms_helpdesk_tickets t
       WHERE t.id = ticket_id
         AND t.submitter_user_id = (SELECT procurements.helpdesk_caller_id())
    ))
  );

-- Every write goes through the functions below; no client role writes directly.
REVOKE ALL ON procurements.sms_helpdesk_settings, procurements.sms_helpdesk_staff,
  procurements.sms_helpdesk_tickets, procurements.sms_helpdesk_messages,
  procurements.sms_helpdesk_public_hits FROM anon, authenticated, PUBLIC;
GRANT SELECT ON procurements.sms_helpdesk_settings TO anon, authenticated;
GRANT SELECT ON procurements.sms_helpdesk_staff, procurements.sms_helpdesk_tickets,
  procurements.sms_helpdesk_messages TO authenticated;
GRANT ALL ON procurements.sms_helpdesk_settings, procurements.sms_helpdesk_staff,
  procurements.sms_helpdesk_tickets, procurements.sms_helpdesk_messages,
  procurements.sms_helpdesk_public_hits TO service_role;

-- 4. Attachments: private bucket `helpdesk`, folder {ticket_id}/ ------------

-- Storage limits are the first line; helpdesk_attach_to_message re-checks
-- what storage actually holds before recording a file on a message.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('helpdesk', 'helpdesk', FALSE, 5242880, ARRAY[
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'image/heic', 'image/heif', 'application/pdf'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Reading and adding a file: helpdesk staff, or the submitter of that ticket.
CREATE OR REPLACE FUNCTION procurements.helpdesk_storage_allowed(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_id TEXT := split_part(p_name, '/', 1);
BEGIN
  IF v_id !~ '^[0-9]{1,18}$' THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM sms_helpdesk_tickets t
     WHERE t.id = v_id::BIGINT
       AND (sms_is_helpdesk_staff()
            OR t.submitter_user_id = helpdesk_caller_id())
  );
END;
$$;

-- Overwriting or deleting: staff only. A submitter may read and add files in
-- their ticket's folder but not replace or remove them.
CREATE OR REPLACE FUNCTION procurements.helpdesk_storage_writable(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_id TEXT := split_part(p_name, '/', 1);
BEGIN
  IF v_id !~ '^[0-9]{1,18}$' THEN
    RETURN FALSE;
  END IF;
  RETURN sms_is_helpdesk_staff()
     AND EXISTS (SELECT 1 FROM sms_helpdesk_tickets t WHERE t.id = v_id::BIGINT);
END;
$$;

REVOKE ALL ON FUNCTION procurements.helpdesk_storage_allowed(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.helpdesk_storage_writable(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_storage_allowed(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_storage_writable(TEXT) TO authenticated;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "helpdesk files select" ON storage.objects;
    DROP POLICY IF EXISTS "helpdesk files insert" ON storage.objects;
    DROP POLICY IF EXISTS "helpdesk files update" ON storage.objects;
    DROP POLICY IF EXISTS "helpdesk files delete" ON storage.objects;
    CREATE POLICY "helpdesk files select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'helpdesk' AND procurements.helpdesk_storage_allowed(name));
    -- An image or PDF extension too, so storage never serves, say, an .html
    -- file out of a ticket folder.
    CREATE POLICY "helpdesk files insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'helpdesk'
                  AND lower(name) ~ '\.(jpe?g|png|gif|webp|heic|heif|pdf)$'
                  AND procurements.helpdesk_storage_allowed(name));
    CREATE POLICY "helpdesk files update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'helpdesk' AND procurements.helpdesk_storage_writable(name))
      WITH CHECK (bucket_id = 'helpdesk' AND procurements.helpdesk_storage_writable(name));
    CREATE POLICY "helpdesk files delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'helpdesk' AND procurements.helpdesk_storage_writable(name));
  END IF;
END $$;

-- 5. Signed-in functions ----------------------------------------------------

-- A submitter's reply, shared by the app and the public form. Reopens a
-- resolved or awaiting-reply ticket.
CREATE OR REPLACE FUNCTION procurements.helpdesk_record_submitter_reply(
  p_ticket_id BIGINT, p_author BIGINT, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  t sms_helpdesk_tickets%ROWTYPE;
  v_status TEXT;
  v_message BIGINT;
BEGIN
  SELECT * INTO t FROM sms_helpdesk_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concern not found.' USING ERRCODE = 'HD001';
  END IF;
  IF t.status = 'closed' THEN
    RAISE EXCEPTION 'This concern was closed.' USING ERRCODE = 'HD001';
  END IF;
  IF char_length(trim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Message must be 1 to 5000 characters.' USING ERRCODE = 'HD001';
  END IF;

  INSERT INTO sms_helpdesk_messages (ticket_id, author_user_id, author_kind, body)
  VALUES (t.id, p_author, 'submitter', trim(p_body))
  RETURNING id INTO v_message;

  v_status := CASE WHEN t.status IN ('resolved', 'awaiting_reply') THEN 'open' ELSE t.status END;
  UPDATE sms_helpdesk_tickets
     SET status = v_status,
         resolved_at = NULL,
         last_message_at = now(),
         last_message_by = 'submitter'
   WHERE id = t.id;

  RETURN jsonb_build_object('message_id', v_message, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.helpdesk_create_ticket(
  p_subject TEXT, p_category TEXT, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_me sms_users;
  v_code TEXT;
  v_ticket BIGINT;
  v_message BIGINT;
BEGIN
  v_me := helpdesk_caller();
  IF v_me.id IS NULL THEN
    RAISE EXCEPTION 'Sign in required.' USING ERRCODE = '42501';
  END IF;
  PERFORM helpdesk_assert_enabled();
  PERFORM helpdesk_check_text(p_subject, p_category, p_body);

  v_code := helpdesk_new_code();
  INSERT INTO sms_helpdesk_tickets (
    reference_code, subject, category, source, submitter_user_id,
    submitter_name, submitter_email, submitter_type, school_id)
  VALUES (
    v_code, trim(p_subject), p_category, 'app', v_me.id,
    v_me.name, lower(trim(COALESCE(v_me.email, ''))), v_me.type, v_me.school_id)
  RETURNING id INTO v_ticket;

  INSERT INTO sms_helpdesk_messages (ticket_id, author_user_id, author_kind, body)
  VALUES (v_ticket, v_me.id, 'submitter', trim(p_body))
  RETURNING id INTO v_message;

  RETURN jsonb_build_object('id', v_ticket, 'reference_code', v_code, 'message_id', v_message);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.helpdesk_post_message(
  p_ticket_id BIGINT, p_body TEXT,
  p_is_internal BOOLEAN DEFAULT FALSE, p_set_status TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  t sms_helpdesk_tickets%ROWTYPE;
  v_me BIGINT := (helpdesk_caller()).id;
  v_status TEXT;
  v_message BIGINT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sign in required.' USING ERRCODE = '42501';
  END IF;
  PERFORM helpdesk_assert_enabled();
  SELECT * INTO t FROM sms_helpdesk_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concern not found.' USING ERRCODE = 'HD001';
  END IF;

  -- On their own ticket, a staff member is the submitter.
  IF t.submitter_user_id = v_me THEN
    IF COALESCE(p_is_internal, FALSE) THEN
      RAISE EXCEPTION 'Only staff can add internal notes.' USING ERRCODE = 'HD001';
    END IF;
    RETURN helpdesk_record_submitter_reply(t.id, v_me, p_body);
  END IF;

  IF NOT sms_is_helpdesk_staff() THEN
    RAISE EXCEPTION 'You don''t have access to this concern.' USING ERRCODE = 'HD001';
  END IF;
  IF t.status = 'closed' THEN
    RAISE EXCEPTION 'This concern was closed.' USING ERRCODE = 'HD001';
  END IF;
  IF char_length(trim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Message must be 1 to 5000 characters.' USING ERRCODE = 'HD001';
  END IF;

  IF COALESCE(p_is_internal, FALSE) THEN
    INSERT INTO sms_helpdesk_messages (ticket_id, author_user_id, author_kind, body, is_internal)
    VALUES (t.id, v_me, 'staff', trim(p_body), TRUE)
    RETURNING id INTO v_message;
    RETURN jsonb_build_object('message_id', v_message, 'status', t.status);
  END IF;

  v_status := COALESCE(p_set_status, 'awaiting_reply');
  IF v_status NOT IN ('in_progress', 'awaiting_reply', 'resolved') THEN
    RAISE EXCEPTION 'Choose In Progress, Awaiting Reply or Resolved.' USING ERRCODE = 'HD001';
  END IF;

  INSERT INTO sms_helpdesk_messages (ticket_id, author_user_id, author_kind, body)
  VALUES (t.id, v_me, 'staff', trim(p_body))
  RETURNING id INTO v_message;

  UPDATE sms_helpdesk_tickets
     SET status = v_status,
         resolved_at = CASE WHEN v_status = 'resolved' THEN COALESCE(t.resolved_at, now()) ELSE NULL END,
         last_message_at = now(),
         last_message_by = 'staff'
   WHERE id = t.id;

  RETURN jsonb_build_object('message_id', v_message, 'status', v_status);
END;
$$;

-- Records uploaded files on a message: only its author, within 10 minutes, and
-- only files storage actually holds in the ticket's folder as an image or PDF
-- of 1 byte to 5 MB. The size and type recorded are the stored ones.
CREATE OR REPLACE FUNCTION procurements.helpdesk_attach_to_message(p_message_id BIGINT, p_attachments JSONB)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  m sms_helpdesk_messages%ROWTYPE;
  v_me BIGINT := (helpdesk_caller()).id;
  v_prefix TEXT;
  v_types TEXT[] := ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp',
                          'image/heic', 'image/heif', 'application/pdf'];
  v_files JSONB;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sign in required.' USING ERRCODE = '42501';
  END IF;
  PERFORM helpdesk_assert_enabled();
  SELECT * INTO m FROM sms_helpdesk_messages WHERE id = p_message_id FOR UPDATE;
  IF NOT FOUND OR m.author_user_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'You can only attach files to your own message.' USING ERRCODE = 'HD001';
  END IF;
  IF m.is_internal THEN
    RAISE EXCEPTION 'Files can''t be attached to internal notes.' USING ERRCODE = 'HD001';
  END IF;
  IF m.created_at < now() - INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'Files can only be added within 10 minutes of sending.' USING ERRCODE = 'HD001';
  END IF;
  IF jsonb_typeof(p_attachments) IS DISTINCT FROM 'array'
     OR jsonb_array_length(m.attachments) + jsonb_array_length(p_attachments) > 3 THEN
    RAISE EXCEPTION 'Attach at most 3 files.' USING ERRCODE = 'HD001';
  END IF;

  v_prefix := m.ticket_id || '/';
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_attachments) e
     WHERE jsonb_typeof(e) IS DISTINCT FROM 'object'
        OR left(COALESCE(e->>'path', ''), length(v_prefix)) <> v_prefix
        OR position('..' IN COALESCE(e->>'path', '')) > 0
        OR length(e->>'path') = length(v_prefix)
        OR position('/' IN substr(e->>'path', length(v_prefix) + 1)) > 0
        OR COALESCE(btrim(e->>'name'), '') = ''
  ) OR (SELECT count(DISTINCT e->>'path') <> count(*) FROM jsonb_array_elements(p_attachments) e)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_attachments) n, jsonb_array_elements(m.attachments) o
       WHERE n->>'path' = o->>'path')
  THEN
    RAISE EXCEPTION 'One of the files is not allowed.' USING ERRCODE = 'HD001';
  END IF;

  -- What storage actually holds, one row per requested file (NULL when the
  -- object is missing or not acceptable).
  SELECT COALESCE(jsonb_agg(
           CASE WHEN o.name IS NOT NULL THEN jsonb_build_object(
             'path', e->>'path',
             'name', left(btrim(e->>'name'), 200),
             'size', (o.metadata->>'size')::BIGINT,
             'type', lower(o.metadata->>'mimetype'))
           END), '[]'::jsonb)
    INTO v_files
    FROM jsonb_array_elements(p_attachments) e
    LEFT JOIN storage.objects o
      ON o.bucket_id = 'helpdesk'
     AND o.name = e->>'path'
     AND COALESCE(o.metadata->>'size', '') ~ '^[0-9]{1,12}$'
     AND (o.metadata->>'size')::BIGINT BETWEEN 1 AND 5242880
     AND lower(COALESCE(o.metadata->>'mimetype', '')) = ANY(v_types);

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_files) f WHERE f = 'null'::jsonb) THEN
    RAISE EXCEPTION 'One of the files is not an image or PDF, or is larger than 5 MB.'
      USING ERRCODE = 'HD001';
  END IF;

  UPDATE sms_helpdesk_messages
     SET attachments = attachments || v_files
   WHERE id = m.id;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.helpdesk_update_ticket(
  p_ticket_id BIGINT, p_status TEXT DEFAULT NULL,
  p_assigned_to BIGINT DEFAULT NULL, p_unassign BOOLEAN DEFAULT FALSE)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  t sms_helpdesk_tickets%ROWTYPE;
BEGIN
  IF NOT sms_is_helpdesk_staff() THEN
    RAISE EXCEPTION 'You don''t have access to this concern.' USING ERRCODE = 'HD001';
  END IF;
  PERFORM helpdesk_assert_enabled();
  SELECT * INTO t FROM sms_helpdesk_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concern not found.' USING ERRCODE = 'HD001';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('open', 'in_progress', 'awaiting_reply', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Unknown status.' USING ERRCODE = 'HD001';
  END IF;
  IF p_assigned_to IS NOT NULL AND p_assigned_to NOT IN (SELECT helpdesk_staff_ids()) THEN
    RAISE EXCEPTION 'Concerns can only be assigned to Help Desk staff.' USING ERRCODE = 'HD001';
  END IF;

  UPDATE sms_helpdesk_tickets
     SET status = COALESCE(p_status, status),
         resolved_at = CASE
           WHEN p_status = 'resolved' AND t.status <> 'resolved' THEN now()
           WHEN p_status IS NOT NULL AND p_status <> 'resolved' THEN NULL
           ELSE resolved_at END,
         assigned_to = CASE WHEN COALESCE(p_unassign, FALSE) THEN NULL
                            ELSE COALESCE(p_assigned_to, assigned_to) END
   WHERE id = t.id;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.helpdesk_staff_list()
RETURNS TABLE (id BIGINT, name TEXT, type TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  IF NOT sms_is_helpdesk_staff() THEN
    RAISE EXCEPTION 'You don''t have access to the Help Desk.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.name::TEXT, u.type::TEXT
      FROM sms_users u
     WHERE u.id IN (SELECT helpdesk_staff_ids())
     ORDER BY u.name;
END;
$$;

-- 6. Settings (super admin only) --------------------------------------------

CREATE OR REPLACE FUNCTION procurements.helpdesk_assert_super_admin()
RETURNS BIGINT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_me sms_users := helpdesk_caller();
BEGIN
  IF v_me.id IS NULL OR v_me.type IS DISTINCT FROM 'super admin' THEN
    RAISE EXCEPTION 'Only a super admin can change the Help Desk settings.' USING ERRCODE = '42501';
  END IF;
  RETURN v_me.id;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.helpdesk_set_enabled(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_me BIGINT := helpdesk_assert_super_admin();
BEGIN
  INSERT INTO sms_helpdesk_settings (id, is_enabled, updated_by, updated_at)
  VALUES (TRUE, COALESCE(p_enabled, FALSE), v_me, now())
  ON CONFLICT (id) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
END;
$$;

-- Adds (p_on TRUE) or removes someone from the extra staff list. Only people
-- with a login may answer; the login-disabled personnel roles (135/158) cannot.
CREATE OR REPLACE FUNCTION procurements.helpdesk_set_staff(p_user_id BIGINT, p_on BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_me BIGINT := helpdesk_assert_super_admin();
BEGIN
  IF COALESCE(p_on, FALSE) THEN
    IF NOT EXISTS (
      SELECT 1 FROM sms_users u
       WHERE u.id = p_user_id
         AND u.is_active IS NOT FALSE
         AND u.deleted_at IS NULL
         AND u.type NOT IN ('accounting', 'security_guard', 'utility_worker')
    ) THEN
      RAISE EXCEPTION 'That person cannot be added to the Help Desk.' USING ERRCODE = 'HD001';
    END IF;
    INSERT INTO sms_helpdesk_staff (user_id, added_by) VALUES (p_user_id, v_me)
      ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM sms_helpdesk_staff WHERE user_id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION procurements.helpdesk_record_submitter_reply(BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_assert_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_create_ticket(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.helpdesk_post_message(BIGINT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.helpdesk_attach_to_message(BIGINT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.helpdesk_update_ticket(BIGINT, TEXT, BIGINT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.helpdesk_staff_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.helpdesk_set_enabled(BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION procurements.helpdesk_set_staff(BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_create_ticket(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_post_message(BIGINT, TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_attach_to_message(BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_update_ticket(BIGINT, TEXT, BIGINT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_staff_list() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_set_enabled(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_set_staff(BIGINT, BOOLEAN) TO authenticated;

-- 7. Public functions (service_role only; called by lib/helpdesk/publicActions.ts)
-- They return {ok:false, error} instead of raising, so the form can show the
-- message. p_ip_hash is sha256(ip + HELPDESK_IP_SALT), computed server-side.

CREATE OR REPLACE FUNCTION procurements.helpdesk_public_create(p_payload JSONB, p_ip_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_name    TEXT := trim(COALESCE(p_payload->>'name', ''));
  v_email   TEXT := lower(trim(COALESCE(p_payload->>'email', '')));
  v_subject TEXT := trim(COALESCE(p_payload->>'subject', ''));
  v_body    TEXT := trim(COALESCE(p_payload->>'body', ''));
  v_code    TEXT;
  v_ticket  BIGINT;
BEGIN
  IF NOT helpdesk_enabled() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'The Help Desk is turned off.');
  END IF;
  DELETE FROM sms_helpdesk_public_hits WHERE created_at < now() - INTERVAL '7 days';

  IF v_name = '' OR char_length(v_name) > 150 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Enter your name.');
  END IF;
  IF char_length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Enter a valid email address.');
  END IF;
  BEGIN
    PERFORM helpdesk_check_text(v_subject, p_payload->>'category', v_body);
  EXCEPTION WHEN SQLSTATE 'HD001' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
  END;

  IF (SELECT count(*) FROM sms_helpdesk_public_hits
       WHERE kind = 'create' AND ip_hash = p_ip_hash
         AND created_at > now() - INTERVAL '1 hour') >= 5
     OR (SELECT count(*) FROM sms_helpdesk_public_hits
          WHERE kind = 'create'
            AND created_at > now() - INTERVAL '1 hour') >= 50 THEN
    RETURN jsonb_build_object('ok', FALSE, 'rate_limited', TRUE,
      'error', 'Too many concerns were sent from here recently. Please try again in an hour.');
  END IF;
  IF (SELECT count(*) FROM sms_helpdesk_tickets
       WHERE source = 'public' AND submitter_email = v_email
         AND status NOT IN ('resolved', 'closed')) >= 3 THEN
    RETURN jsonb_build_object('ok', FALSE,
      'error', 'You already have 3 open concerns. Please wait for a reply or follow up on one of them.');
  END IF;

  INSERT INTO sms_helpdesk_public_hits (kind, email, ip_hash)
  VALUES ('create', v_email, p_ip_hash);

  v_code := helpdesk_new_code();
  INSERT INTO sms_helpdesk_tickets (
    reference_code, subject, category, source,
    submitter_name, submitter_email, submitter_contact, school_office)
  VALUES (
    v_code, v_subject, p_payload->>'category', 'public',
    v_name, v_email,
    NULLIF(left(trim(COALESCE(p_payload->>'contact', '')), 50), ''),
    NULLIF(left(trim(COALESCE(p_payload->>'school_office', '')), 150), ''))
  RETURNING id INTO v_ticket;

  INSERT INTO sms_helpdesk_messages (ticket_id, author_kind, body)
  VALUES (v_ticket, 'submitter', v_body);

  RETURN jsonb_build_object('ok', TRUE, 'reference_code', v_code);
END;
$$;

-- Counts this IP's lookups and replies in the last hour and logs this one.
-- TRUE when the caller is over the limit.
CREATE OR REPLACE FUNCTION procurements.helpdesk_public_limited(p_kind TEXT, p_ip_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  IF (SELECT count(*) FROM sms_helpdesk_public_hits
       WHERE kind IN ('lookup', 'reply') AND ip_hash = p_ip_hash
         AND created_at > now() - INTERVAL '1 hour') >= 20 THEN
    RETURN TRUE;
  END IF;
  INSERT INTO sms_helpdesk_public_hits (kind, ip_hash) VALUES (p_kind, p_ip_hash);
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.helpdesk_public_find(p_code TEXT, p_email TEXT)
RETURNS procurements.sms_helpdesk_tickets
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT * FROM sms_helpdesk_tickets
   WHERE source = 'public'
     AND reference_code = upper(trim(COALESCE(p_code, '')))
     AND submitter_email = lower(trim(COALESCE(p_email, '')));
$$;

CREATE OR REPLACE FUNCTION procurements.helpdesk_public_thread(p_code TEXT, p_email TEXT, p_ip_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  t sms_helpdesk_tickets;
BEGIN
  IF NOT helpdesk_enabled() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'The Help Desk is turned off.');
  END IF;
  IF helpdesk_public_limited('lookup', p_ip_hash) THEN
    RETURN jsonb_build_object('ok', FALSE, 'rate_limited', TRUE,
      'error', 'Too many attempts. Try again in an hour.');
  END IF;
  t := helpdesk_public_find(p_code, p_email);
  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE,
      'error', 'We couldn''t find a concern with that code and email.');
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'ticket', jsonb_build_object(
      'reference_code', t.reference_code, 'subject', t.subject,
      'category', t.category, 'status', t.status, 'created_at', t.created_at),
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id,
               'author_kind', m.author_kind,
               'author_name', CASE WHEN m.author_kind = 'submitter' THEN t.submitter_name
                                   ELSE 'Help Desk · ' || COALESCE(NULLIF(split_part(u.name, ' ', 1), ''), 'Staff') END,
               'body', m.body,
               'created_at', m.created_at) ORDER BY m.created_at, m.id)
        FROM sms_helpdesk_messages m
        LEFT JOIN sms_users u ON u.id = m.author_user_id
       WHERE m.ticket_id = t.id AND NOT m.is_internal), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION procurements.helpdesk_public_reply(p_code TEXT, p_email TEXT, p_body TEXT, p_ip_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  t sms_helpdesk_tickets;
  r JSONB;
BEGIN
  IF NOT helpdesk_enabled() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'The Help Desk is turned off.');
  END IF;
  IF helpdesk_public_limited('reply', p_ip_hash) THEN
    RETURN jsonb_build_object('ok', FALSE, 'rate_limited', TRUE,
      'error', 'Too many attempts. Try again in an hour.');
  END IF;
  t := helpdesk_public_find(p_code, p_email);
  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE,
      'error', 'We couldn''t find a concern with that code and email.');
  END IF;
  IF (SELECT count(*) FROM sms_helpdesk_messages
       WHERE ticket_id = t.id AND author_kind = 'submitter'
         AND created_at > now() - INTERVAL '24 hours') >= 10 THEN
    RETURN jsonb_build_object('ok', FALSE,
      'error', 'Too many replies on this concern today. Please wait for the Help Desk to respond.');
  END IF;

  BEGIN
    r := helpdesk_record_submitter_reply(t.id, NULL, p_body);
  EXCEPTION WHEN SQLSTATE 'HD001' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
  END;
  RETURN jsonb_build_object('ok', TRUE, 'status', r->>'status');
END;
$$;

REVOKE ALL ON FUNCTION procurements.helpdesk_public_limited(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_public_find(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_public_create(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_public_thread(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.helpdesk_public_reply(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_public_create(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_public_thread(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION procurements.helpdesk_public_reply(TEXT, TEXT, TEXT, TEXT) TO service_role;
