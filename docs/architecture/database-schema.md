# Database Schema

All tables are PostgreSQL 17 with Row Level Security (RLS) enabled. The schema mirrors Supabase Auth's design and uses pgvector for embeddings.

## Tables Overview

```
users (mirrors auth.users)
  ├── id (PK, FK to auth.users)
  ├── email
  ├── display_name
  ├── avatar_url
  └── region

builds (user's projects)
  ├── id (PK, UUID)
  ├── user_id (FK to users)
  ├── title
  ├── donor_car
  ├── modification_goal
  ├── goals (text array)
  ├── image_url (public URL from Storage)
  ├── vision_data (JSONB from Claude/Gemini)
  ├── embedding (pgvector for semantic search)
  ├── status (enum)
  ├── is_public
  └── timestamps

parts (suggested or user-sourced parts)
  ├── id (PK, UUID)
  ├── build_id (FK to builds)
  ├── name
  ├── description
  ├── category (enum)
  ├── goal (which goal this part addresses)
  ├── price_estimate
  ├── vendor_url
  ├── is_safety_critical
  ├── status (needed, ordered, sourced, installed)
  └── timestamps

part_listings (vendor pricing cache)
  ├── id (PK, UUID)
  ├── part_id (FK to parts)
  ├── vendor
  ├── vendor_item_id
  ├── url
  ├── price_usd
  ├── shipping_usd
  ├── seller_rating
  ├── in_stock
  └── fetched_at

conversations (1-to-1 with builds)
  ├── id (PK, UUID)
  ├── build_id (FK, UNIQUE to builds)
  ├── user_id (FK to users)
  └── created_at

messages (conversation history)
  ├── id (PK, UUID)
  ├── conversation_id (FK to conversations)
  ├── role (user | assistant)
  ├── content
  └── created_at
```

## Detailed Tables

### users

Mirrors Supabase `auth.users` table. Automatically created via trigger on first sign-up.

| Column | Type | Constraints | Purpose |
|--------|------|-----------|---------|
| `id` | `uuid` | PK, FK to `auth.users(id)` ON DELETE CASCADE | User identifier from Supabase Auth |
| `email` | `text` | NOT NULL, UNIQUE | Email from OAuth provider |
| `display_name` | `text` | | Name from OAuth profile |
| `avatar_url` | `text` | | Avatar from OAuth profile |
| `region` | `text` | | User location (for mechanic matching) |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | When profile created |

**RLS Policies:**
- `Users can read own profile` — SELECT: `auth.uid() = id`
- `Users can update own profile` — UPDATE: `auth.uid() = id`

**Triggers:**
- `on_auth_user_created` — After INSERT on `auth.users`, auto-create user profile

### builds

User's car modification projects. Core entity that ties everything together.

| Column | Type | Constraints | Purpose |
|--------|------|-----------|---------|
| `id` | `uuid` | PK, DEFAULT uuid_generate_v4() | Build identifier |
| `user_id` | `uuid` | FK to `users(id)` ON DELETE CASCADE, NOT NULL | Build owner |
| `title` | `text` | NOT NULL | e.g., "2018 Civic K-Series Swap" |
| `donor_car` | `text` | | e.g., "2018 Honda Civic Hatchback" |
| `modification_goal` | `text` | | Primary goal (added in migration 20260405000000) |
| `goals` | `text[]` | DEFAULT '{}' | Multiple goals: ["tuning", "reliability", "track-ready"] |
| `engine_swap` | `text` | | Deprecated field (kept for compatibility) |
| `image_url` | `text` | | Public URL of uploaded car image from Storage |
| `vision_data` | `jsonb` | | JSON from Claude/Gemini vision analysis |
| `embedding` | `vector(1536)` | | pgvector embedding for semantic search |
| `status` | `text` | CHECK status IN (...) | 'planning', 'in_progress', 'complete' |
| `is_public` | `boolean` | DEFAULT false | Visible to all users if true |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last modification timestamp |

**RLS Policies:**
- `Users can manage own builds` — ALL: `auth.uid() = user_id`
- `Public builds are readable by all` — SELECT: `is_public = true`

**Triggers:**
- `builds_updated_at` — BEFORE UPDATE, sets `updated_at = now()`

**Indexes:**
- `(embedding vector_cosine_ops)` using ivfflat — For semantic search on vision data

### parts

Individual car parts suggested or sourced by the user. Always tied to a build.

| Column | Type | Constraints | Purpose |
|--------|------|-----------|---------|
| `id` | `uuid` | PK, DEFAULT uuid_generate_v4() | Part identifier |
| `build_id` | `uuid` | FK to `builds(id)` ON DELETE CASCADE, NOT NULL | Which build this is for |
| `name` | `text` | NOT NULL | e.g., "K20Z3 Engine" |
| `description` | `text` | | e.g., "Short block, fully built" (added in migration 20260407000000) |
| `category` | `text` | CHECK category IN (...) | 'engine', 'drivetrain', 'electrical', 'cooling', 'safety', 'other' |
| `goal` | `text` | | Which goal this part addresses (added in migration 20260407000000) |
| `price_estimate` | `numeric(10,2)` | | Estimated cost in USD (added in migration 20260407000000) |
| `vendor_url` | `text` | | Direct vendor link (added in migration 20260407000000) |
| `is_safety_critical` | `boolean` | DEFAULT false | Flag for brake, steering, chassis parts |
| `status` | `text` | CHECK status IN (...) | 'needed' (default), 'ordered', 'sourced', 'installed' |
| `notes` | `text` | | User notes on this part |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | When suggested |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | When status changed (added in migration 20260407000000) |

**RLS Policies:**
- `Parts inherit build access` — ALL: `EXISTS (SELECT 1 FROM builds WHERE id = build_id AND user_id = auth.uid())`

