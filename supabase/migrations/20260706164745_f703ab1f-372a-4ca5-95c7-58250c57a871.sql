
DO $$
DECLARE
  et_midnight timestamptz := (now() AT TIME ZONE 'America/New_York')::date AT TIME ZONE 'America/New_York';
  target int := 150;
  r record;
  need int;
BEGIN
  FOR r IN
    SELECT p.user_id, p.full_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'client'
    WHERE p.scraper_enabled = true
    ORDER BY (SELECT count(*) FROM public.leads l
              WHERE l.assigned_user_id = p.user_id AND l.assigned_at >= et_midnight) DESC
  LOOP
    SELECT GREATEST(0, target - count(*)) INTO need
    FROM public.leads
    WHERE assigned_user_id = r.user_id AND assigned_at >= et_midnight;

    IF need > 0 THEN
      WITH pool AS (
        SELECT id FROM public.leads
        WHERE status = 'New'
          AND retired = false
          AND do_not_contact = false
          AND assigned_user_id IS NULL
        ORDER BY created_at ASC
        LIMIT need
      )
      UPDATE public.leads l
      SET assigned_user_id = r.user_id, assigned_at = now()
      FROM pool
      WHERE l.id = pool.id;

      RAISE NOTICE 'assigned % leads to %', need, r.full_name;
    END IF;
  END LOOP;
END $$;
