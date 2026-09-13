-- The vehicle catalogue (ADR-010): shared reference data, not anyone's garage.
--
-- Keyed down to the generation because a representative image is only
-- representative of one generation — a 1992 and a 2022 Civic share a make and
-- a model and look nothing alike.

CREATE TABLE vehicleMakes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(50) NOT NULL CHECK (btrim(name) <> ''),
  createdAt  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique regardless of case, so "Nissan" and "nissan" cannot both exist.
CREATE UNIQUE INDEX uq_vehiclemakes_name ON vehicleMakes (lower(name));

CREATE TABLE vehicleModels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  makeId     UUID NOT NULL REFERENCES vehicleMakes(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL CHECK (btrim(name) <> ''),
  createdAt  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per make regardless of case. It leads with makeId, so it also serves
-- "models of this make" and no separate index on makeId is needed.
CREATE UNIQUE INDEX uq_vehiclemodels_make_name ON vehicleModels (makeId, lower(name));

CREATE TABLE vehicleGenerations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelId           UUID NOT NULL REFERENCES vehicleModels(id) ON DELETE CASCADE,
  code              VARCHAR(20),
  startYear         INTEGER NOT NULL CHECK (startYear BETWEEN 1885 AND 2030),
  endYear           INTEGER CHECK (endYear BETWEEN 1885 AND 2030),
  bodyStyle         VARCHAR NOT NULL
                    CHECK (bodyStyle IN
                      ('coupe', 'sedan', 'hatchback', 'wagon',
                       'convertible', 'suv', 'pickup', 'van')),
  imagePublicId     VARCHAR(255),
  imageAttribution  VARCHAR(255),
  imageLicense      VARCHAR(100),
  imageSourceUrl    VARCHAR(2048),
  createdAt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A null endYear is a generation still in production.
  CONSTRAINT vehiclegenerations_year_order
    CHECK (endYear IS NULL OR endYear >= startYear),

  -- The licences these images come under require credit. An image the row
  -- cannot attribute is an image we are not entitled to show, so it cannot be
  -- stored at all.
  CONSTRAINT vehiclegenerations_image_attributed
    CHECK (imagePublicId IS NULL
           OR (imageAttribution IS NOT NULL
               AND imageLicense IS NOT NULL
               AND imageSourceUrl IS NOT NULL))
);

CREATE INDEX idx_vehiclegenerations_modelid ON vehicleGenerations(modelId);
