-- Create part_vendors table for storing multiple vendor options per part
create table if not exists public.part_vendors (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null
    references public.parts(id) on delete cascade,
  vendor_name text not null,
  vendor_url text,
  price numeric(10,2),
  currency text default 'USD',
  ships_from text,
  estimated_days_min int,
  estimated_days_max int,
  shipping_cost numeric(10,2),
  is_primary boolean default false,
  created_at timestamptz default now()
);

alter table public.part_vendors
  enable row level security;

create policy "Users can view vendors for their parts"
  on public.part_vendors for select
  using (
    exists (
      select 1 from public.parts
      join public.builds
        on builds.id = parts.build_id
      where parts.id = part_vendors.part_id
      and builds.user_id = auth.uid()
    )
  );

create policy "Users can insert vendors for their parts"
  on public.part_vendors for insert
  with check (
    exists (
      select 1 from public.parts
      join public.builds
        on builds.id = parts.build_id
      where parts.id = part_vendors.part_id
      and builds.user_id = auth.uid()
    )
  );

-- Add vendor ordering columns to parts table
alter table public.parts
  add column if not exists ordered_from_vendor_id uuid
    references public.part_vendors(id),
  add column if not exists ordered_at timestamptz;
