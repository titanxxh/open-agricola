import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { databaseMaintenance, getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { testStorageEnvironment } from '../../server/__tests__/_helpers/objects'
import { releaseAll } from '../../server/__tests__/_helpers/release-all'
import { PostgresDatabase } from '../../server/database/postgres'
import { S3ObjectStore } from '../../server/storage/s3-store'
import { archiveCommand } from '../storage-archive-cli'

const cleanups: (() => unknown)[] = []
afterEach(async () => { await releaseAll(cleanups.splice(0)); vi.restoreAllMocks() })
async function fixture() {
  const admin = databaseMaintenance(), name = `bootstrap_${randomUUID().replaceAll('-', '')}`
  await admin.exec(`CREATE DATABASE "${name}"`)
  const url = new URL(getTestDatabaseUrl()); url.pathname = `/${name}`
  const db = new PostgresDatabase({ connectionString: url.toString() }), prefix = `test/${randomUUID()}/`
  const env = { ...testStorageEnvironment(), DATABASE_URL: url.toString(), S3_PREFIX: prefix, GAME_BUILD_ID: 'c'.repeat(40) }
  const objects = S3ObjectStore.fromEnv(env)
  cleanups.push(() => releaseAll([() => objects.clearPrefix(), () => objects.close(), () => db.close(),
    () => admin.exec(`DROP DATABASE IF EXISTS "${name}"`), () => admin.close()]))
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  return { db, objects, env, output, check: () => archiveCommand(['check-empty', env.GAME_BUILD_ID, '--applications-stopped'], env) }
}

it('proves new PostgreSQL and S3 targets empty without migrations or ledger writes, then uses existing check-live initialization', async () => {
  const value = await fixture()
  await value.check()
  expect(value.output).toHaveBeenCalledWith(expect.stringContaining('"targetBuildId"'))
  expect(await value.db.prepare("SELECT to_regclass('users') AS users").get()).toEqual({ users: null })
  expect(await value.objects.get('erasure/ledger.json')).toBeNull()
  await archiveCommand(['check-live', value.env.GAME_BUILD_ID, '--applications-stopped'], value.env)
  expect(await value.db.prepare('SELECT count(*) AS count FROM users').get()).toEqual({ count: 0 })
  await expect(value.check()).rejects.toThrow('empty target database')
}, 30000)

it.each(['table', 'sequence', 'foreign-schema'])('rejects retained PostgreSQL %s before writing migrations or changing data', async kind => {
  const value = await fixture()
  if (kind === 'foreign-schema') await value.db.exec('CREATE SCHEMA retained; CREATE TABLE retained.sentinel(value text); INSERT INTO retained.sentinel VALUES (\'keep\')')
  else await value.db.exec(kind === 'table' ? 'CREATE TABLE sentinel(value text); INSERT INTO sentinel VALUES (\'keep\')' : 'CREATE SEQUENCE sentinel')
  await expect(value.check()).rejects.toThrow('empty target database')
  expect(await value.db.prepare("SELECT to_regclass('users') AS users").get()).toEqual({ users: null })
  if (kind !== 'sequence') expect(await value.db.prepare(`SELECT value FROM ${kind === 'foreign-schema' ? 'retained.' : ''}sentinel`).all()).toEqual([{ value: 'keep' }])
})

it.each(['card-art/retained', 'erasure/ledger.json'])('rejects existing S3 key %s without overwriting bytes or creating application tables', async key => {
  const value = await fixture(), body = Buffer.from(key === 'erasure/ledger.json' ? '{"version":1,"batches":[]}' : 'keep')
  await value.objects.putImmutable(key, body, 'application/octet-stream')
  await expect(value.check()).rejects.toThrow('empty object namespace')
  expect((await value.objects.get(key))?.body).toEqual(body)
  expect(await value.db.prepare("SELECT to_regclass('users') AS users").get()).toEqual({ users: null })
})

it.each([
  ['missing empty evidence', 200, '<ListBucketResult/>'],
  ['unknown truncation', 200, '<ListBucketResult><KeyCount>0</KeyCount></ListBucketResult>'],
  ['permission denied', 403, '<Error><Code>AccessDenied</Code></Error>'],
])('fails closed on S3 %s rather than treating an unknown listing as empty', async (_name, status, body) => {
  const server = createServer((_request, response) => { response.writeHead(Number(status), { 'Content-Type': 'application/xml' }); response.end(body) })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  cleanups.push(() => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()) }))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  const objects = S3ObjectStore.fromEnv({ ...testStorageEnvironment(), S3_ENDPOINT: `http://127.0.0.1:${address.port}` })
  cleanups.push(() => objects.close())
  await expect(objects.assertEmpty()).rejects.toThrow()
})
