CREATE TABLE IF NOT EXISTS public.closer_zoom_credentials (
  closer_id uuid PRIMARY KEY REFERENCES public.closers(id) ON DELETE CASCADE,
  zoom_account_id text,
  zoom_client_id text,
  zoom_client_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.closer_zoom_credentials TO service_role;
ALTER TABLE public.closer_zoom_credentials ENABLE ROW LEVEL SECURITY;

INSERT INTO public.closer_zoom_credentials (closer_id, zoom_account_id, zoom_client_id, zoom_client_secret)
SELECT id, zoom_account_id, zoom_client_id, zoom_client_secret
FROM public.closers
WHERE zoom_account_id IS NOT NULL OR zoom_client_id IS NOT NULL OR zoom_client_secret IS NOT NULL
ON CONFLICT (closer_id) DO NOTHING;

ALTER TABLE public.closers DROP COLUMN IF EXISTS zoom_account_id;
ALTER TABLE public.closers DROP COLUMN IF EXISTS zoom_client_id;
ALTER TABLE public.closers DROP COLUMN IF EXISTS zoom_client_secret;

DROP POLICY IF EXISTS "Insert own attempts" ON public.quiz_attempts;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pgmq'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;