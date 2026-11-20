import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestDatabase } from '../../../server/__tests__/_helpers/postgres'
import { releaseAll } from '../../../server/__tests__/_helpers/release-all'
import { testStorageEnvironment } from '../../../server/__tests__/_helpers/objects'
import { S3ObjectStore, objectHash } from '../../../server/storage/s3-store'
import { ResourceStore } from '../../../server/storage/resource-store'
import { ReplayResources } from '../../../server/storage/replay-resources'
import { PostgresRoomPersistence } from '../../../server/game/persistence/postgres-adapter'
import { RoomCommitter, replayIntentFromCommand } from '../../../server/game/room-committer'
import { GameSession } from '../../../server/game/authoritative-session'
import type { Room } from '../../../server/game/room'

/**
 * A populated PostgreSQL + S3 store for backup and archive tests: one recorded
 * two-player Room with its Replay and Viewer, an account with a session and seat,
 * and a Workshop draft whose card art is a retained object.
 */
export async function storageFixture() {
  const root = await mkdtemp(join(tmpdir(), 'agricola-storage-test-'))
  // Each resource registers its release as soon as it exists. close() runs them in
  // reverse order, and a failed setup releases whatever it had already acquired.
  const releases: Array<() => unknown> = [() => rm(root, { recursive: true, force: true })]
  const close = () => releaseAll(releases.reverse())
  try {
    const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
    releases.push(() => objects.close(), () => objects.clearPrefix())
    const db = await createTestDatabase()
    releases.push(() => db.close())
    const resources = new ResourceStore(db, objects)
    const replayResources = new ReplayResources(resources)
    const html = Buffer.from('<main>Replay fixture</main>')
    const manifest = Buffer.from(JSON.stringify({ entrypoint: 'index.html', files: { 'index.html': objectHash(html) } }))
    const buildId = objectHash(manifest)
    await resources.stage(`replay-viewers/${buildId}/index.html`, html, 'text/html')
    await replayResources.publishViewer(buildId, manifest)
    await db.prepare("INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES ('u1', 'MigratedUser', 'User', 'password-hash', 1)").run()
    await db.prepare("INSERT INTO sessions(token, user_id, expires_at, created_at) VALUES ('private-session', 'u1', ?, 1)").run(Date.now() + 86400000)
    const committer = new RoomCommitter({ persistence: new PostgresRoomPersistence(db), resources: replayResources, viewerBuildId: buildId, gameBuildId: 'test-main', viewerBuildExists: async id => !!await replayResources.viewer(id) })
    const room: Room = { id: 'recorded', session: new GameSession(42, undefined, { playerCount: 2, enableParentCards: false }), players: [], seatOwners: [], maxPlayers: 2, version: 0, status: 'playing' }
    for (const player of room.session.state.players) { player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__'] }
    releases.push(() => committer.shutdown(), () => room.session.dispose())
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
    committer.shutdown(); room.session.dispose()
    await db.prepare("INSERT INTO room_players(room_id, user_id, player_index, joined_at) VALUES ('recorded', 'u1', 0, 1)").run()
    await resources.stage('card-art/saved.png', Buffer.from('saved artwork'), 'image/png')
    await db.prepare(`INSERT INTO workshop_cards(id, author_id, card_id, card_type, name, card_json, art_url, draft_generation_json, created_at, updated_at)
      VALUES ('workshop', 'u1', 'CUSTOM_saved', 'minor', 'Saved', '{ "id": "CUSTOM_saved" }', '/card-art/saved.png', '{"art":{"history":[{"url":"/card-art/saved.png"}]}}', 1, 1)`).run()
    return { root, db, resources, buildId, close }
  } catch (error) {
    await close().catch((cleanupError: unknown) => {
      throw new AggregateError([error, cleanupError], 'Storage fixture setup and cleanup both failed')
    })
    throw error
  }
}
