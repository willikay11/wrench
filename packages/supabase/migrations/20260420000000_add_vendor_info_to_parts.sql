-- Add vendor_name and currency columns to parts table
alter table public.parts
  add column if not exists vendor_name text,
  add column if not exists currency text default 'USD';

-- Create partial unique index on parts table for efficient lookups
create index if not exists parts_build_id_name_idx on public.parts(build_id, name);
