-- Manager-owned closers: company closers keep owner_manager_id = NULL
ALTER TABLE public.closers
  ADD COLUMN IF NOT EXISTS owner_manager_id uuid REFERENCES public.dm_setters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS closers_owner_manager_idx ON public.closers (owner_manager_id);

-- Manager bookings can be assigned to one of that manager's closers
ALTER TABLE public.dm_manager_bookings
  ADD COLUMN IF NOT EXISTS assigned_closer_id uuid REFERENCES public.closers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dm_manager_bookings_closer_idx ON public.dm_manager_bookings (assigned_closer_id);

-- Helper: resolve the closers row for the signed-in user
CREATE OR REPLACE FUNCTION public.get_closer_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.closers WHERE user_id = _user_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_closer_id_for_user(uuid) TO authenticated;

-- Managers manage their own closers
DROP POLICY IF EXISTS "Managers manage own closers" ON public.closers;
CREATE POLICY "Managers manage own closers"
ON public.closers
FOR ALL
TO authenticated
USING (owner_manager_id IS NOT NULL AND owner_manager_id = public.get_dm_setter_id_for_user(auth.uid()))
WITH CHECK (owner_manager_id IS NOT NULL AND owner_manager_id = public.get_dm_setter_id_for_user(auth.uid()));

-- A manager's closer can read and update the manager calls assigned to them
DROP POLICY IF EXISTS "dm manager bookings assigned closer read" ON public.dm_manager_bookings;
CREATE POLICY "dm manager bookings assigned closer read"
ON public.dm_manager_bookings
FOR SELECT
TO authenticated
USING (assigned_closer_id IS NOT NULL AND assigned_closer_id = public.get_closer_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "dm manager bookings assigned closer update" ON public.dm_manager_bookings;
CREATE POLICY "dm manager bookings assigned closer update"
ON public.dm_manager_bookings
FOR UPDATE
TO authenticated
USING (assigned_closer_id IS NOT NULL AND assigned_closer_id = public.get_closer_id_for_user(auth.uid()))
WITH CHECK (assigned_closer_id IS NOT NULL AND assigned_closer_id = public.get_closer_id_for_user(auth.uid()));