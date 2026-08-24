DROP INDEX IF EXISTS idx_emailoutbox_claimable;
ALTER TABLE emailOutbox DROP COLUMN nextAttemptAt;
CREATE INDEX idx_emailoutbox_pending ON emailOutbox (createdAt) WHERE status = 'pending';
