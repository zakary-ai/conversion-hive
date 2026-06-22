
CREATE POLICY "Setters update own calls"
  ON public.call_logs
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Backfill: mark the most recent uncounted call for each (user, lead) pair
-- where the lead has a non-New status as counted.
WITH ranked AS (
  SELECT cl.id,
         row_number() OVER (PARTITION BY cl.user_id, cl.lead_id ORDER BY cl.started_at DESC NULLS LAST, cl.created_at DESC) AS rn
  FROM public.call_logs cl
  JOIN public.leads l ON l.id = cl.lead_id
  WHERE cl.counted_at IS NULL
    AND cl.lead_id IS NOT NULL
    AND l.status <> 'New'::lead_status
)
UPDATE public.call_logs
SET counted_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn = 1);
