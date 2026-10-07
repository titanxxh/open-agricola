-- Match storage/card-art-key.ts. Absolute URLs are historical managed object
-- identities, never addresses to fetch. Preserve immutable snapshot contents.
CREATE OR REPLACE FUNCTION workshop_art_keys(art_url TEXT, generation_json TEXT DEFAULT '{}') RETURNS SETOF TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT DISTINCT (regexp_match(url,
    '^(?:https?://[A-Za-z0-9.-]+(?::[0-9]+)?)?(?:/(?!\.{1,2}/)[A-Za-z0-9._~-]+)*/(card-art/[A-Za-z0-9._-]+\.(?:png|jpg|jpeg|webp))$', 'i'))[1]
  FROM (
    SELECT art_url AS url
    UNION ALL SELECT value #>> '{}' FROM jsonb_path_query(
      generation_json::jsonb, 'strict $.** ? (@.type() == "string")') AS value
  ) urls
  WHERE url ~* '^(?:https?://[A-Za-z0-9.-]+(?::[0-9]+)?)?(?:/(?!\.{1,2}/)[A-Za-z0-9._~-]+)*/card-art/[A-Za-z0-9._-]+\.(?:png|jpg|jpeg|webp)$'
$$;

CREATE OR REPLACE FUNCTION maintain_workshop_art_reference() RETURNS trigger AS $$
DECLARE reference_id TEXT; reference_key TEXT; old_keys TEXT[] := '{}'; new_keys TEXT[];
BEGIN
  reference_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM object_references WHERE owner_kind = TG_TABLE_NAME AND owner_id = reference_id;
    RETURN NULL;
  END IF;
  new_keys := ARRAY(SELECT workshop_art_keys(NEW.art_url,
    CASE WHEN TG_TABLE_NAME = 'workshop_cards' THEN to_jsonb(NEW)->>'draft_generation_json' ELSE '{}' END));
  IF TG_OP = 'UPDATE' THEN
    old_keys := ARRAY(SELECT workshop_art_keys(OLD.art_url,
      CASE WHEN TG_TABLE_NAME = 'workshop_cards' THEN to_jsonb(OLD)->>'draft_generation_json' ELSE '{}' END));
  END IF;
  DELETE FROM object_references WHERE owner_kind = TG_TABLE_NAME AND owner_id = reference_id
    AND NOT (object_key = ANY(new_keys));
  -- Unchanged historical missing objects do not block unrelated draft edits.
  -- Every newly adopted key still goes through the ready/erasure admission gate.
  FOR reference_key IN SELECT key FROM unnest(new_keys) AS key WHERE NOT (key = ANY(old_keys)) ORDER BY key
  LOOP
    INSERT INTO object_references(owner_kind, owner_id, object_key)
      VALUES(TG_TABLE_NAME, reference_id, reference_key) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Protect all surviving images now. Already collected/removed objects need
-- verified recovery; a schema upgrade must not fabricate or resurrect bytes.
INSERT INTO object_references(owner_kind, owner_id, object_key)
SELECT refs.kind, refs.id, objects.object_key FROM (
  SELECT 'workshop_cards' AS kind, id, workshop_art_keys(art_url, draft_generation_json) AS key FROM workshop_cards
  UNION ALL
  SELECT 'workshop_card_versions', id, workshop_art_keys(art_url) FROM workshop_card_versions
) refs JOIN stored_objects objects ON objects.object_key = refs.key
WHERE objects.state = 'ready' AND NOT objects.blocked
ORDER BY objects.object_key
ON CONFLICT DO NOTHING;
