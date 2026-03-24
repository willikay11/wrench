-- Demo seed: only runs in development
-- Inserts a sample build for testing UI without API calls

insert into public.builds (user_id, title, donor_car, engine_swap, goals, status)
values (
  (select id from public.users limit 1),
  'E30 K24 swap',
  '1991 BMW E30 325i',
  'Honda K24A2',
  array['daily', 'track'],
  'in_progress'
)
on conflict do nothing;
