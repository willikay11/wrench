-- Step 1: Create auth user
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data
) VALUES (
  '0468c4d8-e74a-46a1-9e3f-aed66306bb93',
  'test@wrench.app',
  '$2a$10$PznXR5VSFhLpBwT1B7hYuusBmJ3TqFMGBqMKwNOFByPAlFgqAwvKO',
  now(),
  now(),
  now(),
  '{"display_name": "Test Builder"}'
) ON CONFLICT (id) DO NOTHING;

-- Step 2: Insert public.users directly (don't rely on trigger in seed)
INSERT INTO public.users (id, email, display_name)
VALUES (
  '0468c4d8-e74a-46a1-9e3f-aed66306bb93',
  'test@wrench.app',
  'Test Builder'
) ON CONFLICT (id) DO NOTHING;

-- Step 3: Now the FK exists, safe to insert the build
INSERT INTO public.builds (user_id, title, donor_car, engine_swap, goals, status)
VALUES (
  '0468c4d8-e74a-46a1-9e3f-aed66306bb93',
  'E30 K24 swap',
  '1991 BMW E30 325i',
  'Honda K24A2',
  ARRAY['daily', 'track'],
  'in_progress'
) ON CONFLICT DO NOTHING;