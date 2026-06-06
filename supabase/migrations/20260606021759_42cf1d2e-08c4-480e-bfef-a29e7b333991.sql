ALTER TABLE public.scraper_settings
  ADD COLUMN IF NOT EXISTS city_rotation text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS city_rotation_index integer NOT NULL DEFAULT 0;