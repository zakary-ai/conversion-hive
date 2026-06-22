ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
CREATE INDEX IF NOT EXISTS leads_assigned_user_assigned_at_idx
  ON public.leads (assigned_user_id, assigned_at)
  WHERE assigned_user_id IS NOT NULL;
DROP INDEX IF EXISTS leads_place_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS leads_place_id_key ON public.leads (place_id);