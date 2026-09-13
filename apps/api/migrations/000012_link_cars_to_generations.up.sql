-- Links a car to a catalogue generation (ADR-010). Nullable because a car the
-- catalogue does not know is still a car.
--
-- ON DELETE SET NULL: removing a catalogue entry loses the link, never the car.
-- The make, model and year the owner entered stay exactly as they were.
ALTER TABLE cars
  ADD COLUMN generationId UUID REFERENCES vehicleGenerations(id) ON DELETE SET NULL;

-- Serves the foreign key. Without it, deleting a generation scans every car to
-- find the rows to unlink.
CREATE INDEX idx_cars_generationid ON cars(generationId);
