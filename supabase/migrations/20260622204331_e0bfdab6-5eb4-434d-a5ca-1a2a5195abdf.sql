ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS place_id text;
CREATE UNIQUE INDEX IF NOT EXISTS leads_place_id_key ON public.leads (place_id) WHERE place_id IS NOT NULL;