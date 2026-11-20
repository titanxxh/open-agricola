import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { vi, afterEach, expect, it } from 'vitest'

// Native database/S3 and child-process operations also run under full-suite load.
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })
import { importFixture } from './_helpers/import-fixture'
import { importSqlite } from '../sqlite-import/import'
import { assertStorageReady } from '../../server/db'
import { PostgresRoomPersistence } from '../../server/game/persistence/postgres-adapter'
import { snapshotToRoom } from '../../server/game/room'
import { objectHash } from '../../server/storage/s3-store'

let fixture: Awaited<ReturnType<typeof importFixture>> | undefined
afterEach(async () => { await fixture?.close(); fixture = undefined })

it('copies exact main-format Room/Replay rows, accounts and Workshop resources, then restores ordinary undo', async () => {
  fixture = await importFixture()
  const { source, db, resources, paths } = fixture
  source.prepare("INSERT INTO rooms(id, status, state_json, replay_recording, created_at, updated_at) VALUES ('discard-me', 'playing', '{}', 0, 1, 1)").run()
  source.prepare("INSERT INTO game_contexts(room_id,lifecycle,phase,created_at,updated_at) VALUES ('discard-me','active','playing',1,1)").run()
  source.prepare("INSERT INTO rooms(id, status, created_at, updated_at) VALUES ('waiting', 'waiting', 1, 1)").run()
  source.prepare("INSERT INTO game_contexts(room_id,lifecycle,phase,created_at,updated_at) VALUES ('waiting','active','waiting',1,1)").run()
  const original = await readFile(paths.database)
  const report = await importSqlite(paths, db, resources)
  expect(await readFile(paths.database)).toEqual(original)
  expect(report.discardedRoomIds).toEqual(['discard-me'])
  expect(report.validation).toMatchObject({ roomCount: 2, replayCount: 1, replayStepCount: 4 })
  expect(await db.prepare("SELECT lifecycle FROM game_contexts WHERE room_id='discard-me'").get()).toEqual({ lifecycle: 'expired' })
  for (const table of ['room_history_nodes', 'room_recovery_nodes', 'game_replay_steps']) {
    const columns = (source.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(column => column.name)
    expect(await db.prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY 1,2`).all()).toEqual(source.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all())
  }
  expect(await db.prepare("SELECT username FROM users WHERE username='migrateduser'").get()).toEqual({ username: 'MigratedUser' })
  expect((await resources.read('card-art/saved.png'))?.body.toString()).toBe('saved artwork')
  const room = snapshotToRoom((await new PostgresRoomPersistence(db).load('recorded'))!)
  try { expect(room.session.undoStep().ok).toBe(true) } finally { room.session.dispose() }
  await assertStorageReady(db)
  expect(await importSqlite(paths, db, resources)).toEqual(report)
})

it('rolls back corrupt history and blocks startup without changing the input or resetting other data', async () => {
  fixture = await importFixture()
  const { source, paths, db, resources } = fixture
  source.prepare("UPDATE room_recovery_nodes SET body_json = body_json || ' '").run()
  const original = await readFile(paths.database)
  await expect(importSqlite(paths, db, resources)).rejects.toThrow(/checksum|recovery|corrupt/i)
  expect(await db.prepare('SELECT 1 FROM users').get()).toBeUndefined()
  expect(await readFile(paths.database)).toEqual(original)
  await expect(assertStorageReady(db)).rejects.toThrow('not passed validation')
})

it('rejects an unsupported historical SQLite schema without upgrading or changing the source', async () => {
  fixture = await importFixture()
  const { db, resources, paths, source } = fixture
  source.prepare('UPDATE schema_version SET version=32').run()
  const before = await readFile(paths.database)
  await expect(importSqlite(paths, db, resources)).rejects.toThrow('Unsupported SQLite import schema 32')
  expect(await readFile(paths.database)).toEqual(before)
  expect(await db.prepare('SELECT 1 FROM users').get()).toBeUndefined()
})

it('refuses a nonempty destination before creating an import barrier', async () => {
  fixture = await importFixture()
  const { db, resources, paths } = fixture
  await db.prepare("INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES ('existing','existing','Existing','hash',1)").run()
  await expect(importSqlite(paths, db, resources)).rejects.toThrow('empty target: users')
  expect(await db.prepare("SELECT id FROM users").all()).toEqual([{ id: 'existing' }])
  await assertStorageReady(db)
})

it('does not synthesize Replay for a room whose persisted recording header is damaged', async () => {
  fixture = await importFixture()
  const { source, paths, db, resources } = fixture
  source.prepare("DELETE FROM game_replay_steps WHERE room_id='recorded'").run()
  source.prepare("DELETE FROM game_replays WHERE room_id='recorded'").run()
  await expect(importSqlite(paths, db, resources)).rejects.toThrow('recorded room replay header is missing')
  expect(await db.prepare('SELECT 1 FROM rooms').get()).toBeUndefined()
})

it('carries the independent JSONL erasure ledger forward without resurrecting a removed recorded game', async () => {
  fixture = await importFixture()
  const { source, paths, db, resources } = fixture
  await writeFile(paths.erasureLedger, JSON.stringify({ version: 1, roomId: 'recorded', reason: 'legal', removedAt: Date.now(), eraseResult: false, assetHashes: [] }) + '\n')
  const report = await importSqlite(paths, db, resources)
  expect(report.erasure.removedRoomIds).toEqual(['recorded'])
  expect(await db.prepare("SELECT lifecycle FROM game_contexts WHERE room_id='recorded'").get()).toEqual({ lifecycle: 'removed' })
  expect(source.prepare("SELECT COUNT(*) AS n FROM game_replay_steps").get()).toEqual({ n: 4 })
  expect(await resources.ledger.read()).toHaveLength(1)
})

it('refuses changed immutable Viewer bytes before publishing application data', async () => {
  fixture = await importFixture()
  const { db, resources, paths, buildId } = fixture
  await writeFile(join(paths.viewers, buildId, 'index.html'), 'tampered')
  await expect(importSqlite(paths, db, resources)).rejects.toThrow('Viewer file hash mismatch')
  expect(await db.prepare('SELECT 1 FROM users').get()).toBeUndefined()
  await expect(assertStorageReady(db)).rejects.toThrow('not passed validation')
  expect(objectHash(Buffer.from('tampered'))).not.toBe(buildId)
})


it('retains an erased Workshop reference as an inaccessible tombstone without uploading its bytes', async () => {
  fixture = await importFixture()
  const { paths, db, resources } = fixture
  const hash = objectHash(Buffer.from('saved artwork'))
  await resources.ledger.append({ version: 1, entries: [], assetTakedowns: [{ hash, reason: 'legal', removedAt: Date.now() }] })
  await importSqlite(paths, db, resources)
  expect(await resources.read('card-art/saved.png')).toBeNull()
  expect(await resources.objects.get('card-art/saved.png')).toBeNull()
  expect(await db.prepare("SELECT art_url FROM workshop_cards WHERE id='workshop'").get()).toEqual({ art_url: '/card-art/saved.png' })
  expect(await db.prepare("SELECT blocked FROM stored_objects WHERE object_key='card-art/saved.png'").get()).toEqual({ blocked: true })
})
