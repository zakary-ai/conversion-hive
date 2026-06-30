
-- =========================================================================
-- 1) New B2B closers table
-- =========================================================================
CREATE TABLE public.b2b_closers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  full_name text NOT NULL,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX b2b_closers_email_lower_idx ON public.b2b_closers (lower(email));
CREATE INDEX b2b_closers_user_id_idx ON public.b2b_closers (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_closers TO authenticated;
GRANT ALL ON public.b2b_closers TO service_role;

ALTER TABLE public.b2b_closers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage b2b_closers"
ON public.b2b_closers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Closer reads own b2b_closers row"
ON public.b2b_closers FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER b2b_closers_updated_at
BEFORE UPDATE ON public.b2b_closers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 2) New B2B Zoom credentials table
-- =========================================================================
CREATE TABLE public.b2b_closer_zoom_credentials (
  closer_id uuid PRIMARY KEY REFERENCES public.b2b_closers(id) ON DELETE CASCADE,
  zoom_account_id text,
  zoom_client_id text,
  zoom_client_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_closer_zoom_credentials TO authenticated;
GRANT ALL ON public.b2b_closer_zoom_credentials TO service_role;

ALTER TABLE public.b2b_closer_zoom_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage b2b_closer_zoom_credentials"
ON public.b2b_closer_zoom_credentials FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Closer reads own b2b zoom creds"
ON public.b2b_closer_zoom_credentials FOR SELECT TO authenticated
USING (closer_id IN (SELECT id FROM public.b2b_closers WHERE user_id = auth.uid()));

CREATE TRIGGER b2b_closer_zoom_credentials_updated_at
BEFORE UPDATE ON public.b2b_closer_zoom_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 3) New B2B availability rules table
-- =========================================================================
CREATE TABLE public.b2b_closer_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_id uuid NOT NULL REFERENCES public.b2b_closers(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute integer NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX b2b_closer_availability_rules_closer_idx ON public.b2b_closer_availability_rules (closer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_closer_availability_rules TO authenticated;
GRANT SELECT ON public.b2b_closer_availability_rules TO anon;
GRANT ALL ON public.b2b_closer_availability_rules TO service_role;

ALTER TABLE public.b2b_closer_availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage b2b_closer_availability_rules"
ON public.b2b_closer_availability_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Closer reads own b2b availability"
ON public.b2b_closer_availability_rules FOR SELECT TO authenticated
USING (closer_id IN (SELECT id FROM public.b2b_closers WHERE user_id = auth.uid()));

CREATE POLICY "Anyone reads b2b availability for slot lookup"
ON public.b2b_closer_availability_rules FOR SELECT TO anon
USING (true);

-- =========================================================================
-- 4) Add b2b_closer_id link to appointments
-- =========================================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS b2b_closer_id uuid REFERENCES public.b2b_closers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS appointments_b2b_closer_id_idx ON public.appointments (b2b_closer_id);

-- =========================================================================
-- 5) Migrate existing B2B-active closers into the new pool
-- =========================================================================
WITH migrated AS (
  INSERT INTO public.b2b_closers (user_id, full_name, email, active, created_at, updated_at)
  SELECT c.user_id, c.full_name, c.email, c.active, c.created_at, now()
  FROM public.closers c
  WHERE c.b2b_active = true
  RETURNING id, lower(email) AS email_lc
)
-- Copy Zoom credentials over
INSERT INTO public.b2b_closer_zoom_credentials (closer_id, zoom_account_id, zoom_client_id, zoom_client_secret, updated_at)
SELECT m.id, z.zoom_account_id, z.zoom_client_id, z.zoom_client_secret, now()
FROM migrated m
JOIN public.closers c ON lower(c.email) = m.email_lc
JOIN public.closer_zoom_credentials z ON z.closer_id = c.id
ON CONFLICT (closer_id) DO NOTHING;

-- Copy B2B availability rules over
INSERT INTO public.b2b_closer_availability_rules (closer_id, day_of_week, start_minute, end_minute, created_at)
SELECT nc.id, r.day_of_week, r.start_minute, r.end_minute, r.created_at
FROM public.closer_availability_rules r
JOIN public.closers oc ON oc.id = r.closer_id AND oc.b2b_active = true
JOIN public.b2b_closers nc ON lower(nc.email) = lower(oc.email)
WHERE r.track = 'b2b';

-- Link existing B2B appointments to the new b2b_closers row
UPDATE public.appointments a
SET b2b_closer_id = nc.id
FROM public.closers oc
JOIN public.b2b_closers nc ON lower(nc.email) = lower(oc.email)
WHERE a.assigned_closer_id = oc.id
  AND a.type = 'booking'
  AND oc.b2b_active = true
  AND a.b2b_closer_id IS NULL;

-- =========================================================================
-- 6) Extend handle_new_user to also link a signing-in user to b2b_closers by email
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_closer_id uuid;
  v_b2b_closer_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, company_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, COALESCE(NEW.raw_user_meta_data->>'company_name',''));

  SELECT id INTO v_closer_id
  FROM public.closers
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  SELECT id INTO v_b2b_closer_id
  FROM public.b2b_closers
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF v_closer_id IS NOT NULL THEN
    UPDATE public.closers SET user_id = NEW.id WHERE id = v_closer_id;
  END IF;

  IF v_b2b_closer_id IS NOT NULL THEN
    UPDATE public.b2b_closers SET user_id = NEW.id WHERE id = v_b2b_closer_id;
  END IF;

  IF v_closer_id IS NOT NULL OR v_b2b_closer_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'closer'::public.app_role)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
