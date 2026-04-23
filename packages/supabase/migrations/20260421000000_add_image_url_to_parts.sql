-- Add image_url column to parts table for product images
alter table public.parts
  add column if not exists image_url text;
