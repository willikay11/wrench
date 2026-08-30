ALTER TABLE refreshtokens ADD COLUMN revokedAt TIMESTAMPTZ;
ALTER TABLE refreshtokens ALTER COLUMN family TYPE UUID USING family::uuid;
ALTER TABLE refreshtokens DROP CONSTRAINT fk_user_token;
ALTER TABle refreshtokens ADD CONSTRAINT fk_user_token FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_refreshtokens_userid ON refreshTokens(userId);
CREATE INDEX idx_refreshtokens_family ON refreshTokens(family);
CREATE INDEX idx_refreshtokens_tokenhash ON refreshTokens(tokenHash);
