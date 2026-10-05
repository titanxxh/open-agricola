import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Sqlite from 'better-sqlite3'
import { createTestDatabase } from '../../../server/__tests__/_helpers/postgres'
import { testStorageEnvironment } from '../../../server/__tests__/_helpers/objects'
import { S3ObjectStore, objectHash } from '../../../server/storage/s3-store'
import { ResourceStore } from '../../../server/storage/resource-store'
import { ReplayResources } from '../../../server/storage/replay-resources'
import { PostgresRoomPersistence } from '../../../server/game/persistence/postgres-adapter'
import { RoomCommitter, replayIntentFromCommand } from '../../../server/game/room-committer'
import { GameSession } from '../../../server/game/authoritative-session'
import type { Room } from '../../../server/game/room'
import { readFileSync } from 'node:fs'

/** The encoder is unchanged from main's v2/frameDelta Room format; import copies its exact records. */
export async function importFixture() {
  const root = await mkdtemp(join(tmpdir(), 'agricola-import-test-'))
  const paths = { database: join(root, 'open-agricola.db'), cardArt: join(root, 'card-art'), replayAssets: join(root, 'replay-assets'), viewers: join(root, 'replay-viewers'), erasureLedger: join(root, 'replay-removals.jsonl') }
  const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
  const sourceDb = await createTestDatabase()
  const db = await createTestDatabase()
  const resources = new ResourceStore(db, objects)
  const sourceResources = new ResourceStore(sourceDb, objects)
  const html = Buffer.from('<main>Replay fixture</main>')
  const manifest = Buffer.from(JSON.stringify({ entrypoint: 'index.html', files: { 'index.html': objectHash(html) } }))
  const buildId = objectHash(manifest)
  await mkdir(join(paths.viewers, buildId), { recursive: true })
  await writeFile(join(paths.viewers, buildId, 'index.html'), html)
  await writeFile(join(paths.viewers, buildId, 'manifest.json'), manifest)
  await sourceResources.stage(`replay-viewers/${buildId}/index.html`, html, 'text/html')
  await new ReplayResources(sourceResources).publishViewer(buildId, manifest)
  const source = new Sqlite(paths.database)
  source.exec(readFileSync(new URL('./sqlite-schema-v33.sql', import.meta.url), 'utf8'))
  const persistence = new PostgresRoomPersistence(sourceDb)
  const committer = new RoomCommitter({ persistence, resources: new ReplayResources(sourceResources), viewerBuildId: buildId, gameBuildId: 'test-main', viewerBuildExists: async id => !!await new ReplayResources(sourceResources).viewer(id) })
  const room: Room = { id: 'recorded', session: new GameSession(42, undefined, { playerCount: 2, enableParentCards: false }), players: [], seatOwners: [], maxPlayers: 2, version: 0, status: 'playing' }
  for (const player of room.session.state.players) { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] }
  committer.lockNewRoom(room)
  const prepared = await committer.prepareRoom(room, { missingPrefix: false })
  if (prepared.kind !== 'committed') throw new Error(`Fixture initial commit failed: ${JSON.stringify(prepared)}`)
  for (const spaceId of ['forest', null, 'clay-pit']) {
    const interaction = room.session.getState().interaction
    const playerIndex = interaction.stateId === 'wait' ? interaction.playerIndex : room.session.state.currentPlayerIndex
    const command = spaceId ? { type: 'action' as const, spaceId } : { type: 'choice' as const, value: 'confirm' }
    const response = spaceId ? room.session.takeAction(playerIndex, spaceId) : room.session.resolveChoice(playerIndex, 'confirm')
    if (!response.ok) throw new Error(response.error)
    if ((await committer.commit(room, response, replayIntentFromCommand(command)!, playerIndex)).kind !== 'committed') throw new Error('Fixture action commit failed')
  }
  for (const table of ['rooms', 'game_contexts', 'game_replays', 'game_replay_steps', 'room_history_nodes', 'room_recovery_nodes']) {
    const columns = (source.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(column => column.name)
    const rows = await sourceDb.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all()
    const insert = source.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    for (const row of rows) insert.run(...columns.map(column => row[column]))
  }
  committer.shutdown(); room.session.dispose(); await sourceDb.close()
  source.prepare("INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES ('u1', 'MigratedUser', 'User', 'password-hash', 1)").run()
  source.prepare("INSERT INTO sessions(token, user_id, expires_at, created_at) VALUES ('private-session', 'u1', ?, 1)").run(Date.now() + 86400000)
  source.prepare("INSERT INTO room_players(room_id, user_id, player_index, joined_at) VALUES ('recorded', 'u1', 0, 1)").run()
  await mkdir(paths.cardArt)
  await writeFile(join(paths.cardArt, 'saved.png'), Buffer.from('saved artwork'))
  source.prepare(`INSERT INTO workshop_cards(id, author_id, card_id, card_type, name, card_json, art_url, draft_generation_json, created_at, updated_at)
    VALUES ('workshop', 'u1', 'CUSTOM_saved', 'minor', 'Saved', '{ "id": "CUSTOM_saved" }', '/card-art/saved.png', '{"art":{"history":[{"url":"/card-art/saved.png"}]}}', 1, 1)`).run()
  return { root, paths, source, db, resources, buildId, close: async () => { source.close(); await objects.clearPrefix(); objects.close(); await db.close(); await rm(root, { recursive: true, force: true }) } }
}
