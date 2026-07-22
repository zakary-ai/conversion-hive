CREATE OR REPLACE FUNCTION public.ob_skip_empty_inbound_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  visible_text text;
  visible_html text;
BEGIN
  IF NEW.direction::text = 'inbound' THEN
    visible_text := btrim(
      regexp_replace(
        replace(replace(coalesce(NEW.body_text, ''), '&nbsp;', ' '), chr(160), ' '),
        '\s+',
        ' ',
        'g'
      )
    );
    visible_html := btrim(
      regexp_replace(
        replace(
          replace(
            regexp_replace(coalesce(NEW.body_html, ''), '<[^>]+>', ' ', 'g'),
            '&nbsp;',
            ' '
          ),
          chr(160),
          ' '
        ),
        '\s+',
        ' ',
        'g'
      )
    );

    IF coalesce(visible_text, '') = '' AND coalesce(visible_html, '') = '' THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ob_skip_empty_inbound_message() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ob_skip_empty_inbound_message() FROM anon;
REVOKE ALL ON FUNCTION public.ob_skip_empty_inbound_message() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ob_skip_empty_inbound_message() TO service_role;

DROP TRIGGER IF EXISTS ob_skip_empty_inbound_message_tg ON public.ob_messages;
CREATE TRIGGER ob_skip_empty_inbound_message_tg
BEFORE INSERT ON public.ob_messages
FOR EACH ROW
EXECUTE FUNCTION public.ob_skip_empty_inbound_message();

DELETE FROM public.ob_messages
WHERE direction::text = 'inbound'
  AND btrim(regexp_replace(replace(replace(coalesce(body_text, ''), '&nbsp;', ' '), chr(160), ' '), '\s+', ' ', 'g')) = ''
  AND btrim(regexp_replace(replace(replace(regexp_replace(coalesce(body_html, ''), '<[^>]+>', ' ', 'g'), '&nbsp;', ' '), chr(160), ' '), '\s+', ' ', 'g')) = '';

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY smartlead_message_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.ob_messages
  WHERE smartlead_message_id IS NOT NULL
), duplicate_messages AS (
  DELETE FROM public.ob_messages m
  USING ranked r
  WHERE m.id = r.id
    AND r.rn > 1
  RETURNING m.id
), recalculated AS (
  SELECT
    c.id AS conversation_id,
    max(m.sent_at) FILTER (
      WHERE m.direction::text = 'inbound'
        AND (
          btrim(regexp_replace(replace(replace(coalesce(m.body_text, ''), '&nbsp;', ' '), chr(160), ' '), '\s+', ' ', 'g')) <> ''
          OR btrim(regexp_replace(replace(replace(regexp_replace(coalesce(m.body_html, ''), '<[^>]+>', ' ', 'g'), '&nbsp;', ' '), chr(160), ' '), '\s+', ' ', 'g')) <> ''
        )
    ) AS last_inbound_at,
    max(m.sent_at) FILTER (WHERE m.direction::text = 'outbound') AS last_outbound_at
  FROM public.ob_conversations c
  LEFT JOIN public.ob_messages m ON m.conversation_id = c.id
  GROUP BY c.id
)
UPDATE public.ob_conversations c
SET
  last_inbound_at = r.last_inbound_at,
  last_outbound_at = r.last_outbound_at,
  needs_response = r.last_inbound_at IS NOT NULL
    AND (r.last_outbound_at IS NULL OR r.last_inbound_at > r.last_outbound_at)
FROM recalculated r
WHERE c.id = r.conversation_id;

CREATE UNIQUE INDEX IF NOT EXISTS ob_messages_smartlead_message_id_unique
ON public.ob_messages (smartlead_message_id)
WHERE smartlead_message_id IS NOT NULL;