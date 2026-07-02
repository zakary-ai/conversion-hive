
-- 1. Enum values
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dm_setter';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dm_setter_manager';

-- 2. dm_setters
CREATE TABLE IF NOT EXISTS public.dm_setters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_id uuid NULL REFERENCES public.dm_setters(id) ON DELETE SET NULL,
  is_manager boolean NOT NULL DEFAULT false,
  apply_slug text UNIQUE,
  full_name text,
  email text,
  daily_target int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_setters TO authenticated;
GRANT SELECT ON public.dm_setters TO anon;  -- narrow policy below limits to apply_slug lookups
GRANT ALL ON public.dm_setters TO service_role;

ALTER TABLE public.dm_setters ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "dm_setters admin all" ON public.dm_setters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Self read
CREATE POLICY "dm_setters self read" ON public.dm_setters
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Manager reads their team
CREATE POLICY "dm_setters manager read team" ON public.dm_setters
  FOR SELECT TO authenticated
  USING (
    manager_id IN (SELECT id FROM public.dm_setters WHERE user_id = auth.uid())
  );

-- Public: allow anon SELECT of just id/full_name/apply_slug for /apply page.
-- Column-level RLS not used; instead grant only SELECT to anon and add a permissive
-- policy filtering to rows with an apply_slug set. App code MUST project only safe columns.
CREATE POLICY "dm_setters public apply lookup" ON public.dm_setters
  FOR SELECT TO anon
  USING (apply_slug IS NOT NULL);

-- 3. dm_daily_logs
CREATE TABLE IF NOT EXISTS public.dm_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_setter_id uuid NOT NULL REFERENCES public.dm_setters(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  ai_count int NOT NULL DEFAULT 0,
  manual_adjustment int NOT NULL DEFAULT 0,
  target int NOT NULL DEFAULT 100,
  total int GENERATED ALWAYS AS (ai_count + manual_adjustment) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dm_setter_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_dm_daily_logs_setter_date ON public.dm_daily_logs(dm_setter_id, log_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_daily_logs TO authenticated;
GRANT ALL ON public.dm_daily_logs TO service_role;

ALTER TABLE public.dm_daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_daily_logs admin all" ON public.dm_daily_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "dm_daily_logs self all" ON public.dm_daily_logs
  FOR ALL TO authenticated
  USING (dm_setter_id IN (SELECT id FROM public.dm_setters WHERE user_id = auth.uid()))
  WITH CHECK (dm_setter_id IN (SELECT id FROM public.dm_setters WHERE user_id = auth.uid()));

CREATE POLICY "dm_daily_logs manager read" ON public.dm_daily_logs
  FOR SELECT TO authenticated
  USING (dm_setter_id IN (
    SELECT s.id FROM public.dm_setters s
    WHERE s.manager_id IN (SELECT id FROM public.dm_setters WHERE user_id = auth.uid())
  ));

-- 4. dm_log_uploads
CREATE TABLE IF NOT EXISTS public.dm_log_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_daily_log_id uuid NOT NULL REFERENCES public.dm_daily_logs(id) ON DELETE CASCADE,
  dm_setter_id uuid NOT NULL REFERENCES public.dm_setters(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram','tiktok','other')),
  ai_count int NOT NULL DEFAULT 0,
  ai_raw jsonb,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','counted','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_log_uploads_log ON public.dm_log_uploads(dm_daily_log_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_log_uploads TO authenticated;
GRANT ALL ON public.dm_log_uploads TO service_role;

ALTER TABLE public.dm_log_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_log_uploads admin all" ON public.dm_log_uploads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "dm_log_uploads self all" ON public.dm_log_uploads
  FOR ALL TO authenticated
  USING (dm_setter_id IN (SELECT id FROM public.dm_setters WHERE user_id = auth.uid()))
  WITH CHECK (dm_setter_id IN (SELECT id FROM public.dm_setters WHERE user_id = auth.uid()));

CREATE POLICY "dm_log_uploads manager read" ON public.dm_log_uploads
  FOR SELECT TO authenticated
  USING (dm_setter_id IN (
    SELECT s.id FROM public.dm_setters s
    WHERE s.manager_id IN (SELECT id FROM public.dm_setters WHERE user_id = auth.uid())
  ));

-- 5. Extend leads with dm_setter attribution
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS dm_setter_id uuid NULL REFERENCES public.dm_setters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dm_setter_locked_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_leads_dm_setter ON public.leads(dm_setter_id) WHERE dm_setter_id IS NOT NULL;

-- 6. updated_at triggers
DROP TRIGGER IF EXISTS dm_setters_updated_at ON public.dm_setters;
CREATE TRIGGER dm_setters_updated_at BEFORE UPDATE ON public.dm_setters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS dm_daily_logs_updated_at ON public.dm_daily_logs;
CREATE TRIGGER dm_daily_logs_updated_at BEFORE UPDATE ON public.dm_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
