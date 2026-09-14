-- A car's photo (FR-35), stored per ADR-007: the image lives in Cloudinary and
-- the database holds the reference to it.
--
-- photoUrls is the central table schema.md plans for every kind of photo, so a
-- future move off Cloudinary rewrites references in one place. It carries the
-- public id as well as the URL because users' photos are delivered through
-- signed URLs built per request, and a signature is computed from the public id.
CREATE TABLE photoUrls (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url        VARCHAR NOT NULL,
  publicId   VARCHAR(255) NOT NULL UNIQUE,
  width      INTEGER CHECK (width > 0),
  height     INTEGER CHECK (height > 0),
  createdAt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE carPhotos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        VARCHAR NOT NULL CHECK (type IN ('primary')),
  carId       UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  photoUrlId  UUID NOT NULL REFERENCES photoUrls(id) ON DELETE CASCADE,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One primary photo per car, held by the database as well as the application.
-- Partial, so a later photo type (a gallery) is not limited to one per car.
CREATE UNIQUE INDEX uq_carphotos_primary ON carPhotos(carId) WHERE type = 'primary';

CREATE INDEX idx_carphotos_carid ON carPhotos(carId);
