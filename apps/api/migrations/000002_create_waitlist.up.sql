-- Waitlist signups from the marketing landing page.
--
-- Naming follows /docs/schema.md: camelCase columns, UUID primary key,
-- createdAt/updatedAt on every table. Note that Postgres folds unquoted
-- identifiers to lowercase, so "updatedAt" and "updatedat" are the same
-- column — just never quote them and it stays consistent.

CREATE TABLE IF NOT EXISTS waitlist (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email     VARCHAR NOT NULL UNIQUE,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The UNIQUE constraint above already creates an index on email, which is
-- what the ON CONFLICT (email) clause in the repository needs.
