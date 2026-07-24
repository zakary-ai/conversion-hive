
-- 1. Archive existing leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
UPDATE public.leads SET archived = true WHERE archived = false;

-- 2. Enums
DO $$ BEGIN
  CREATE TYPE public.b2b_pool_status AS ENUM ('unclaimed','claimed','burned','booked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.b2b_call_outcome AS ENUM ('booked','callback_scheduled','no_answer','not_interested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.b2b_callback_status AS ENUM ('scheduled','completed','missed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Pool table
CREATE TABLE IF NOT EXISTS public.b2b_lead_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  company text,
  website text,
  email text,
  phone text,
  linkedin_url text,
  title text,
  notes text,
  source text,
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  status public.b2b_pool_status NOT NULL DEFAULT 'unclaimed',
  last_attempt_at timestamptz,
  didnt_pick_up boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS b2b_lead_pool_email_uidx ON public.b2b_lead_pool (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS b2b_lead_pool_phone_uidx ON public.b2b_lead_pool (regexp_replace(phone,'\D','','g')) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS b2b_lead_pool_claimed_by_idx ON public.b2b_lead_pool (claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS b2b_lead_pool_status_idx ON public.b2b_lead_pool (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_lead_pool TO authenticated;
GRANT ALL ON public.b2b_lead_pool TO service_role;
ALTER TABLE public.b2b_lead_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pool select" ON public.b2b_lead_pool FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR (archived = false AND (status = 'unclaimed' OR claimed_by = auth.uid()))
);
CREATE POLICY "pool insert" ON public.b2b_lead_pool FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pool update" ON public.b2b_lead_pool FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR claimed_by = auth.uid())
WITH CHECK (public.has_role(auth.uid(),'admin') OR claimed_by = auth.uid());
CREATE POLICY "pool delete" ON public.b2b_lead_pool FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER b2b_lead_pool_updated_at BEFORE UPDATE ON public.b2b_lead_pool
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Callbacks
CREATE TABLE IF NOT EXISTS public.b2b_callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_lead_id uuid NOT NULL REFERENCES public.b2b_lead_pool(id) ON DELETE CASCADE,
  setter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  note text,
  status public.b2b_callback_status NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS b2b_callbacks_setter_idx ON public.b2b_callbacks(setter_id, scheduled_at);
CREATE INDEX IF NOT EXISTS b2b_callbacks_lead_idx ON public.b2b_callbacks(pool_lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_callbacks TO authenticated;
GRANT ALL ON public.b2b_callbacks TO service_role;
ALTER TABLE public.b2b_callbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cb select" ON public.b2b_callbacks FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR setter_id = auth.uid());
CREATE POLICY "cb insert" ON public.b2b_callbacks FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR setter_id = auth.uid());
CREATE POLICY "cb update" ON public.b2b_callbacks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR setter_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(),'admin') OR setter_id = auth.uid());
CREATE POLICY "cb delete" ON public.b2b_callbacks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR setter_id = auth.uid());

CREATE TRIGGER b2b_callbacks_updated_at BEFORE UPDATE ON public.b2b_callbacks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Call attempts
CREATE TABLE IF NOT EXISTS public.b2b_call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_lead_id uuid NOT NULL REFERENCES public.b2b_lead_pool(id) ON DELETE CASCADE,
  setter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome public.b2b_call_outcome NOT NULL,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS b2b_call_attempts_lead_idx ON public.b2b_call_attempts(pool_lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS b2b_call_attempts_setter_idx ON public.b2b_call_attempts(setter_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_call_attempts TO authenticated;
GRANT ALL ON public.b2b_call_attempts TO service_role;
ALTER TABLE public.b2b_call_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "att select" ON public.b2b_call_attempts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR setter_id = auth.uid());
CREATE POLICY "att insert" ON public.b2b_call_attempts FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR setter_id = auth.uid());
CREATE POLICY "att update" ON public.b2b_call_attempts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR setter_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(),'admin') OR setter_id = auth.uid());
CREATE POLICY "att delete" ON public.b2b_call_attempts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));
