
-- Remove empty-body inbound messages and recompute conversation timestamps.
DELETE FROM public.ob_messages
WHERE direction = 'inbound'
  AND COALESCE(NULLIF(TRIM(body_text), ''), NULLIF(TRIM(body_html), '')) IS NULL;

UPDATE public.ob_conversations c
SET last_inbound_at = sub.last_in,
    needs_response = CASE
      WHEN sub.last_in IS NULL THEN false
      WHEN c.last_outbound_at IS NULL THEN true
      WHEN sub.last_in > c.last_outbound_at THEN true
      ELSE false
    END
FROM (
  SELECT conversation_id, MAX(sent_at) AS last_in
  FROM public.ob_messages
  WHERE direction = 'inbound'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id;

UPDATE public.ob_conversations c
SET last_inbound_at = NULL,
    needs_response = false
WHERE NOT EXISTS (
  SELECT 1 FROM public.ob_messages m
  WHERE m.conversation_id = c.id AND m.direction = 'inbound'
);
