-- Record publication at the existing write boundary. Public reads never create
-- versions or infer publication from author access to private version history.
CREATE TABLE workshop_public_versions (
  version_id TEXT PRIMARY KEY REFERENCES workshop_card_versions(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
  published_at BIGINT NOT NULL,
  disabled_at BIGINT
);
CREATE INDEX workshop_public_versions_card ON workshop_public_versions(card_id);

INSERT INTO workshop_public_versions(version_id,card_id,published_at)
SELECT approved_version_id,id,updated_at FROM workshop_cards
WHERE live=1 AND review_status IN ('approved','merged') AND approved_version_id IS NOT NULL;

CREATE FUNCTION record_workshop_public_version() RETURNS trigger AS $$
BEGIN
  IF NEW.live=1 AND NEW.review_status IN ('approved','merged') AND NEW.approved_version_id IS NOT NULL THEN
    INSERT INTO workshop_public_versions(version_id,card_id,published_at)
    VALUES (NEW.approved_version_id,NEW.id,NEW.updated_at) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER workshop_public_version AFTER INSERT OR UPDATE OF live,review_status,approved_version_id ON workshop_cards
FOR EACH ROW EXECUTE FUNCTION record_workshop_public_version();
