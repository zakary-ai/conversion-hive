UPDATE public.closers c
SET user_id = p.user_id
FROM public.profiles p
WHERE c.user_id IS NULL
  AND lower(c.email) = lower(p.email);