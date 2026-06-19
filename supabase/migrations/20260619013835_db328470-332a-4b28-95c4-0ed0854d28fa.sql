DROP POLICY IF EXISTS "Public read avail" ON public.closer_availability_rules;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'closer_availability_rules'
      AND policyname = 'Authenticated read avail'
  ) THEN
    CREATE POLICY "Authenticated read avail"
      ON public.closer_availability_rules
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

REVOKE SELECT ON public.closer_availability_rules FROM anon;