UPDATE public.closer_bookings
SET dm_setter_id = 'd2d9887f-226a-4d71-aab4-feaf6a72293a',
    dm_setter_commission_amount = ROUND(deal_amount * 0.075, 2),
    dm_setter_commission_status = COALESCE(dm_setter_commission_status, 'pending'),
    dm_setter_manager_id = '52368271-9829-43a2-a0d9-14bcde8e75e9',
    dm_setter_manager_commission_amount = ROUND(deal_amount * 0.025, 2),
    dm_setter_manager_commission_status = COALESCE(dm_setter_manager_commission_status, 'pending')
WHERE applicant_name ILIKE '%zakary%test%' AND outcome = 'closed';