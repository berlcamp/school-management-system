-- ============================================================================
-- SUBJECT SCHEDULES TABLE
-- ============================================================================
-- This migration creates the subject schedules table with conflict detection
-- ============================================================================

-- Set the schema to procurements
SET search_path TO procurements, public;

-- ============================================================================
-- SUBJECT SCHEDULES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_subject_schedules (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  room_id BIGINT NOT NULL REFERENCES procurements.sms_rooms(id) ON DELETE CASCADE,
  days_of_week INTEGER[] NOT NULL CHECK (array_length(days_of_week, 1) > 0),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL CHECK (end_time > start_time),
  school_year TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for conflict detection and queries
CREATE INDEX IF NOT EXISTS idx_subject_schedules_subject ON procurements.sms_subject_schedules(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_schedules_section ON procurements.sms_subject_schedules(section_id);
CREATE INDEX IF NOT EXISTS idx_subject_schedules_teacher ON procurements.sms_subject_schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subject_schedules_room ON procurements.sms_subject_schedules(room_id);
CREATE INDEX IF NOT EXISTS idx_subject_schedules_school_year ON procurements.sms_subject_schedules(school_year);
CREATE INDEX IF NOT EXISTS idx_subject_schedules_days ON procurements.sms_subject_schedules USING GIN(days_of_week);
CREATE INDEX IF NOT EXISTS idx_subject_schedules_time ON procurements.sms_subject_schedules(start_time, end_time);

-- Trigger for updated_at timestamp
CREATE TRIGGER update_sms_subject_schedules_updated_at 
  BEFORE UPDATE ON procurements.sms_subject_schedules 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- CONFLICT DETECTION FUNCTIONS
-- ============================================================================

-- Function to check if two time ranges overlap
CREATE OR REPLACE FUNCTION public.times_overlap(
  start1 TIME,
  end1 TIME,
  start2 TIME,
  end2 TIME
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN (start1 < end2 AND end1 > start2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if two day arrays have any common days
CREATE OR REPLACE FUNCTION public.days_overlap(
  days1 INTEGER[],
  days2 INTEGER[]
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM unnest(days1) AS day1
    WHERE day1 = ANY(days2)
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check schedule conflicts
CREATE OR REPLACE FUNCTION public.check_schedule_conflicts(
  p_room_id BIGINT,
  p_teacher_id BIGINT,
  p_section_id BIGINT,
  p_days_of_week INTEGER[],
  p_start_time TIME,
  p_end_time TIME,
  p_school_year TEXT,
  p_id BIGINT DEFAULT NULL -- For updates, exclude current record
) RETURNS TABLE(
  conflict_type TEXT,
  conflict_message TEXT
) AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  -- Check room conflicts
  SELECT COUNT(*) INTO conflict_count
  FROM procurements.sms_subject_schedules
  WHERE room_id = p_room_id
    AND school_year = p_school_year
    AND (p_id IS NULL OR id != p_id)
    AND public.days_overlap(days_of_week, p_days_of_week)
    AND public.times_overlap(start_time, end_time, p_start_time, p_end_time);
  
  IF conflict_count > 0 THEN
    RETURN QUERY SELECT 
      'room'::TEXT,
      'Room is already scheduled at this time on one or more selected days'::TEXT;
  END IF;

  -- Check teacher conflicts
  SELECT COUNT(*) INTO conflict_count
  FROM procurements.sms_subject_schedules
  WHERE teacher_id = p_teacher_id
    AND school_year = p_school_year
    AND (p_id IS NULL OR id != p_id)
    AND public.days_overlap(days_of_week, p_days_of_week)
    AND public.times_overlap(start_time, end_time, p_start_time, p_end_time);
  
  IF conflict_count > 0 THEN
    RETURN QUERY SELECT 
      'teacher'::TEXT,
      'Teacher is already scheduled at this time on one or more selected days'::TEXT;
  END IF;

  -- Check section conflicts
  SELECT COUNT(*) INTO conflict_count
  FROM procurements.sms_subject_schedules
  WHERE section_id = p_section_id
    AND school_year = p_school_year
    AND (p_id IS NULL OR id != p_id)
    AND public.days_overlap(days_of_week, p_days_of_week)
    AND public.times_overlap(start_time, end_time, p_start_time, p_end_time);
  
  IF conflict_count > 0 THEN
    RETURN QUERY SELECT 
      'section'::TEXT,
      'Section is already scheduled at this time on one or more selected days'::TEXT;
  END IF;

  -- No conflicts found
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to check conflicts before insert/update
CREATE OR REPLACE FUNCTION public.check_schedule_conflicts_trigger()
RETURNS TRIGGER AS $$
DECLARE
  conflict_record RECORD;
  conflict_messages TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Check for conflicts
  FOR conflict_record IN 
    SELECT * FROM public.check_schedule_conflicts(
      NEW.room_id,
      NEW.teacher_id,
      NEW.section_id,
      NEW.days_of_week,
      NEW.start_time,
      NEW.end_time,
      NEW.school_year,
      NEW.id
    )
  LOOP
    conflict_messages := array_append(conflict_messages, conflict_record.conflict_message);
  END LOOP;

  -- If conflicts found, raise exception
  IF array_length(conflict_messages, 1) > 0 THEN
    RAISE EXCEPTION 'Schedule conflict detected: %', array_to_string(conflict_messages, '; ');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER check_schedule_conflicts_before_insert_update
  BEFORE INSERT OR UPDATE ON procurements.sms_subject_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.check_schedule_conflicts_trigger();

-- ============================================================================
-- HELPER FUNCTIONS FOR QUERYING SCHEDULES
-- ============================================================================

-- Function to get room schedule for a specific day and school year
CREATE OR REPLACE FUNCTION public.get_room_schedule(
  p_room_id BIGINT,
  p_day INTEGER,
  p_school_year TEXT
) RETURNS TABLE(
  id BIGINT,
  subject_id BIGINT,
  section_id BIGINT,
  teacher_id BIGINT,
  start_time TIME,
  end_time TIME
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.subject_id,
    s.section_id,
    s.teacher_id,
    s.start_time,
    s.end_time
  FROM procurements.sms_subject_schedules s
  WHERE s.room_id = p_room_id
    AND s.school_year = p_school_year
    AND p_day = ANY(s.days_of_week)
  ORDER BY s.start_time;
END;
$$ LANGUAGE plpgsql;

-- Function to get teacher schedule for a specific day and school year
CREATE OR REPLACE FUNCTION public.get_teacher_schedule(
  p_teacher_id BIGINT,
  p_day INTEGER,
  p_school_year TEXT
) RETURNS TABLE(
  id BIGINT,
  subject_id BIGINT,
  section_id BIGINT,
  room_id BIGINT,
  start_time TIME,
  end_time TIME
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.subject_id,
    s.section_id,
    s.room_id,
    s.start_time,
    s.end_time
  FROM procurements.sms_subject_schedules s
  WHERE s.teacher_id = p_teacher_id
    AND s.school_year = p_school_year
    AND p_day = ANY(s.days_of_week)
  ORDER BY s.start_time;
END;
$$ LANGUAGE plpgsql;

-- Function to get section schedule for a specific day and school year
CREATE OR REPLACE FUNCTION public.get_section_schedule(
  p_section_id BIGINT,
  p_day INTEGER,
  p_school_year TEXT
) RETURNS TABLE(
  id BIGINT,
  subject_id BIGINT,
  teacher_id BIGINT,
  room_id BIGINT,
  start_time TIME,
  end_time TIME
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.subject_id,
    s.teacher_id,
    s.room_id,
    s.start_time,
    s.end_time
  FROM procurements.sms_subject_schedules s
  WHERE s.section_id = p_section_id
    AND s.school_year = p_school_year
    AND p_day = ANY(s.days_of_week)
  ORDER BY s.start_time;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE procurements.sms_subject_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subject schedules are viewable by authenticated users"
  ON procurements.sms_subject_schedules FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Subject schedules are insertable by admins"
  ON procurements.sms_subject_schedules FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Subject schedules are updatable by admins"
  ON procurements.sms_subject_schedules FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Subject schedules are deletable by admins"
  ON procurements.sms_subject_schedules FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE procurements.sms_subject_schedules IS 'Subject schedules linking subjects, sections, teachers, rooms, and time slots';
COMMENT ON COLUMN procurements.sms_subject_schedules.days_of_week IS 'Array of day numbers: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday';
