-- Record publication at the existing write boundary. Public reads never create
-- versions or infer publication from author access to private version history.
CREATE TABLE workshop_public_versions (
  version_id TEXT PRIMARY KEY REFERENCES workshop_card_versions(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
  published_at BIGINT NOT NULL,
  disabled_at BIGINT
);
CREATE INDEX workshop_public_versions_card ON workshop_public_versions(card_id);

-- Historical approval bindings were not foreign keys. A missing or other-card
-- version cannot become public proof and must not block application startup.
INSERT INTO workshop_public_versions(version_id,card_id,published_at)
SELECT version.id,card.id,card.updated_at FROM workshop_cards card
JOIN workshop_card_versions version ON version.id=card.approved_version_id AND version.card_id=card.id
WHERE card.live=1 AND card.review_status IN ('approved','merged');

CREATE FUNCTION record_workshop_public_version() RETURNS trigger AS $$
BEGIN
  INSERT INTO workshop_public_versions(version_id,card_id,published_at)
  SELECT version.id,NEW.id,NEW.updated_at FROM workshop_card_versions version
  WHERE NEW.live=1 AND NEW.review_status IN ('approved','merged')
    AND version.id=NEW.approved_version_id AND version.card_id=NEW.id
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER workshop_public_version AFTER INSERT OR UPDATE OF live,review_status,approved_version_id ON workshop_cards
FOR EACH ROW EXECUTE FUNCTION record_workshop_public_version();

-- Controlled imports load cards before their version rows. Register only when
-- the actual version arrives and its same-card publication is still current.
CREATE FUNCTION record_inserted_workshop_public_version() RETURNS trigger AS $$
BEGIN
  INSERT INTO workshop_public_versions(version_id,card_id,published_at)
  SELECT NEW.id,card.id,card.updated_at FROM workshop_cards card
  WHERE card.id=NEW.card_id AND card.approved_version_id=NEW.id
    AND card.live=1 AND card.review_status IN ('approved','merged')
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER workshop_public_version_insert AFTER INSERT ON workshop_card_versions
FOR EACH ROW EXECUTE FUNCTION record_inserted_workshop_public_version();
