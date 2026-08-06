ALTER TABLE public.b2b_closers ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.b2b_closers
)
UPDATE public.b2b_closers c SET priority = r.rn FROM ranked r WHERE r.id = c.id;

CREATE INDEX IF NOT EXISTS b2b_closers_priority_idx ON public.b2b_closers (priority);