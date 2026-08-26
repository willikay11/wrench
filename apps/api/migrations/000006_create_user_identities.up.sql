CREATE TABLE useridentities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID NOT NULL,
    provider VARCHAR NOT NULL,
    providerEmail VARCHAR NOT NULL,
    providerData JSONB,
    providerUserId VARCHAR,
    createdAt TIMESTAMPTZ NOT NULL,
    updatedAt TIMESTAMPTZ NOT NULL,
    CONSTRAINT UC_PROVIDER_USER UNIQUE(provider,providerUserId),
    CONSTRAINT fk_user_identity FOREIGN KEY (userId) REFERENCES users(id)
);