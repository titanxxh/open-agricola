import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { vi, afterEach, beforeEach, expect, it } from 'vitest'

// Multiple native dump/restore containers also run on ARM hosts under full-suite load.
// Keep all byte-integrity assertions; allow the complete restore sequence to finish.
vi.setConfig({ testTimeout: 120000, hookTimeout: 180000 })
import { importFixture } from './_helpers/import-fixture'
import { importSqlite } from '../sqlite-import/import'
import { exportStorageArchive, restoreStorageArchive } from '../storage-archive'
import { validateArchiveInIsolation } from '../storage-archive-cli'
import { databaseMaintenance, getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { releaseAll, releaseQueue } from '../../server/__tests__/_helpers/release-all'
import { testStorageEnvironment } from '../../server/__tests__/_helpers/objects'
import { PostgresDatabase } from '../../server/database/postgres'
import { S3ObjectStore } from '../../server/storage/s3-store'
import { PostgresRoomPersistence } from '../../server/game/persistence/postgres-adapter'
import { snapshotToRoom } from '../../server/game/room'
import { RoomDirectory } from '../../server/game/room-directory'
import { assertStorageReady } from '../../server/db'
// A timed-out test body keeps running and may register more cleanups during or
// after teardown, so every cleanup is self-contained and runs even after a failure.
let cleanups = releaseQueue()
beforeEach(() => { cleanups = releaseQueue() })
afterEach(async () => {
  try { await cleanups.release() } finally { vi.unstubAllEnvs() }
})
const dropDatabase = async (name: string) => {
  const admin = databaseMaintenance()
  try { await admin.exec(`DROP DATABASE IF EXISTS "${name}"`) } finally { await admin.close() }
}
it('round-trips native PostgreSQL recovery bytes and private S3 objects, then applies newer erasure facts', async () => {
  const fixture = await importFixture(); cleanups.register(() => fixture.close())
  await importSqlite(fixture.paths, fixture.db, fixture.resources)
  const archive = join(fixture.paths.cardArt, '..', 'archive')
  const manifest = await exportStorageArchive({ connectionString: getTestDatabaseUrl(), db: fixture.db, objects: fixture.resources.objects, root: archive, sourceBuildId: 'test-build', mode: 'maintenance', signal: new AbortController().signal })
  expect((await readdir(archive)).filter(name => name.startsWith('.pg-client-'))).toEqual([])
  const admin = databaseMaintenance()
  cleanups.register(() => admin.close())
  const makeTarget = async (schema = manifest.schema) => {
    const name = `backup_${randomUUID().replaceAll('-', '')}`
    await admin.exec(`CREATE DATABASE "${name}"`)
    const url = new URL(getTestDatabaseUrl()); url.pathname = `/${name}`
    const db = new PostgresDatabase({ connectionString: url.toString(), schema })
    const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
    cleanups.register(() => releaseAll([() => objects.clearPrefix(), () => objects.close(), () => db.close(), () => dropDatabase(name)]))
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
  cleanups.register(() => publicDb.close())
  await publicDb.exec('ALTER EXTENSION citext SET SCHEMA public; DROP SCHEMA extensions')
  const publicArchive = join(fixture.root, 'public-archive')
  await exportStorageArchive({ connectionString: target.url, db: publicDb, objects: target.objects, root: publicArchive, sourceBuildId: 'test-public-build', mode: 'maintenance', signal: new AbortController().signal })
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
}, 120000)

it('expires restored runtime routes so a new generation can immediately recover the same room', async () => {
  const fixture = await importFixture(); cleanups.register(() => fixture.close())
  await importSqlite(fixture.paths, fixture.db, fixture.resources)
  const sourceDirectory = new RoomDirectory(fixture.db)
  await sourceDirectory.register('snapshot-source', 'http://127.0.0.1:5181', 'snapshot-build')
  await sourceDirectory.activate('snapshot-source')
  const sourceRoute = await sourceDirectory.claim('recorded', 'snapshot-source')
  const lease = Date.now() + 3600000
  const allocationId = randomUUID()
  await fixture.db.prepare('INSERT INTO room_allocations(actor_id,allocation_id,room_id,expires_at) VALUES (?,?,?,?)')
    .run('u1', allocationId, 'recorded', lease)
  await fixture.db.prepare('UPDATE app_instances SET lease_until=?').run(lease)
  await fixture.db.prepare('UPDATE room_ownership SET lease_until=?, admission_until=?').run(lease, lease)
  const archive = join(fixture.root, 'online-leases')
  const manifest = await exportStorageArchive({ connectionString: getTestDatabaseUrl(), db: fixture.db,
    objects: fixture.resources.objects, root: archive, sourceBuildId: 'snapshot-build', mode: 'online',
    signal: new AbortController().signal, deadlineEpochMs: Date.now() + 60000 })
  const admin = databaseMaintenance(); cleanups.register(() => admin.close())
  const name = `backup_${randomUUID().replaceAll('-', '')}`
  await admin.exec(`CREATE DATABASE "${name}"`)
  const url = new URL(getTestDatabaseUrl()); url.pathname = `/${name}`
  const target = new PostgresDatabase({ connectionString: url.toString(), schema: manifest.schema })
  const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
  cleanups.register(() => releaseAll([() => objects.clearPrefix(), () => objects.close(), () => target.close(), () => dropDatabase(name)]))
  const restored = await restoreStorageArchive(url.toString(), target, objects, archive, [])
  expect(restored.validation).toMatchObject({ roomCount: 1, replayCount: 1, replayStepCount: 4 })
  expect(await target.prepare('SELECT state_json FROM rooms WHERE id=?').get('recorded'))
    .toEqual(await fixture.db.prepare('SELECT state_json FROM rooms WHERE id=?').get('recorded'))
  expect(await target.prepare('SELECT payload_gzip, frame_hash FROM game_replay_steps ORDER BY step_no').all())
    .toEqual(await fixture.db.prepare('SELECT payload_gzip, frame_hash FROM game_replay_steps ORDER BY step_no').all())
  expect(await target.prepare('SELECT room_id,user_id,player_index,joined_at FROM room_players').all())
    .toEqual([{ room_id: 'recorded', user_id: 'u1', player_index: 0, joined_at: 1 }])
  expect(await target.prepare('SELECT instance_id,status,lease_until FROM app_instances').all())
    .toEqual([{ instance_id: 'snapshot-source', status: 'stopped', lease_until: 0 }])
  expect(await target.prepare('SELECT room_id,instance_id,epoch,status,lease_until,admission_until FROM room_ownership').all())
    .toEqual([{ room_id: 'recorded', instance_id: 'snapshot-source', epoch: 1, status: 'reserved', lease_until: 0, admission_until: 0 }])
  const targetDirectory = new RoomDirectory(target)
  await targetDirectory.register('restored-target', 'http://127.0.0.1:5181', 'next-build')
  await targetDirectory.activate('restored-target')
  const targetRoute = await targetDirectory.claim('recorded', 'restored-target')
  expect(targetRoute).toEqual({
    roomId: 'recorded', owner: { instanceId: 'restored-target', epoch: sourceRoute.owner.epoch + 1 }, wsPath: '/nodes/restored-target/ws',
  })
  expect(await targetDirectory.allocate('u1', allocationId)).toEqual({ ...targetRoute, allocationId })
  expect(await fixture.db.prepare('SELECT status,lease_until FROM app_instances').get()).toEqual({ status: 'ready', lease_until: lease })
})

it('cancels a maintenance native dump and waits for its child to stop before rejecting', async () => {
  const fixture = await importFixture(); cleanups.register(() => fixture.close())
  const bin = join(fixture.root, 'bin'), ready = join(fixture.root, 'dump-child.json')
  await mkdir(bin)
  await writeFile(join(bin, 'pg_dump'), `#!/usr/bin/env node
const {writeFileSync} = require('node:fs')
process.on('SIGTERM', () => {})
writeFileSync(${JSON.stringify(ready)}, JSON.stringify({pid:process.pid, configuration:process.env.PGSERVICEFILE}))
setInterval(() => {}, 1000)
`, { mode: 0o700 })
  vi.stubEnv('PG_CLIENT_MODE', 'local')
  vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`)
  const controller = new AbortController()
  const archive = join(fixture.root, 'cancelled-archive')
  const capture = exportStorageArchive({ connectionString: getTestDatabaseUrl(), db: fixture.db,
    objects: fixture.resources.objects, root: archive, sourceBuildId: 'cancelled-build', mode: 'maintenance', signal: controller.signal })
  let child: { pid: number; configuration: string } | undefined
  cleanups.register(async () => {
    controller.abort(new Error('test cleanup'))
    if (child) { try { process.kill(child.pid, 'SIGKILL') } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error
    } }
    await capture.catch(() => {})
  })
  await vi.waitFor(async () => {
    const value: unknown = JSON.parse(await readFile(ready, 'utf8'))
    if (!value || typeof value !== 'object' || !('pid' in value) || typeof value.pid !== 'number'
      || !('configuration' in value) || typeof value.configuration !== 'string') throw new Error('Invalid native dump identity')
    child = { pid: value.pid, configuration: value.configuration }
  }, { timeout: 10000 })
  if (!child) throw new Error('Native dump did not start')
  const running = child
  expect(process.kill(running.pid, 0)).toBe(true)
  const cancelled = Promise.race([capture, new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Maintenance dump ignored cancellation')), 5000)
    timer.unref()
  })])
  controller.abort(new Error('cancel maintenance dump'))
  await expect(cancelled).rejects.toThrow('cancel maintenance dump')
  expect(() => process.kill(running.pid, 0)).toThrow()
  await expect(readFile(running.configuration)).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await readdir(archive)).filter(name => name.startsWith('.pg-client-'))).toEqual([])
})

it('does not leave database service credentials when the dump deadline has expired', async () => {
  const fixture = await importFixture(); cleanups.register(() => fixture.close())
  const before = new Set((await readdir(tmpdir())).filter(name => name.startsWith('agricola-pg-client-')))
  vi.stubEnv('BACKUP_DEADLINE_EPOCH_MS', String(Date.now() - 1))
  const archive = join(fixture.root, 'expired-archive')
  await expect(exportStorageArchive({ connectionString: getTestDatabaseUrl(), db: fixture.db,
    objects: fixture.resources.objects, root: archive, sourceBuildId: 'expired-build', mode: 'maintenance', signal: new AbortController().signal }))
    .rejects.toThrow('Backup deadline exceeded')
  expect((await readdir(tmpdir())).filter(name => name.startsWith('agricola-pg-client-') && !before.has(name))).toEqual([])
  expect((await readdir(archive)).filter(name => name.startsWith('.pg-client-'))).toEqual([])
})
