import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, expect, it, vi } from 'vitest'
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
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { extractPairedPrereleaseBackup, fileHash, readPairedPrereleaseBackup } from '../prerelease/backup'
import { exportStorageArchive, restoreStorageArchive } from '../storage-archive'
import { expirePrereleaseReplay } from '../../server/game/replay-removal'
import { GameContextStore } from '../../server/game/game-context-store'
import { PRERELEASE_ARCHIVE_RETENTION_MS } from '../../server/game/prerelease-archive-retention'

vi.setConfig({ testTimeout: 120000, hookTimeout: 180000 })
const cleanups = releaseQueue()
afterAll(async () => { vi.restoreAllMocks(); await cleanups.release() })
afterEach(() => vi.unstubAllEnvs())

it('applies newer prerelease expiry facts to an actual older PostgreSQL and object archive', async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  const root = await mkdtemp(join(tmpdir(), 'agricola-pre-expiry-archive-'))
  cleanups.register(() => rm(root, { recursive: true, force: true }))
  const db = await createTestDatabase()
  cleanups.register(() => db.close())
  const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
  cleanups.register(() => releaseAll([() => objects.clearPrefix(), () => objects.close()]))
  const resources = new ResourceStore(db, objects)
  const sentinel = Buffer.from('another retained resource must remain unchanged')
  await resources.stage('card-art/retained-sentinel.png', sentinel, 'image/png')
  await db.prepare(`INSERT INTO game_contexts(room_id,lifecycle,replay_status,created_at,updated_at)
    VALUES ('expiry-backup-room','completed','legacy_no_replay',1,1)`).run()
  await db.prepare(`INSERT INTO game_results(room_id,started_at,finished_at,rounds_played,player_count,
    enable_community_deck,enable_parent_cards,enable_through_the_seasons,enable_farmers_of_the_moor,enable_snake_opening)
    VALUES ('expiry-backup-room',1,1000,14,2,0,0,0,0,0)`).run()
  await db.prepare(`INSERT INTO game_result_players(room_id,player_index,game_player_id,display_name,score)
    VALUES ('expiry-backup-room',0,'p1','Private archived name',42)`).run()
  const archiveRoot = join(root, 'archive'), controller = new AbortController()
  const archive = await exportStorageArchive({ connectionString: getTestDatabaseUrl(), db, objects, root: archiveRoot,
    sourceBuildId: 'a'.repeat(40), mode: 'maintenance', signal: controller.signal })
  const originalDump = fileHash(join(archiveRoot, 'database.dump'))
  expect(await db.prepare('SELECT display_name,score FROM game_result_players').all()).toEqual([{ display_name: 'Private archived name', score: 42 }])
  expect(await expirePrereleaseReplay(db, { roomId: 'expiry-backup-room', resources,
    now: () => 1000 + PRERELEASE_ARCHIVE_RETENTION_MS })).toBe(true)
  const currentFacts = await resources.ledger.read()
  const ledger = await objects.get('erasure/ledger.json')
  const admin = databaseMaintenance(), name = `expiry_${randomUUID().replaceAll('-', '')}`
  cleanups.register(() => admin.close())
  await admin.exec(`CREATE DATABASE "${name}"`)
  const url = new URL(getTestDatabaseUrl()); url.pathname = `/${name}`
  const restored = new PostgresDatabase({ connectionString: url.toString(), schema: archive.schema })
  const restoredObjects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
  cleanups.register(() => releaseAll([() => restoredObjects.clearPrefix(), () => restoredObjects.close(),
    () => restored.close(), () => admin.exec(`DROP DATABASE IF EXISTS "${name}"`)]))
  await restoreStorageArchive(url.toString(), restored, restoredObjects, archiveRoot, currentFacts)
  expect(await restored.prepare('SELECT room_id FROM game_results').all()).toEqual([])
  expect(await restored.prepare('SELECT display_name FROM game_result_players').all()).toEqual([])
  expect(await new GameContextStore(restored).resolve('expiry-backup-room')).toMatchObject({ lifecycle: 'removed' })
  expect((await restoredObjects.get('card-art/retained-sentinel.png'))?.body).toEqual(sentinel)
  expect((await objects.get('card-art/retained-sentinel.png'))?.body).toEqual(sentinel)
  expect((await objects.get('erasure/ledger.json'))?.body).toEqual(ledger?.body)
  expect(fileHash(join(archiveRoot, 'database.dump'))).toBe(originalDump)
})

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
  const committer = new RoomCommitter({ persistence, resources: replayResources, viewerBuildId, gameBuildId: 'a'.repeat(40), viewerBuildExists: async id => !!await replayResources.viewer(id) })
  cleanups.register(() => committer.shutdown())
  const session = createWorkSession({ seed: 42, configure(state) {
    for (const player of state.players) { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] }
  } })
  cleanups.register(() => session.dispose())
  const room: Room = { id: 'backup-room', session, players: [], seatOwners: [], maxPlayers: 2, version: 0, status: 'playing' }
  committer.lockNewRoom(room)
  expect((await committer.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')
  const directory = new RoomDirectory(db)
  await directory.register('online-node', 'http://127.0.0.1:19999', 'a'.repeat(40))
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
    sourceBuildId: 'a'.repeat(40), mode: 'maintenance', signal: controller.signal })).rejects.toThrow('Stop all applications')

  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>()
  const get = objects.get.bind(objects)
  let pause = true
  vi.spyOn(objects, 'get').mockImplementation(async (key, signal) => {
    if (key === 'card-art/preserved.png' && pause) { pause = false; entered.resolve(); await finish.promise }
    return get(key, signal)
  })
  const archiveRoot = join(root, 'archive')
  const capture = exportStorageArchive({ connectionString: getTestDatabaseUrl(), db, objects, root: archiveRoot,
    sourceBuildId: 'a'.repeat(40), mode: 'online', deadlineEpochMs: Date.now() + 60_000, signal: controller.signal })
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

  // New owner tools consume a sealed pair of these actual PG/S3 bytes, then
  // restore the selected point with independently newer deletion facts.
  const ownerTarget = parsePrereleaseTarget({ ...JSON.parse(await readFile('deploy/prerelease-target.example.json', 'utf8')),
    directory: join(root, 'open-agricola-prerelease-main'), policyDirectory: process.cwd() })
  const backups = join(ownerTarget.directory, 'backups'), pending = join(backups, '.pending')
  await mkdir(pending, { recursive: true })
  execFileSync('tar', ['-czf', join(pending, 'archive.tgz'), '-C', archiveRoot, '.'])
  await writeFile(join(pending, 'env'), 'DATABASE_URL=prior-pre-credentials-retained-only-as-sealed-evidence\n')
  await writeFile(join(pending, 'report.json'), JSON.stringify({ formatVersion: 2, sourceBuildId: archive.sourceBuildId,
    targetBuildId: 'b'.repeat(40), createdAt: archive.createdAt, validatedAt: new Date().toISOString(), ...restored.validation }))
  const generation = randomUUID(), stem = 'pre-native-paired'
  await mkdir(join(pending, 'capture'))
  await writeFile(join(pending, 'capture/archive.json'), await readFile(join(archiveRoot, 'archive.json')))
  execFileSync(process.execPath, ['scripts/backup-files.mjs', 'seal', pending, stem], { env: { ...process.env,
    BACKUP_ENVIRONMENT: ownerTarget.targetId, BACKUP_RETENTION_DAYS: '7', BACKUP_DATA_GENERATION: generation,
    SOURCE_BUILD_ID: 'a'.repeat(40), BACKUP_TARGET_BUILD_ID: 'b'.repeat(40),
    BACKUP_TARGET_FINGERPRINT: targetFingerprint(ownerTarget) } })
  for (const [from, to] of [['archive.tgz', `${stem}.tgz`], ['env', `env-${stem}`], ['manifest.json', `${stem}.manifest.json`]]) {
    await writeFile(join(backups, to), await readFile(join(pending, from)))
  }
  const point = readPairedPrereleaseBackup(ownerTarget, stem, generation)
  expect(point.sourceBuildId).toBe('a'.repeat(40))
  const staging = join(backups, 'restored-native-pair')
  extractPairedPrereleaseBackup(ownerTarget, point.archive, point.archiveSha256, staging)
  expect(fileHash(join(staging, 'database.dump'))).toBe(fileHash(join(archiveRoot, 'database.dump')))
  await writeFile(join(backups, `env-${stem}`), 'altered credentials')
  expect(() => readPairedPrereleaseBackup(ownerTarget, stem, generation)).toThrow('incomplete, altered')

  const erased = await target()
  const newerLedger = [{ version: 1 as const, entries: [{ version: 1 as const, roomId: 'backup-room', reason: 'legal' as const,
    removedAt: Date.now(), eraseResult: false, assetHashes: [] }], assetTakedowns: [] }]
  const inputFiles = (await readdir(staging)).sort(), inputHash = fileHash(join(staging, 'database.dump'))
  await chmod(staging, 0o500)
  try {
    expect((await restoreStorageArchive(erased.url, erased.db, erased.objects, staging, newerLedger)).validation.roomCount).toBe(0)
    expect((await readdir(staging)).sort()).toEqual(inputFiles)
    expect(fileHash(join(staging, 'database.dump'))).toBe(inputHash)
  } finally { await chmod(staging, 0o700) }
})
