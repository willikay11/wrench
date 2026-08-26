CREATE TABLE refreshtokens(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID NOT NULL,
    tokenHash VARCHAR NOT NULL,
    family VARCHAR NOT NULL,
    expiresAt TIMESTAMPTZ NOT NULL,
    createdAt TIMESTAMPTZ NOT NULL,
    updatedAt TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_user_token FOREIGN KEY (userId) REFERENCES users(id)
);