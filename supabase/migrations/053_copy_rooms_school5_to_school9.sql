-- ============================================================================
-- COPY ROOMS FROM SCHOOL 5 TO SCHOOL 9
-- ============================================================================
-- Copies all rooms belonging to school_id=5 into school_id=9,
-- skipping any that already exist (same name) in school 9.
-- ============================================================================

SET search_path TO procurements, public;

INSERT INTO procurements.sms_rooms (name, building, capacity, room_type, description, is_active, school_id)
SELECT name, building, capacity, room_type, description, is_active, 9
FROM procurements.sms_rooms
WHERE school_id = 5
  AND name NOT IN (
    SELECT name FROM procurements.sms_rooms WHERE school_id = 9
  );
