import { afterEach, describe, expect, it } from 'vitest'
import { listMyActiveRooms } from '../lobby-my-rooms'
import { createTestDatabase } from './_helpers/postgres'
import { createWorkSession } from './_helpers/session-fixtures'
import { PostgresRoomPersistence } from '../game/persistence/postgres-adapter'
import { serializeSessionSnapshot } from '../../shared/session/serialization'
import type { RoomMeta } from '../game/persistence/room-persistence'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function setup() {
  const db = await createTestDatabase()
  cleanups.push(() => db.close())
  for (const id of ['alice', 'bob', 'outsider']) {
    await db.prepare("INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES(?,?,?,'hash',1)")
      .run(id, id, `Account ${id}`)
  }
  const session = createWorkSession({ configure: state => {
    state.players[0]!.name = 'Alice in game'
    state.players[0]!.nameIsDefault = false
    state.players[0]!.color = 'red'
    Object.assign(state.players[0]!.resources, { wood: 10, reed: 10 })
    state.players[1]!.name = 'Bob in game'
    state.players[1]!.nameIsDefault = false
    state.players[1]!.color = 'purple'
    state.currentPlayerIndex = 0
  } })
  cleanups.push(() => session.dispose())
  const persistence = new PostgresRoomPersistence(db)
  const snapshot = serializeSessionSnapshot(session.state, session)
  const meta: RoomMeta = {
    createdBy: 'alice', maxPlayers: 2, status: 'playing', customCardDbIds: [], startedAt: 1_793_089_800_000,
    players: [{ userId: 'alice', playerIndex: 0 }, { userId: 'bob', playerIndex: 1 }],
  }
  return { db, session, persistence, snapshot, meta }
}

describe('my active room summaries', () => {
  it.each(['compressed', 'plain'])('projects occupied seats and start time from a %s snapshot without private data', async format => {
    const { db, persistence, snapshot, meta } = await setup()
    await persistence.save('room', snapshot, meta)
    if (format === 'plain') await db.prepare('UPDATE rooms SET state_json = ? WHERE id = ?').run(JSON.stringify(snapshot), 'room')
    else expect((await db.prepare('SELECT state_json FROM rooms WHERE id = ?').get<{ state_json: string }>('room'))?.state_json)
      .toContain('gzip-base64-v1')

    const rooms = await listMyActiveRooms(db, 'bob')
    expect(rooms).toHaveLength(1)
    expect(rooms[0]).toEqual({
      id: 'room', status: 'playing', max_players: 2, created_at: expect.any(Number), started_at: 1_793_089_800_000,
      updated_at: expect.any(Number), player_index: 1, my_turn: 0, current_player_index: 0,
      players: [
        { playerIndex: 0, name: 'Alice in game', nameIsDefault: false, color: 'red' },
        { playerIndex: 1, name: 'Bob in game', nameIsDefault: false, color: 'purple' },
      ],
    })
    expect(await listMyActiveRooms(db, 'outsider')).toEqual([])
  })

  it('uses the pending frame owner and keeps your-turn rooms first', async () => {
    const { db, persistence, snapshot, meta, session } = await setup()
    await persistence.save('ordinary', snapshot, meta)
    expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
    const pending = serializeSessionSnapshot(session.state, session)
    const top = pending.sessionCursor.engineStackCursor.frames.at(-1)
    if (!top) throw new Error('Expected the farm expansion choice frame')
    top.ownerPlayerIndex = 1
    await persistence.save('reaction', pending, meta)
    await db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(Date.now() + 60_000, 'ordinary')

    const rooms = await listMyActiveRooms(db, 'bob')
    expect(rooms.map(room => [room.id, room.current_player_index, room.my_turn])).toEqual([
      ['reaction', 1, 1], ['ordinary', 0, 0],
    ])
  })

  it('does not invent a current turn or participants in unoccupied waiting seats', async () => {
    const { db, persistence, snapshot, meta } = await setup()
    await persistence.save('waiting', snapshot, { ...meta, status: 'waiting', startedAt: null, players: meta.players.slice(0, 1) })
    const rooms = await listMyActiveRooms(db, 'alice')
    expect(rooms[0]).toMatchObject({ started_at: null, current_player_index: null, my_turn: 0 })
    expect(rooms[0]?.players).toEqual([{ playerIndex: 0, name: 'Alice in game', nameIsDefault: false, color: 'red' }])
  })

  it.each(['{not-json', JSON.stringify({ roomBodyEncoding: 'gzip-base64-v1', data: 'broken' })])(
    'retains other room summaries when one snapshot cannot be decoded (%s)', async broken => {
      const { db, persistence, snapshot, meta } = await setup()
      await persistence.save('healthy', snapshot, meta)
      await persistence.save('damaged', snapshot, meta)
      await db.prepare('UPDATE rooms SET state_json = ? WHERE id = ?').run(broken, 'damaged')
      const rooms = await listMyActiveRooms(db, 'alice')
      expect(rooms).toHaveLength(2)
      expect(rooms.find(room => room.id === 'healthy')?.players.map(player => player.name)).toEqual(['Alice in game', 'Bob in game'])
      expect(rooms.find(room => room.id === 'damaged')?.players).toEqual([])
    },
  )

  it('keeps all hotseat players and suppresses turn badges outside normal play', async () => {
    const { db, persistence, snapshot, meta } = await setup()
    const phases: Array<typeof snapshot.state.phase> = ['draft', 'parent-selection']
    for (const phase of phases) {
      await persistence.save(phase, { ...snapshot, state: { ...snapshot.state, phase } }, {
        ...meta, hotseat: true, players: [{ userId: 'alice', playerIndex: 0 }, { userId: 'alice', playerIndex: 1 }],
      })
    }
    const rooms = await listMyActiveRooms(db, 'alice')
    expect(rooms).toHaveLength(4)
    for (const room of rooms) {
      expect(room.current_player_index).toBeNull()
      expect(room.my_turn).toBe(0)
      expect(room.players.map(player => player.name)).toEqual(['Alice in game', 'Bob in game'])
    }
  })
})
