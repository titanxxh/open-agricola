import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PostgresDatabase } from '../database/postgres'
import { databaseMaintenance, getTestDatabaseUrl } from './_helpers/postgres'

const name = `timeout_${randomUUID().replaceAll('-', '')}`
const admin = databaseMaintenance()

// Database creation and removal wait for cluster checkpoints independently of
// the connection setting being tested. Keep that I/O outside the assertion budget.
beforeAll(async () => {
  await admin.exec(`CREATE DATABASE "${name}"`)
  await admin.exec(`ALTER DATABASE "${name}" SET statement_timeout = '5s'`)
}, 300_000)

afterAll(async () => {
  try { await admin.exec(`DROP DATABASE IF EXISTS "${name}"`) } finally { await admin.close() }
}, 300_000)

it('disables a database default statement timeout on maintenance connections', async () => {
  const url = new URL(getTestDatabaseUrl())
  url.pathname = `/${name}`
  const show = async (db: PostgresDatabase) => {
    try { return (await db.prepare('SHOW statement_timeout').get<{ statement_timeout: string }>())!.statement_timeout }
    finally { await db.close() }
  }

  expect(await show(databaseMaintenance(url.toString()))).toBe('0')
  expect(await show(new PostgresDatabase({ connectionString: url.toString(), max: 1 }))).toBe('30s')
}, 60_000)
