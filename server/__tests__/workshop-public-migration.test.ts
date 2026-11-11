import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { PostgresDatabase } from '../database/postgres'
import { createTestDatabase } from './_helpers/postgres'

let db: PostgresDatabase
beforeEach(async () => {
  db = await createTestDatabase()
  // Execute the actual upgrade SQL against the schema that existed before038.
  await db.exec(`
    DROP TRIGGER workshop_public_version ON workshop_cards;
    DROP TRIGGER IF EXISTS workshop_public_version_insert ON workshop_card_versions;
    DROP FUNCTION record_workshop_public_version();
    DROP FUNCTION IF EXISTS record_inserted_workshop_public_version();
    DROP TABLE workshop_public_versions;
    INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES ('author','author','Author','hash',1);
  `)
})
afterEach(async () => { await db.close() })

it('backfills only actual same-card public versions without blocking legacy dangling or cross-card bindings', async () => {
  await db.exec(`
    INSERT INTO workshop_cards(id,author_id,card_id,card_type,name,card_json,created_at,updated_at,review_status,live,approved_version_id)
    VALUES
      ('valid','author','CUSTOM_Valid','minor','Valid','{}',1,2,'approved',1,'valid-v1'),
      ('missing','author','CUSTOM_Missing','minor','Missing','{}',1,2,'approved',1,'missing-v1'),
      ('crossed','author','CUSTOM_Crossed','minor','Crossed','{}',1,2,'merged',1,'valid-v1'),
      ('private','author','CUSTOM_Private','minor','Private','{}',1,2,'approved',0,'private-v1');
    INSERT INTO workshop_card_versions(id,card_id,card_json,version_number,created_by,created_at)
    VALUES ('valid-v1','valid','{}',1,'author',1),('private-v1','private','{}',1,'author',1);
  `)
  await db.transaction(() => db.exec(readFileSync(new URL('../database/038-workshop-public-versions.sql', import.meta.url), 'utf8')))()
  expect(await db.prepare('SELECT version_id,card_id FROM workshop_public_versions ORDER BY card_id').all())
    .toEqual([{ version_id: 'valid-v1', card_id: 'valid' }])
  expect(await db.prepare("SELECT approved_version_id,live FROM workshop_cards WHERE id='missing'").get())
    .toEqual({ approved_version_id: 'missing-v1', live: 1 })
  await db.prepare("INSERT INTO workshop_card_versions(id,card_id,card_json,version_number,created_by,created_at) VALUES ('missing-v1','missing','{}',1,'author',1)").run()
  expect(await db.prepare("SELECT version_id,card_id FROM workshop_public_versions WHERE card_id='missing'").get())
    .toEqual({ version_id: 'missing-v1', card_id: 'missing' })
})
