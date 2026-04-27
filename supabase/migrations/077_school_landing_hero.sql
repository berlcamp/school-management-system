-- ============================================================================
-- PUBLIC SCHOOL PAGE: hero image from school settings
-- ============================================================================
-- Staff set landing_hero_image_url in sms_school_settings (School Settings).
-- Anonymous users read it only via SECURITY DEFINER RPC (not full settings row).
-- ============================================================================

ALTER TABLE procurements.sms_school_settings
  ADD COLUMN IF NOT EXISTS landing_hero_image_url TEXT DEFAULT NULL;

COMMENT ON COLUMN procurements.sms_school_settings.landing_hero_image_url IS
  'Background image URL for the public school page (/schools/[id]); optional.';

CREATE OR REPLACE FUNCTION public.get_school_landing_hero(p_school_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT landing_hero_image_url
  FROM procurements.sms_school_settings
  WHERE school_id = p_school_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_school_landing_hero(TEXT) IS
  'Returns landing hero image URL for public school profile; callable by anon.';

GRANT EXECUTE ON FUNCTION public.get_school_landing_hero(TEXT) TO anon, authenticated;
