UPDATE auth.users 
SET encrypted_password = crypt('ConversionLab1095!', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email IN ('conversionlabb@gmail.com', 'admin@conversionlab.test');

-- Make sure both have admin role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users 
WHERE email IN ('conversionlabb@gmail.com', 'admin@conversionlab.test')
ON CONFLICT (user_id, role) DO NOTHING;