**Triggers:**
- `parts_updated_at` — BEFORE UPDATE, sets `updated_at = now()`

### part_listings

Vendor pricing cache. Allows showing multiple vendors for a single part.

| Column | Type | Constraints | Purpose |
|--------|------|-----------|---------|
| `id` | `uuid` | PK, DEFAULT uuid_generate_v4() | Listing identifier |
| `part_id` | `uuid` | FK to `parts(id)` ON DELETE CASCADE, NOT NULL | Which part this is from |
| `vendor` | `text` | NOT NULL | e.g., "Amazon", "eBay", "RockAuto" |
| `vendor_item_id` | `text` | | External ID on vendor platform |
| `url` | `text` | | Link to product page |
| `price_usd` | `numeric(10,2)` | | Current price |
| `shipping_usd` | `numeric(10,2)` | | Estimated shipping |
| `seller_rating` | `numeric(3,2)` | | 1.0–5.0 rating |
| `in_stock` | `boolean` | | Availability flag |
| `fetched_at` | `timestamptz` | NOT NULL, DEFAULT now() | When price was cached |

**RLS Policies:**
- `Listings inherit part access` — ALL: `EXISTS (SELECT 1 FROM parts p JOIN builds b ON b.id = p.build_id WHERE p.id = part_id AND b.user_id = auth.uid())`

### conversations

One-to-one relationship with builds. Stores chat history with the AI advisor.

| Column | Type | Constraints | Purpose |
|--------|------|-----------|---------|
| `id` | `uuid` | PK, DEFAULT uuid_generate_v4() | Conversation identifier |
| `build_id` | `uuid` | FK to `builds(id)` ON DELETE CASCADE, UNIQUE, NOT NULL | Which build is being discussed |
| `user_id` | `uuid` | FK to `users(id)` ON DELETE CASCADE, NOT NULL | Who owns this conversation |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | When conversation started |

**RLS Policies:**
- `Users can manage own conversations` — ALL: `auth.uid() = user_id`

### messages

Individual messages in a conversation. Interleaved user and assistant messages.

| Column | Type | Constraints | Purpose |
|--------|------|-----------|---------|
| `id` | `uuid` | PK, DEFAULT uuid_generate_v4() | Message identifier |
| `conversation_id` | `uuid` | FK to `conversations(id)` ON DELETE CASCADE, NOT NULL | Which conversation |
| `role` | `text` | NOT NULL, CHECK role IN ('user', 'assistant') | Who sent it |
| `content` | `text` | NOT NULL | Message text |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Timestamp |

**RLS Policies:**
- `Messages inherit conversation access` — ALL: `EXISTS (SELECT 1 FROM conversations WHERE id = conversation_id AND user_id = auth.uid())`

## Supabase Storage

### build-images Bucket

Public bucket for car photos. Objects are stored at `{user_id}/{build_id}.jpg` for easy partitioning.

| Setting | Value | Purpose |
|---------|-------|---------|
| Public | true | Anyone can read images (no auth required) |
| File size limit | 10 MiB | Reasonable for photos |
| Allowed MIME types | image/jpeg, image/png, image/webp | Standard formats |

**RLS Policies:**
1. `Public can view build images` — SELECT: `bucket_id = 'build-images'`
2. `Authenticated users can upload build images` — INSERT: `bucket_id = 'build-images' AND auth.uid()::text = (storage.foldername(name))[1]`
3. `Authenticated users can update their build images` — UPDATE: Same path check
4. `Authenticated users can delete their build images` — DELETE: Same path check

## Migrations Log

| File | Date | Changes |
|------|------|---------|
| `20260331034921_init_schema.sql` | 2026-03-31 | Initial schema: users, builds, parts, part_listings, conversations, messages, storage bucket |
| `20260405000000_add_modification_goal.sql` | 2026-04-05 | Add `modification_goal` column to builds |
| `20260405070000_create_build_images_bucket.sql` | 2026-04-05 | Create build-images storage bucket with RLS policies |
| `20260407000000_add_parts_detail_columns.sql` | 2026-04-07 | Add description, price_estimate, vendor_url, goal, updated_at to parts |

## Key Design Patterns

### Defense in Depth

Every operation has RLS enforced at **two levels:**

1. **FastAPI** filters queries by user_id before sending to Supabase
2. **Postgres** RLS policies enforce row-level access control

If one layer has a bug, the other prevents data leakage.

### Cascading Deletes

All foreign keys have `ON DELETE CASCADE`:
- Deleting a user deletes all their builds
- Deleting a build deletes all parts and conversations
- Deleting a part deletes all vendor listings

This keeps the database clean without orphaned rows.

### JSONB for Flexibility

`vision_data` on builds stores unstructured AI responses:
```json
{
  "recognized_car": "2018 Honda Civic",
  "condition": "excellent",
  "suggested_mods": ["lowering springs", "exhaust"],
  "market_value": "$18,500",
  "uniqueness": "sleeper potential"
}
```

This avoids forcing a rigid schema for every possible vision result.

### Eventual Consistency

Vision analysis runs in background, so:
- Image upload returns immediately with URL
- `vision_data` and parts are populated asynchronously
- Frontend polls the build endpoint until parts appear

This prevents API timeouts on slow AI providers.

## Future Extensions

**Planned but not yet implemented:**

1. **Mechanic profiles** — New table for mechanics, with reviews and verified hours
2. **Build team members** — Join table for collaborative builds (shared across multiple users)
3. **Part alternatives** — Link between parts suggesting "use X instead of Y"
4. **Cost tracking** — Actual spend vs estimate, payment history
5. **Embedding search** — Use `builds.embedding` vector to find similar builds for inspiration

See [Architecture Overview](./overview.md#todo-parts-generation-service) for in-progress work.
