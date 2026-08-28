CREATE TABLE refreshtokens(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID NOT NULL,
    tokenHash VARCHAR NOT NULL,
    family VARCHAR NOT NULL,
    expiresAt TIMESTAMPTZ NOT NULL,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user_token FOREIGN KEY (userId) REFERENCES users(id)
);