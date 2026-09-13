-- Removes the starter makes; their models and generations cascade with them.
-- Cars linked to a removed generation keep their make, model and year and lose
-- only the link (ON DELETE SET NULL on cars.generationId, from WRE-265).
DELETE FROM vehicleMakes
WHERE lower(name) IN (
  'bmw', 'chevrolet', 'ford', 'honda', 'mazda', 'mg', 'mitsubishi',
  'nissan', 'porsche', 'subaru', 'toyota', 'volkswagen'
);
