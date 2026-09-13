-- Starter catalogue: common enthusiast cars, and deliberately no images.
--
-- Year ranges are model-year spans across markets and are approximate at the
-- edges — a car can launch in Japan a year before it reaches the US. This file
-- is the one place to review them. A generation whose body style varied is
-- split where the split matters for a silhouette (the WRX STI hatch and sedan).
--
-- Images are absent on purpose. Sourcing them is a licensing decision
-- (ADR-010); until one is made, the garage shows a body-style silhouette.

BEGIN;

CREATE TEMP TABLE catalogue_seed (
  make       TEXT NOT NULL,
  model      TEXT NOT NULL,
  code       TEXT,
  startYear  INTEGER NOT NULL,
  endYear    INTEGER,
  bodyStyle  TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO catalogue_seed (make, model, code, startYear, endYear, bodyStyle) VALUES
  ('BMW',        'M3',               'E30',  1986, 1991, 'coupe'),
  ('BMW',        'M3',               'E36',  1992, 1999, 'coupe'),
  ('BMW',        'M3',               'E46',  2000, 2006, 'coupe'),
  ('BMW',        'M3',               'E92',  2007, 2013, 'coupe'),
  ('BMW',        'M3',               'F80',  2014, 2018, 'sedan'),
  ('BMW',        'M3',               'G80',  2021, NULL, 'sedan'),

  ('Chevrolet',  'Corvette',         'C5',   1997, 2004, 'coupe'),
  ('Chevrolet',  'Corvette',         'C6',   2005, 2013, 'coupe'),
  ('Chevrolet',  'Corvette',         'C7',   2014, 2019, 'coupe'),
  ('Chevrolet',  'Corvette',         'C8',   2020, NULL, 'coupe'),

  ('Ford',       'GT',               NULL,   2005, 2006, 'coupe'),
  ('Ford',       'GT',               NULL,   2017, 2022, 'coupe'),
  ('Ford',       'Mustang',          'S197', 2005, 2014, 'coupe'),
  ('Ford',       'Mustang',          'S550', 2015, 2023, 'coupe'),
  ('Ford',       'Mustang',          'S650', 2024, NULL, 'coupe'),

  ('Honda',      'Civic Type R',     'EK9',  1997, 2000, 'hatchback'),
  ('Honda',      'Civic Type R',     'EP3',  2001, 2005, 'hatchback'),
  ('Honda',      'Civic Type R',     'FN2',  2007, 2011, 'hatchback'),
  ('Honda',      'Civic Type R',     'FK2',  2015, 2017, 'hatchback'),
  ('Honda',      'Civic Type R',     'FK8',  2017, 2021, 'hatchback'),
  ('Honda',      'Civic Type R',     'FL5',  2022, NULL, 'hatchback'),
  ('Honda',      'S2000',            'AP1',  1999, 2003, 'convertible'),
  ('Honda',      'S2000',            'AP2',  2004, 2009, 'convertible'),

  ('Mazda',      'MX-5 Miata',       'NA',   1989, 1997, 'convertible'),
  ('Mazda',      'MX-5 Miata',       'NB',   1998, 2005, 'convertible'),
  ('Mazda',      'MX-5 Miata',       'NC',   2005, 2015, 'convertible'),
  ('Mazda',      'MX-5 Miata',       'ND',   2015, NULL, 'convertible'),
  ('Mazda',      'RX-7',             'FC',   1985, 1992, 'coupe'),
  ('Mazda',      'RX-7',             'FD',   1992, 2002, 'coupe'),
  ('Mazda',      'RX-8',             'SE3P', 2003, 2012, 'coupe'),

  ('MG',         'MGB',              NULL,   1962, 1980, 'convertible'),

  ('Mitsubishi', 'Lancer Evolution', 'VII',  2001, 2003, 'sedan'),
  ('Mitsubishi', 'Lancer Evolution', 'VIII', 2003, 2005, 'sedan'),
  ('Mitsubishi', 'Lancer Evolution', 'IX',   2005, 2007, 'sedan'),
  ('Mitsubishi', 'Lancer Evolution', 'X',    2007, 2016, 'sedan'),

  ('Nissan',     '350Z',             'Z33',  2002, 2009, 'coupe'),
  ('Nissan',     '370Z',             'Z34',  2009, 2020, 'coupe'),
  ('Nissan',     'GT-R',             'R35',  2007, NULL, 'coupe'),
  ('Nissan',     'Silvia',           'S14',  1993, 1998, 'coupe'),
  ('Nissan',     'Silvia',           'S15',  1999, 2002, 'coupe'),
  ('Nissan',     'Skyline GT-R',     'R32',  1989, 1994, 'coupe'),
  ('Nissan',     'Skyline GT-R',     'R33',  1995, 1998, 'coupe'),
  ('Nissan',     'Skyline GT-R',     'R34',  1999, 2002, 'coupe'),
  ('Nissan',     'Z',                'RZ34', 2022, NULL, 'coupe'),

  ('Porsche',    '911',              '996',  1997, 2005, 'coupe'),
  ('Porsche',    '911',              '997',  2004, 2012, 'coupe'),
  ('Porsche',    '911',              '991',  2011, 2019, 'coupe'),
  ('Porsche',    '911',              '992',  2019, NULL, 'coupe'),

  ('Subaru',     'BRZ',              'ZC6',  2012, 2020, 'coupe'),
  ('Subaru',     'BRZ',              'ZD8',  2021, NULL, 'coupe'),
  ('Subaru',     'WRX STI',          'GD',   2004, 2007, 'sedan'),
  ('Subaru',     'WRX STI',          'GR',   2008, 2014, 'hatchback'),
  ('Subaru',     'WRX STI',          'GV',   2011, 2014, 'sedan'),
  ('Subaru',     'WRX STI',          'VA',   2015, 2021, 'sedan'),

  ('Toyota',     '86',               'ZN6',  2012, 2021, 'coupe'),
  ('Toyota',     'GR86',             'ZN8',  2021, NULL, 'coupe'),
  ('Toyota',     'Supra',            'A80',  1993, 2002, 'coupe'),
  ('Toyota',     'Supra',            'A90',  2019, NULL, 'coupe'),

  ('Volkswagen', 'Golf GTI',         'Mk5',  2004, 2009, 'hatchback'),
  ('Volkswagen', 'Golf GTI',         'Mk6',  2009, 2013, 'hatchback'),
  ('Volkswagen', 'Golf GTI',         'Mk7',  2013, 2020, 'hatchback'),
  ('Volkswagen', 'Golf GTI',         'Mk8',  2020, NULL, 'hatchback');

INSERT INTO vehicleMakes (name)
  SELECT DISTINCT make FROM catalogue_seed
  ON CONFLICT DO NOTHING;

INSERT INTO vehicleModels (makeId, name)
  SELECT DISTINCT ma.id, s.model
  FROM catalogue_seed s
  JOIN vehicleMakes ma ON lower(ma.name) = lower(s.make)
  ON CONFLICT DO NOTHING;

INSERT INTO vehicleGenerations (modelId, code, startYear, endYear, bodyStyle)
  SELECT mo.id, s.code, s.startYear, s.endYear, s.bodyStyle
  FROM catalogue_seed s
  JOIN vehicleMakes ma  ON lower(ma.name) = lower(s.make)
  JOIN vehicleModels mo ON mo.makeId = ma.id AND lower(mo.name) = lower(s.model);

COMMIT;
