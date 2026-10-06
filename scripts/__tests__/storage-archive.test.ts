import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { vi, afterEach, expect, it } from 'vitest'

// Native database/S3 and child-process operations also run under full-suite load.
vi.setConfig({ testTimeout: 30000, hookTimeout: 180000 })
import { importFixture } from './_helpers/import-fixture'
import { importSqlite } from '../sqlite-import/import'
import { exportStorageArchive, restoreStorageArchive } from '../storage-archive'
import { validateArchiveInIsolation } from '../storage-archive-cli'
import { getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { testStorageEnvironment } from '../../server/__tests__/_helpers/objects'
import { PostgresDatabase } from '../../server/database/postgres'
import { S3ObjectStore } from '../../server/storage/s3-store'
import { PostgresRoomPersistence } from '../../server/game/persistence/postgres-adapter'
import { snapshotToRoom } from '../../server/game/room'
import { assertStorageReady } from '../../server/db'
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); cleanups.length = 0 })
it('round-trips native PostgreSQL recovery bytes and private S3 objects, then applies newer erasure facts', async () => {
  const fixture = await importFixture(); cleanups.push(() => fixture.close())
  await importSqlite(fixture.paths, fixture.db, fixture.resources)
  const archive = join(fixture.paths.cardArt, '..', 'archive')
  const manifest = await exportStorageArchive(getTestDatabaseUrl(), fixture.db, fixture.resources.objects, archive, 'test-build')
  const admin = new PostgresDatabase({ connectionString: getTestDatabaseUrl(), max: 1, statement_timeout: 120_000 })
  cleanups.push(() => admin.close())
  const makeTarget = async (schema = manifest.schema) => {
    const name = `backup_${randomUUID().replaceAll('-', '')}`
    await admin.exec(`CREATE DATABASE "${name}"`)
    const url = new URL(getTestDatabaseUrl()); url.pathname = `/${name}`
    const db = new PostgresDatabase({ connectionString: url.toString(), schema })
    const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
    cleanups.push(async () => { await objects.clearPrefix(); objects.close(); await db.close(); await admin.exec(`DROP DATABASE "${name}"`) })
    return { db, objects, url: url.toString() }
  }
  const target = await makeTarget()
  const result = await restoreStorageArchive(target.url, target.db, target.objects, archive, [])
  expect(result.validation).toMatchObject({ roomCount: 1, replayCount: 1, replayStepCount: 4, retainedObjectCount: 3 })
  const query = "SELECT state_json FROM rooms WHERE id='recorded'"
  expect(await target.db.prepare(query).get()).toEqual(await fixture.db.prepare(query).get())
  const steps = 'SELECT payload_gzip, frame_hash FROM game_replay_steps ORDER BY step_no'
  expect(await target.db.prepare(steps).all()).toEqual(await fixture.db.prepare(steps).all())
  const room = snapshotToRoom((await new PostgresRoomPersistence(target.db).load('recorded'))!)
  expect(room.session.undoStep().ok).toBe(true); room.session.dispose()
  await expect(restoreStorageArchive(target.url, target.db, target.objects, archive, [])).rejects.toThrow('empty target')
  const erased = await makeTarget()
  const newerLedger = [{ version: 1 as const, entries: [{ version: 1 as const, roomId: 'recorded', reason: 'legal' as const, removedAt: Date.now(), eraseResult: false, assetHashes: [] }], assetTakedowns: [] }]
  expect((await restoreStorageArchive(erased.url, erased.db, erased.objects, archive, newerLedger)).validation.roomCount).toBe(0)
  // Production uses public, whose schema already exists in a newly created DB.
  await target.db.exec('CREATE SCHEMA extensions; ALTER EXTENSION citext SET SCHEMA extensions; DROP SCHEMA public')
  await target.db.exec(`ALTER SCHEMA "${manifest.schema}" RENAME TO public`)
  const publicDb = new PostgresDatabase({ connectionString: target.url })
  cleanups.push(() => publicDb.close())
  await publicDb.exec('ALTER EXTENSION citext SET SCHEMA public; DROP SCHEMA extensions')
  const publicArchive = join(fixture.root, 'public-archive')
  await exportStorageArchive(target.url, publicDb, target.objects, publicArchive, 'test-public-build')
  const publicTarget = await makeTarget('public')
  expect((await restoreStorageArchive(publicTarget.url, publicTarget.db, publicTarget.objects, publicArchive, [])).validation.replayStepCount).toBe(4)
  // Compose supplies an empty optional URL for self-hosted deployments.
  expect(await validateArchiveInIsolation(publicArchive, {
    ...testStorageEnvironment(), DATABASE_URL: target.url, VALIDATION_DATABASE_URL: '', GAME_BUILD_ID: 'blank-url-check',
  })).toMatchObject({ targetBuildId: 'blank-url-check', roomCount: 1, replayStepCount: 4 })
  // A valid native dump with incomplete resources is refused by target-build validation.
  const incomplete = await makeTarget()
  const index = JSON.parse(await readFile(join(archive, 'archive.json'), 'utf8'))
  index.objects = index.objects.filter((item: { key: string }) => !item.key.endsWith('index.html'))
  await writeFile(join(archive, 'archive.json'), JSON.stringify(index))
  await expect(restoreStorageArchive(incomplete.url, incomplete.db, incomplete.objects, archive, [])).rejects.toThrow(/resource|viewer/i)
  await expect(assertStorageReady(incomplete.db)).rejects.toThrow('has not passed validation')
}, 30000)
