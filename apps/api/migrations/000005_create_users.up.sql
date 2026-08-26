CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    displayName VARCHAR NOT NULL,
    avatarUrl TEXT,
    email VARCHAR UNIQUE,
    status VARCHAR NOT NULL,
    lastLogin TIMESTAMPTZ NOT NULL,
    createdAt TIMESTAMPTZ NOT NULL,
    updatedAt TIMESTAMPTZ NOT NULL
);