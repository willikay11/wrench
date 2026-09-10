CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    displayName VARCHAR NOT NULL,
    avatarUrl TEXT,
    email VARCHAR UNIQUE,
    status VARCHAR NOT NULL,
    lastLogin TIMESTAMPTZ,
    emailVerified BOOL DEFAULT false,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);