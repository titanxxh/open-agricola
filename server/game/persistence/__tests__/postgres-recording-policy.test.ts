import { afterEach, expect, it } from 'vitest'
import { createTestDatabase } from '../../../__tests__/_helpers/postgres'
import { GameSession } from '../../authoritative-session'
import { PostgresRoomPersistence } from '../postgres-adapter'
import { serializeSessionSnapshot } from '../../../../shared/session/serialization'
import type { RoomMeta } from '../room-persistence'

const db = await createTestDatabase()
afterEach(async () => { await db.close() })

it('discards only proven unrecorded active games and preserves recorded or waiting games and unrelated data', async () => {
  const store = new PostgresRoomPersistence(db)
  const game = new GameSession(961, undefined, { playerCount: 2 })
  for (const player of game.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const snapshot = serializeSessionSnapshot(game.state, game)
  const meta: RoomMeta = { createdBy: null, maxPlayers: 2, customCardDbIds: [], players: [], status: 'playing' }
  await store.save('old-unrecorded', snapshot, { ...meta, replayRecording: false })
  await store.save('old-unknown', snapshot, meta)
  await store.save('waiting', snapshot, { ...meta, status: 'waiting' })
  await store.save('recorded-missing-header', snapshot, { ...meta, replayRecording: true })
  await store.save('pinned-missing-intent', snapshot, { ...meta, replayViewerBuildId: 'viewer' })
  await store.save('has-replay', snapshot, meta)
  await db.prepare(`INSERT INTO game_replays (room_id, schema_version, viewer_build_id, game_build_id, status, latest_step_no, missing_prefix, custom_cards_json, created_at)
    VALUES ('has-replay', 1, 'v', 'g', 'recording', -1, 0, '[]', 1)`).run()
  await db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES ('u', 'retained', '', 'Keep', 1)`).run()
  expect((await store.discardUnrecordedActiveRooms()).sort()).toEqual(['old-unknown', 'old-unrecorded'])
  const rooms = await db.prepare('SELECT id FROM rooms ORDER BY id').all()
  expect(rooms.map(row => row.id)).toEqual(['has-replay', 'pinned-missing-intent', 'recorded-missing-header', 'waiting'])
  expect((await db.prepare("SELECT lifecycle FROM game_contexts WHERE room_id = 'old-unrecorded'").get())?.lifecycle).toBe('expired')
  expect((await db.prepare("SELECT id FROM users WHERE id = 'u'").get())?.id).toBe('u')
  expect(await store.discardUnrecordedActiveRooms()).toEqual([])
  game.dispose()
})
