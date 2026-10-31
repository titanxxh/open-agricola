import { randomBytes } from 'node:crypto'
import { createAccountsPool } from '../../../operations/accounts-exporter'
import { provisionOperationsDatabase } from '../../../operations/database-access'
import type { PostgresDatabase } from '../../database/postgres'
import { getTestDatabaseUrl } from './postgres'

export async function createOperationsTestReader(db: PostgresDatabase) {
  const schema = (await db.query<{ schema: string }>('SELECT current_schema() AS schema')).rows[0]!.schema
  const role = `ops_${schema}`
  const input = { databaseUrl: getTestDatabaseUrl(), password: randomBytes(32).toString('hex'), schema, role }
  const access = await provisionOperationsDatabase(input)
  const pool = createAccountsPool(access.databaseUrl, access.schema)
  let closing: Promise<void> | undefined
  return {
    pool, role, schema,
    provision: () => provisionOperationsDatabase(input),
    close: () => closing ??= (async () => {
      await pool.end()
      await db.exec(`DROP OWNED BY ${role}`)
      await db.exec(`DROP ROLE ${role}`)
    })(),
  }
}
