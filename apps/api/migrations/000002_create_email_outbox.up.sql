CREATE TABLE emailOutbox (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient  VARCHAR NOT NULL,
  subject    VARCHAR NOT NULL,
  body       TEXT NOT NULL,
  status     VARCHAR NOT NULL DEFAULT 'pending',
  attempts   INT NOT NULL DEFAULT 0,
  lastError  TEXT,
  providerId VARCHAR,
  sentAt     TIMESTAMPTZ,
  createdAt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emailoutbox_pending ON emailOutbox (createdAt) WHERE status = 'pending';
