ALTER TABLE refreshtokens DROP COLUMN revokedAt TIMESTAMPTZ;
ALTER TABLE refreshtokens DROP COLUMN family UUID NOT NULL;
ALTER TABLE refreshtokens DROP COLUMN userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

DROP INDEX idx_refreshtokens_userid;
DROP INDEX idx_refreshtokens_family;
DROP INDEX idx_refreshtokens_tokenhash;
