import { afterEach, describe, expect, it } from 'vitest'
import { listMyActiveRooms } from '../lobby-my-rooms'
import { createTestDatabase } from './_helpers/postgres'
import { createWorkSession } from './_helpers/session-fixtures'
import { PostgresRoomPersistence } from '../game/persistence/postgres-adapter'
import { serializeSessionSnapshot } from '../../shared/session/serialization'
import type { RoomMeta } from '../game/persistence/room-persistence'
import { initStagedDraftState, processSubmit } from '../../shared/draft/draft-manager'
import type { DraftStageKind } from '../../shared/draft/types'
import { firstDraftPick } from '../../shared/draft/__tests__/draft-fixtures'
import legacyDraft from '../../shared/draft/__tests__/fixtures/standard-partial.json'
import { encodeRoomBody } from '../game/persistence/room-body-codec'

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
  it.each(['plain', 'compressed'])('projects waiters from a retained %s global-round draft without changing its stored body', async format => {
    const { db, persistence, snapshot, meta } = await setup()
    await persistence.save('legacy', snapshot, meta)
    const body = JSON.stringify({ ...snapshot, state: { ...snapshot.state, phase: 'draft', draft: legacyDraft.draft } })
    const stored = format === 'compressed' ? encodeRoomBody(body) : body
    await db.prepare('UPDATE rooms SET state_json = ? WHERE id = ?').run(stored, 'legacy')
    const rooms = await listMyActiveRooms(db, 'alice')
    expect(rooms[0]).toMatchObject({ progress: { phase: 'draft' }, waiting_player_indexes: [1], current_player_index: null })
    expect(JSON.stringify(rooms)).not.toContain(legacyDraft.draft.kept.p1.occ[0])
    expect(await db.prepare('SELECT state_json FROM rooms WHERE id = ?').get('legacy')).toEqual({ state_json: stored })
  })

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
      updated_at: expect.any(Number), player_index: 1, my_turn: 0, current_player_index: 0, hotseat: false,
      waiting_player_indexes: [0], progress: { phase: 'playing', round: 1 }, expansions: [],
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
    expect(rooms[0]).toMatchObject({ started_at: null, current_player_index: null, my_turn: 0, progress: null, waiting_player_indexes: [] })
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
      expect(rooms.find(room => room.id === 'damaged')).toMatchObject({ progress: null, expansions: [], waiting_player_indexes: [] })
    },
  )

  it('projects the actual game round and enabled expansions without private state', async () => {
    const { db, persistence, snapshot, meta } = await setup()
    await persistence.save('expanded', { ...snapshot, state: {
      ...snapshot.state, round: 8, enableParentCards: true, enableThroughTheSeasons: true,
      enableFarmersOfTheMoor: true, enableCommunityDeck: true,
    } }, meta)
    const [room] = await listMyActiveRooms(db, 'alice')
    expect(room).toMatchObject({
      progress: { phase: 'playing', round: 8 },
      expansions: ['enableParentCards', 'enableThroughTheSeasons', 'enableFarmersOfTheMoor', 'enableCommunityDeck'],
    })
    expect(room).not.toHaveProperty('state')
  })

  it.each(['standard', 'occupation', 'farmersOfTheMoorMinor', 'publishedMinor'] satisfies DraftStageKind[])(
    'only circles players with a current packet during the %s draft stage', async stage => {
      const { db, persistence, snapshot, meta } = await setup()
      const [alice, bob] = snapshot.state.players
      if (!alice || !bob) throw new Error('Expected two players')
      const draft = initStagedDraftState([alice.id, bob.id], [{ kind: stage, poolSize: 3, totalRounds: 2, pools: {
        [alice.id]: {
          occ: stage === 'standard' || stage === 'occupation' ? ['private-occ-a1', 'private-occ-a2', 'private-occ-a3'] : [],
          minor: stage === 'occupation' ? [] : ['private-minor-a1', 'private-minor-a2', 'private-minor-a3'],
        },
        [bob.id]: {
          occ: stage === 'standard' || stage === 'occupation' ? ['private-occ-b1', 'private-occ-b2', 'private-occ-b3'] : [],
          minor: stage === 'occupation' ? [] : ['private-minor-b1', 'private-minor-b2', 'private-minor-b3'],
        },
      } }])
      const drafting: typeof snapshot = { ...snapshot, state: { ...snapshot.state, phase: 'draft', draft } }
      await persistence.save('draft', drafting, meta)
      expect((await listMyActiveRooms(db, 'alice'))[0]).toMatchObject({
        progress: { phase: 'draft' }, waiting_player_indexes: [0, 1], current_player_index: null,
      })
      const selected = processSubmit(draft, alice.id, firstDraftPick(draft, alice.id))
      if (selected.kind !== 'accepted') throw new Error(selected.error)
      drafting.state.draft = selected.draft
      await persistence.save('draft', drafting, meta)
      const [room] = await listMyActiveRooms(db, 'alice')
      expect(room?.waiting_player_indexes).toEqual([1])
      expect(JSON.stringify(room)).not.toContain('private-')
      expect(room?.progress).not.toHaveProperty('round')
    },
  )

  it('lists players who have not chosen parents without revealing the cards', async () => {
    const { db, persistence, snapshot, meta } = await setup()
    const [alice, bob] = snapshot.state.players
    if (!alice || !bob) throw new Error('Expected two players')
    await persistence.save('parents', {
      ...snapshot,
      state: {
        ...snapshot.state,
        phase: 'parent-selection',
        parentSelection: {
          candidates: {
            [alice.id]: { mother: ['PR01', 'PR02'], father: ['PS01', 'PS02'] },
            [bob.id]: { mother: ['PR03', 'PR04'], father: ['PS03', 'PS04'] },
          },
          submissions: {
            [alice.id]: { mother: 'PR01', father: 'PS01' },
            [bob.id]: null,
          },
        },
      },
    }, meta)
    const [room] = await listMyActiveRooms(db, 'alice')
    expect(room).toMatchObject({
      progress: { phase: 'parent-selection' },
      waiting_player_indexes: [1],
      current_player_index: null,
      my_turn: 0,
    })
    expect(JSON.stringify(room)).not.toContain('PR01')
    expect(JSON.stringify(room)).not.toContain('PS01')
  })

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
      expect(room.hotseat).toBe(true)
      expect(room.players.map(player => player.name)).toEqual(['Alice in game', 'Bob in game'])
    }
  })
})
