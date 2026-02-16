-- ============================================================================
-- ROOMS TABLE
-- ============================================================================
-- This migration creates the rooms table for managing school rooms/classrooms
-- ============================================================================

-- Set the schema to procurements
SET search_path TO procurements, public;

-- ============================================================================
-- ROOMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_rooms (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  building TEXT,
  capacity INTEGER CHECK (capacity > 0),
  room_type TEXT CHECK (room_type IN ('classroom', 'laboratory', 'library', 'gym', 'auditorium', 'computer_lab', 'science_lab', 'music_room', 'art_room', 'other')),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rooms
CREATE INDEX IF NOT EXISTS idx_rooms_name ON procurements.sms_rooms(name);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON procurements.sms_rooms(building);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON procurements.sms_rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_rooms_active ON procurements.sms_rooms(is_active) WHERE is_active = true;

-- Trigger for updated_at timestamp
CREATE TRIGGER update_sms_rooms_updated_at 
  BEFORE UPDATE ON procurements.sms_rooms 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE procurements.sms_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rooms are viewable by authenticated users"
  ON procurements.sms_rooms FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Rooms are insertable by admins"
  ON procurements.sms_rooms FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Rooms are updatable by admins"
  ON procurements.sms_rooms FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Rooms are deletable by admins"
  ON procurements.sms_rooms FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE procurements.sms_rooms IS 'School rooms and classrooms available for scheduling';
