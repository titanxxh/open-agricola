CREATE TABLE stored_objects (
  object_key TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('staging', 'ready', 'deleting', 'deleted', 'removed')),
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  retain_until BIGINT NOT NULL,
  claim_token TEXT,
  claim_until BIGINT,
  updated_at BIGINT NOT NULL
);
CREATE INDEX stored_objects_gc ON stored_objects(state, retain_until);
CREATE TABLE object_references (
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  object_key TEXT NOT NULL REFERENCES stored_objects(object_key),
  PRIMARY KEY(owner_kind, owner_id, object_key)
);
CREATE INDEX object_references_key ON object_references(object_key);
CREATE TABLE replay_viewer_builds (
  build_id TEXT PRIMARY KEY,
  manifest_text TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- Reference admission and collection take the same object-row lock. A prepared
-- deletion can never gain a reference while an S3 operation is in flight.
CREATE FUNCTION validate_object_reference() RETURNS trigger AS $$
DECLARE object_state TEXT; object_blocked BOOLEAN;
BEGIN
  SELECT state, blocked INTO object_state, object_blocked FROM stored_objects WHERE object_key = NEW.object_key FOR UPDATE;
  IF object_state IS DISTINCT FROM 'ready' OR object_blocked THEN
    RAISE EXCEPTION 'Object is not ready: %', NEW.object_key USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER object_reference_ready BEFORE INSERT OR UPDATE ON object_references
  FOR EACH ROW EXECUTE FUNCTION validate_object_reference();

CREATE FUNCTION maintain_workshop_art_reference() RETURNS trigger AS $$
DECLARE reference_id TEXT; reference_key TEXT;
BEGIN
  reference_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  DELETE FROM object_references WHERE owner_kind = TG_TABLE_NAME AND owner_id = reference_id;
  IF TG_OP != 'DELETE' AND NEW.art_url LIKE '/card-art/%' THEN
    reference_key := substring(NEW.art_url FROM 2);
    INSERT INTO object_references(owner_kind, owner_id, object_key)
      VALUES(TG_TABLE_NAME, reference_id, reference_key);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER workshop_art_reference AFTER INSERT OR UPDATE OF art_url OR DELETE ON workshop_cards
  FOR EACH ROW EXECUTE FUNCTION maintain_workshop_art_reference();
CREATE TRIGGER workshop_version_art_reference AFTER INSERT OR UPDATE OF art_url OR DELETE ON workshop_card_versions
  FOR EACH ROW EXECUTE FUNCTION maintain_workshop_art_reference();

CREATE FUNCTION release_replay_objects() RETURNS trigger AS $$
BEGIN
  DELETE FROM object_references WHERE owner_kind = 'replay' AND owner_id = OLD.room_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER replay_objects_deleted AFTER DELETE ON game_replays
  FOR EACH ROW EXECUTE FUNCTION release_replay_objects();
