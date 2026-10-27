ALTER TABLE rooms ADD COLUMN invited_user_ids JSONB;
ALTER TABLE rooms ADD CONSTRAINT rooms_invited_user_ids_array
  CHECK (invited_user_ids IS NULL OR (jsonb_typeof(invited_user_ids) = 'array'
    AND jsonb_array_length(invited_user_ids) BETWEEN 1 AND 5));
