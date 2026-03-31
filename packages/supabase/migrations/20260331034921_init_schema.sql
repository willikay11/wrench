-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- Users (mirrors Supabase auth.users)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  display_name text,
  avatar_url text,
  region text,
  created_at timestamptz default now() not null
);

-- Row Level Security
alter table public.users enable row level security;
create policy "Users can read own profile"
  on public.users for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.users for update using (auth.uid() = id);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Builds
create table public.builds (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  donor_car text,
  engine_swap text,
  goals text[] default '{}',
  image_url text,
  vision_data jsonb,
  embedding vector(1536),
  status text default 'planning' check (status in ('planning', 'in_progress', 'complete')),
  is_public boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.builds enable row level security;
create policy "Users can manage own builds"
  on public.builds for all using (auth.uid() = user_id);
create policy "Public builds are readable by all"
  on public.builds for select using (is_public = true);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger builds_updated_at
  before update on public.builds
  for each row execute function public.set_updated_at();

-- Parts
create table public.parts (
  id uuid default uuid_generate_v4() primary key,
  build_id uuid references public.builds(id) on delete cascade not null,
  name text not null,
  category text check (category in ('engine','drivetrain','electrical','cooling','safety','other')),
  is_safety_critical boolean default false,
  status text default 'needed' check (status in ('needed','ordered','sourced','installed')),
  notes text,
  created_at timestamptz default now() not null
);

alter table public.parts enable row level security;
create policy "Parts inherit build access"
  on public.parts for all using (
    exists (select 1 from public.builds where id = build_id and user_id = auth.uid())
  );

-- Part listings (vendor pricing cache)
create table public.part_listings (
  id uuid default uuid_generate_v4() primary key,
  part_id uuid references public.parts(id) on delete cascade not null,
  vendor text not null,
  vendor_item_id text,
  url text,
  price_usd numeric(10,2),
  shipping_usd numeric(10,2),
  seller_rating numeric(3,2),
  in_stock boolean,
  fetched_at timestamptz default now() not null
);

alter table public.part_listings enable row level security;
create policy "Listings inherit part access"
  on public.part_listings for all using (
    exists (
      select 1 from public.parts p
      join public.builds b on b.id = p.build_id
      where p.id = part_id and b.user_id = auth.uid()
    )
  );

-- Conversations (1-to-1 with builds)
create table public.conversations (
  id uuid default uuid_generate_v4() primary key,
  build_id uuid references public.builds(id) on delete cascade unique not null,
  user_id uuid references public.users(id) on delete cascade not null,
  created_at timestamptz default now() not null
);

alter table public.conversations enable row level security;
create policy "Users can manage own conversations"
  on public.conversations for all using (auth.uid() = user_id);

-- Messages
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now() not null
);

alter table public.messages enable row level security;
create policy "Messages inherit conversation access"
  on public.messages for all using (
    exists (
      select 1 from public.conversations
      where id = conversation_id and user_id = auth.uid()
    )
  );

-- Vector similarity index for build search
create index on public.builds using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
