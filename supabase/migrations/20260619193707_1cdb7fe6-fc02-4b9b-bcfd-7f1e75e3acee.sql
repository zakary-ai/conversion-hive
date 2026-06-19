
DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'conversionlabb@gmail.com';
  v_password text := 'ConversionLab1095!';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      lower(v_email), crypt(v_password, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','Conversion Lab Admin'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(v_email), 'email_verified', true),
      'email', lower(v_email), now(), now(), now());
  END IF;

  -- Ensure profile exists & flag must_change_password
  INSERT INTO public.profiles (user_id, full_name, email, company_name, must_change_password)
  VALUES (v_user_id, 'Conversion Lab Admin', lower(v_email), '', true)
  ON CONFLICT (user_id) DO UPDATE SET must_change_password = true, full_name = COALESCE(public.profiles.full_name, 'Conversion Lab Admin');

  -- Grant admin role (and remove non-admin auto-assigned roles)
  DELETE FROM public.user_roles WHERE user_id = v_user_id AND role <> 'admin';
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
