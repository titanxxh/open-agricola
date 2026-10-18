import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { expect, it } from 'vitest'
import { getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { dropInvalidDatabases } from '../invalid-databases.mjs'

it('finishes a DROP DATABASE that was interrupted', async () => {
  const name = `invalid_${randomUUID().replaceAll('-', '')}`
  const client = new Client({ connectionString: getTestDatabaseUrl() })
  await client.connect()
  try {
    await client.query(`CREATE DATABASE "${name}"`)
    // PostgreSQL marks a database invalid when DROP DATABASE starts; a cancelled
    // DROP leaves exactly this row behind.
    await client.query('UPDATE pg_database SET datconnlimit = -2 WHERE datname = $1', [name])
    const logged: string[] = []

    const dropped = await dropInvalidDatabases(client, (message: string) => logged.push(message))

    expect(dropped).toContain(name)
    expect(logged).toContainEqual(expect.stringContaining(`"${name}"`))
    expect((await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount).toBe(0)
  } finally {
    try { await client.query(`DROP DATABASE IF EXISTS "${name}"`) } finally { await client.end() }
  }
}, 60_000)
