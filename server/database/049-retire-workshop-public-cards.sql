-- ADR 0052: the version-1 public Workshop card interface and its publication
-- registry are removed. No public version was ever recorded in production.
DROP TRIGGER IF EXISTS workshop_public_version_insert ON workshop_card_versions;
DROP TRIGGER IF EXISTS workshop_public_version ON workshop_cards;
DROP FUNCTION IF EXISTS record_inserted_workshop_public_version();
DROP FUNCTION IF EXISTS record_workshop_public_version();
DROP TABLE IF EXISTS workshop_public_versions;
