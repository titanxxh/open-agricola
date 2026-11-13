import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import * as database from '../db'
import { createTestDatabase } from './_helpers/postgres'
import { createSession, deleteAccount, login, requestAccountDeletion, updateDisplayName } from '../auth'

let db: Awaited<ReturnType<typeof createTestDatabase>> | undefined
afterEach(async () => { try { await db?.close() } finally { db = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs() } })

it('cannot create local credentials or profile changes for an external subject and can complete deletion without inventing credentials', async () => {
  db = await createTestDatabase()
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  const id = randomUUID(), username = `external_${id.slice(0, 8)}`
  await db.prepare(`INSERT INTO users(id,username,display_name,password_hash,created_at,identity_origin) VALUES(?,?,?,NULL,?,'external')`).run(id, username, 'External farmer', Date.now())
  await db.prepare('INSERT INTO prerelease_external_identities(user_id,source_grant_id,generation_id) VALUES(?,?,?)').run(id, randomUUID(), randomUUID())
  expect(await createSession(id)).toBeNull()
  expect(await login(username, 'password')).toMatchObject({ ok: false, code: 'invalid_login' })
  expect(await updateDisplayName(id, 'Untrusted local edit')).not.toBeNull()
  await requestAccountDeletion(id)
  expect(await db.prepare('SELECT display_name,password_hash,password_updated_at,email FROM users WHERE id=?').get(id)).toEqual({ display_name: 'External farmer', password_hash: null, password_updated_at: null, email: null })
  await deleteAccount(id, { db })
  expect(await db.prepare('SELECT id FROM users WHERE id=?').get(id)).toBeUndefined()
})
