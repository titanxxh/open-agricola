CREATE OR REPLACE FUNCTION validate_object_reference() RETURNS trigger AS $$
DECLARE object_state TEXT; object_blocked BOOLEAN;
BEGIN
  SELECT state, blocked INTO object_state, object_blocked FROM stored_objects WHERE object_key = NEW.object_key FOR UPDATE;
  IF object_state IS DISTINCT FROM 'ready' OR object_blocked THEN
    RAISE EXCEPTION 'Object is not ready: %', NEW.object_key USING ERRCODE = '23514', CONSTRAINT = 'object_reference_ready';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A saved generation candidate is also a durable reference, even before the
-- author adopts it as the current art. Traverse nested history/reference lists.
CREATE OR REPLACE FUNCTION maintain_workshop_art_reference() RETURNS trigger AS $$
DECLARE reference_id TEXT; reference_key TEXT; urls TEXT[];
BEGIN
  reference_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  DELETE FROM object_references WHERE owner_kind = TG_TABLE_NAME AND owner_id = reference_id;
  IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
  urls := ARRAY[NEW.art_url];
  IF TG_TABLE_NAME = 'workshop_cards' THEN
    urls := urls || ARRAY(SELECT value #>> '{}' FROM jsonb_path_query(
      NEW.draft_generation_json::jsonb, 'strict $.** ? (@.type() == "string")') AS value);
  END IF;
  FOR reference_key IN SELECT DISTINCT substring(url FROM 2) FROM unnest(urls) AS url
    WHERE url LIKE '/card-art/%' ORDER BY 1
  LOOP
    INSERT INTO object_references(owner_kind, owner_id, object_key)
      VALUES(TG_TABLE_NAME, reference_id, reference_key);
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER workshop_art_reference ON workshop_cards;
CREATE TRIGGER workshop_art_reference AFTER INSERT OR UPDATE OF art_url, draft_generation_json OR DELETE ON workshop_cards
  FOR EACH ROW EXECUTE FUNCTION maintain_workshop_art_reference();
UPDATE workshop_cards SET draft_generation_json = draft_generation_json;
