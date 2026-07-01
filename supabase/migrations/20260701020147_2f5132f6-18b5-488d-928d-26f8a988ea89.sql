ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_outcome_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_outcome_check
  CHECK ((outcome IS NULL) OR (outcome = ANY (ARRAY['closed'::text, 'lost'::text, 'no_show'::text, 'disqualified'::text])));
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'Disqualified';