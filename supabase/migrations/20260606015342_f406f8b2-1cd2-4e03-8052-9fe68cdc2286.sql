
-- profiles: per-setter scraper config
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS scraper_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_lead_quota integer NOT NULL DEFAULT 75;

-- leads: track recycling/retirement
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_status_change_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS retired boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.leads_status_change_tg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    NEW.last_status_change_at = now();
    IF NEW.status IN ('Booked','Not Interested') THEN
      NEW.retired = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_status_change ON public.leads;
CREATE TRIGGER leads_status_change
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_status_change_tg();

-- scraper_runs: richer logging
ALTER TABLE public.scraper_runs
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS details jsonb;

-- scraper_settings (singleton)
CREATE TABLE IF NOT EXISTS public.scraper_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  apify_actor_id text NOT NULL DEFAULT '',
  apify_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  batch_size integer NOT NULL DEFAULT 200,
  field_map jsonb NOT NULL DEFAULT '{"name":"name","phone":"phone","email":"email","company":"company"}'::jsonb,
  recycle_days integer NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraper_settings TO authenticated;
GRANT ALL ON public.scraper_settings TO service_role;

ALTER TABLE public.scraper_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read scraper settings" ON public.scraper_settings;
CREATE POLICY "Admins read scraper settings" ON public.scraper_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins write scraper settings" ON public.scraper_settings;
CREATE POLICY "Admins write scraper settings" ON public.scraper_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER scraper_settings_updated_at
  BEFORE UPDATE ON public.scraper_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- seed singleton row if missing
INSERT INTO public.scraper_settings (enabled)
SELECT false WHERE NOT EXISTS (SELECT 1 FROM public.scraper_settings);
