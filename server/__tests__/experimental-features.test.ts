import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import * as database from '../db'
import { betaAccountState } from '../experimental-features'

let db: Awaited<ReturnType<typeof createTestDatabase>>
beforeEach(async () => {
  db = await createTestDatabase()
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  vi.stubEnv('DEV_EXPERIMENTAL_FEATURES', 'declared')
  vi.stubEnv('ADMIN_USERS', 'owner')
  for (const name of ['owner', 'beta', 'ordinary']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'hash',1)").run(name, name, name)
})
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await db?.close() })

describe('current account Beta Access', () => {
  it('reads grants on every check and derives administrators from ADMIN_USERS', async () => {
    expect(await betaAccountState('missing-account')).toEqual({ betaAccess: false })
    expect(await betaAccountState('ordinary')).toEqual({ betaAccess: false })
    expect(await betaAccountState('owner')).toEqual({ betaAccess: true })
    await db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run('beta', 'owner', 123)
    expect(await betaAccountState('beta')).toEqual({ betaAccess: true })
    await db.prepare('DELETE FROM beta_access WHERE user_id=?').run('beta')
    expect(await betaAccountState('beta')).toEqual({ betaAccess: false })
  })
  it('retains qualification when the grantor is deleted and cascades when its account is deleted', async () => {
    await db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run('beta', 'owner', 123)
    await db.prepare('DELETE FROM users WHERE id=?').run('owner')
    expect(await db.prepare('SELECT user_id,granted_by,granted_at FROM beta_access').all()).toEqual([{ user_id: 'beta', granted_by: null, granted_at: 123 }])
    expect(await betaAccountState('beta')).toEqual({ betaAccess: true })
    await db.prepare('DELETE FROM users WHERE id=?').run('beta')
    expect(await db.prepare('SELECT * FROM beta_access').all()).toEqual([])
  })
})
