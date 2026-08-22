ALTER TABLE emailOutbox ADD COLUMN nextAttemptAt TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP INDEX idx_emailoutbox_pending;
CREATE INDEX idx_emailoutbox_claimable ON emailOutbox (nextAttemptAt) WHERE status = 'pending';
