CREATE TABLE cars (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId      UUID NOT NULL REFERENCES users(id)
              ON DELETE CASCADE,
  make        VARCHAR(50) NOT NULL,
  model       VARCHAR(50) NOT NULL,
  year        INTEGER NOT NULL
              CHECK (year BETWEEN 1885 AND 2030),
  engine      VARCHAR(100) NOT NULL,
  usageType   VARCHAR NOT NULL
              CHECK (usageType IN
                ('daily', 'track', 'show',
                 'project', 'off-road', 'weekend')),
  notes       TEXT,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cars_userid ON cars(userId);