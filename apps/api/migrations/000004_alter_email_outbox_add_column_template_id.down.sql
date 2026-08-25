ALTER TABLE emailOutbox DROP COLUMN templateId;
ALTER TABLE emailOutbox DROP COLUMN templateVariables;
ALTER TABLE emailOutbox ADD COLUMN body TEXT NOT NULL DEFAULT '';