alter table public.parts
  add column description text,
  add column price_estimate numeric(10,2),
  add column vendor_url text,
  add column goal text,
  add column updated_at timestamptz default now() not null;

create trigger parts_updated_at
  before update on public.parts
  for each row execute function public.set_updated_at();
