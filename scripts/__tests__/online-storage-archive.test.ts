import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
import { createTestDatabase, databaseMaintenance, getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { testStorageEnvironment } from '../../server/__tests__/_helpers/objects'
import { createWorkSession } from '../../server/__tests__/_helpers/session-fixtures'
import { releaseAll, releaseQueue } from '../../server/__tests__/_helpers/release-all'
import { PostgresDatabase } from '../../server/database/postgres'
import { S3ObjectStore, objectHash } from '../../server/storage/s3-store'
import { ResourceStore } from '../../server/storage/resource-store'
import { ReplayResources } from '../../server/storage/replay-resources'
import { PostgresRoomPersistence } from '../../server/game/persistence/postgres-adapter'
import { RoomCommitter, replayIntentFromCommand } from '../../server/game/room-committer'
import { RoomDirectory } from '../../server/game/room-directory'
import { snapshotToRoom, type Room } from '../../server/game/room'
import { exportStorageArchive, restoreStorageArchive } from '../storage-archive'

vi.setConfig({ testTimeout: 120000, hookTimeout: 180000 })
const cleanups = releaseQueue()
afterAll(async () => { vi.restoreAllMocks(); await cleanups.release() })

it('restores one two-player recovery point while real game commands, uploads and collection continue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agricola-online-archive-'))
  cleanups.register(() => rm(root, { recursive: true, force: true }))
  const db = await createTestDatabase()
  cleanups.register(() => db.close())
  const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
  cleanups.register(() => releaseAll([() => objects.clearPrefix(), () => objects.close()]))
  const resources = new ResourceStore(db, objects)
  const html = Buffer.from('<main>Online backup viewer</main>')
  const viewer = Buffer.from(JSON.stringify({ entrypoint: 'index.html', files: { 'index.html': objectHash(html) } }))
  const viewerBuildId = objectHash(viewer)
  await resources.stage(`replay-viewers/${viewerBuildId}/index.html`, html, 'text/html')
  const replayResources = new ReplayResources(resources)
  await replayResources.publishViewer(viewerBuildId, viewer)
  const persistence = new PostgresRoomPersistence(db)
  const committer = new RoomCommitter({ persistence, resources: replayResources, viewerBuildId, gameBuildId: 'online-test', viewerBuildExists: async id => !!await replayResources.viewer(id) })
  cleanups.register(() => committer.shutdown())
  const session = createWorkSession({ seed: 42, configure(state) {
    for (const player of state.players) { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] }
  } })
  cleanups.register(() => session.dispose())
  const room: Room = { id: 'backup-room', session, players: [], seatOwners: [], maxPlayers: 2, version: 0, status: 'playing' }
  committer.lockNewRoom(room)
  expect((await committer.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')
  const directory = new RoomDirectory(db)
  await directory.register('online-node', 'http://127.0.0.1:19999', 'online-test')
  await directory.activate('online-node')

  const first = session.takeAction(0, 'forest')
  expect(first.ok).toBe(true)
  expect(first.state.players[0].resources.wood).toBe(3)
  expect(first.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })
  expect((await committer.commit(room, first, replayIntentFromCommand({ type: 'action', spaceId: 'forest' })!, 0)).kind).toBe('committed')
  const before = session.getState()
  const beforeLog = structuredClone(before.state.log)
  const beforeScores = structuredClone(before.scores)
  const beforeInteraction = structuredClone(before.interaction)
  expect(before.state.phase).toBe('playing')
  expect(before.state.round).toBe(1)
  expect(before.state.log.length).toBeGreaterThan(0)
  expect(before.scores).toHaveLength(2)
  const preserved = Buffer.from('bytes retained by the online capture')
  await resources.stage('card-art/preserved.png', preserved, 'image/png')
  const controller = new AbortController()
  await expect(exportStorageArchive({ connectionString: getTestDatabaseUrl(), db, objects, root: join(root, 'refused'),
    sourceBuildId: 'online-test', mode: 'maintenance', signal: controller.signal })).rejects.toThrow('Stop all applications')

  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>()
  const get = objects.get.bind(objects)
  let pause = true
  vi.spyOn(objects, 'get').mockImplementation(async (key, signal) => {
    if (key === 'card-art/preserved.png' && pause) { pause = false; entered.resolve(); await finish.promise }
    return get(key, signal)
  })
  const archiveRoot = join(root, 'archive')
  const capture = exportStorageArchive({ connectionString: getTestDatabaseUrl(), db, objects, root: archiveRoot,
    sourceBuildId: 'online-test', mode: 'online', deadlineEpochMs: Date.now() + 60_000, signal: controller.signal })
  cleanups.register(() => { finish.resolve(); controller.abort(new Error('test cleanup')); return capture.catch(() => {}) })
  await entered.promise

  const confirmed = session.resolveChoice(0, 'confirm')
  expect(confirmed.ok).toBe(true)
  expect(confirmed.interaction.stateId).toBe('idle')
  expect(confirmed.state.currentPlayerIndex).toBe(1)
  expect((await committer.commit(room, confirmed, replayIntentFromCommand({ type: 'choice', value: 'confirm' })!, 0)).kind).toBe('committed')
  const second = session.takeAction(1, 'clay-pit')
  expect(second.ok).toBe(true)
  expect(second.state.players[1].resources.clay).toBe(1)
  expect((await committer.commit(room, second, replayIntentFromCommand({ type: 'action', spaceId: 'clay-pit' })!, 1)).kind).toBe('committed')
  await resources.stage('card-art/new-after-snapshot.png', Buffer.from('later'), 'image/png')
  expect(await resources.removeUnreferenced(['card-art/preserved.png'])).toEqual([])
  expect((await objects.get('card-art/preserved.png'))?.body).toEqual(preserved)
  expect(await db.prepare("SELECT count(*)::int AS count FROM game_replay_steps WHERE room_id='backup-room'").get()).toEqual({ count: 4 })
  finish.resolve()
  const archive = await capture
  expect(archive.objects.map(item => item.key)).toContain('card-art/preserved.png')
  expect(archive.objects.map(item => item.key)).not.toContain('card-art/new-after-snapshot.png')
  expect(await resources.collect()).toBe(1)

  const admin = databaseMaintenance()
  cleanups.register(() => admin.close())
  const target = async () => {
    const name = `backup_${randomUUID().replaceAll('-', '')}`
    await admin.exec(`CREATE DATABASE "${name}"`)
    const url = new URL(getTestDatabaseUrl()); url.pathname = `/${name}`
    const targetDb = new PostgresDatabase({ connectionString: url.toString(), schema: archive.schema })
    const targetObjects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
    cleanups.register(() => releaseAll([() => targetObjects.clearPrefix(), () => targetObjects.close(),
      () => targetDb.close(), () => admin.exec(`DROP DATABASE IF EXISTS "${name}"`)]))
    return { url: url.toString(), db: targetDb, objects: targetObjects }
  }
  const recovered = await target()
  const restored = await restoreStorageArchive(recovered.url, recovered.db, recovered.objects, archiveRoot, [])
  expect(restored.validation).toMatchObject({ roomCount: 1, replayCount: 1, replayStepCount: 2 })
  expect((await recovered.objects.get('card-art/preserved.png'))?.body).toEqual(preserved)
  const loaded = await new PostgresRoomPersistence(recovered.db).load('backup-room')
  expect(loaded).not.toBeNull()
  const recoveredRoom = snapshotToRoom(loaded!)
  cleanups.register(() => recoveredRoom.session.dispose())
  const state = recoveredRoom.session.getState()
  expect(state.state.players[0].resources.wood).toBe(3)
  expect(state.state.players[1].resources.clay).toBe(0)
  expect(state.interaction).toEqual(beforeInteraction)
  expect(state.state.log).toEqual(beforeLog)
  expect(state.scores).toEqual(beforeScores)
  expect(recoveredRoom.session.undoStep().ok).toBe(true)
  expect(recoveredRoom.session.state.players[0].resources.wood).toBe(0)

  const erased = await target()
  const newerLedger = [{ version: 1 as const, entries: [{ version: 1 as const, roomId: 'backup-room', reason: 'legal' as const,
    removedAt: Date.now(), eraseResult: false, assetHashes: [] }], assetTakedowns: [] }]
  expect((await restoreStorageArchive(erased.url, erased.db, erased.objects, archiveRoot, newerLedger)).validation.roomCount).toBe(0)
})
