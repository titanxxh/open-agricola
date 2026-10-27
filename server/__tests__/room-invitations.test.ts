import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import type { PostgresDatabase } from '../database/postgres'
import { parseRoomAccess, canAccessRoom, searchInvitablePlayers } from '../game/room-access'
import { PostgresRoomPersistence } from '../game/persistence/postgres-adapter'
import type { RoomMeta } from '../game/persistence/room-persistence'
import { RoomDirectory } from '../game/room-directory'
import { discoverRoom } from '../game/room-discovery'
import { GameContextStore } from '../game/game-context-store'
import { GameSession } from '../game/authoritative-session'
import { snapshotToRoom, toRoomMeta } from '../game/room'
import { serializeSessionSnapshot } from '../../shared/session/serialization'

let db: PostgresDatabase
const setup = { creatorId: 'host', maxPlayers: 2, hotseat: false }
const invitedAccess = { kind: 'invited', invitedUserIds: ['ab_One'] } as const
const meta: RoomMeta = {
  createdBy: 'host', maxPlayers: 2, status: 'waiting', customCardDbIds: [],
  players: [{ userId: 'host', playerIndex: 0 }],
}

beforeEach(async () => {
  db = await createTestDatabase()
  for (const id of ['host', 'ab_One', 'ab_Two', 'AB_Three', 'outsider', 'ab_pending', 'ab_deleting']) {
    await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'hash',1)")
      .run(id, `user_${id}`, `Name ${id}`)
  }
  await db.prepare("UPDATE users SET email='pending@example.com' WHERE id='ab_pending'").run()
  await db.prepare("INSERT INTO account_deletion_requests(user_id,requested_at,next_attempt_at) VALUES('ab_deleting',1,1)").run()
})
afterEach(async () => { await db.close() })

describe('invitation creation and player lookup', () => {
  it('defaults to public and normalizes distinct guests without changing ID case', async () => {
    expect(await parseRoomAccess(undefined, setup, db)).toEqual({ ok: true, access: { kind: 'public' } })
    expect(await parseRoomAccess({ kind: 'invited', invitedUserIds: ['host', ' ab_One ', 'ab_One'] }, setup, db))
      .toEqual({ ok: true, access: { kind: 'invited', invitedUserIds: ['ab_One'] } })
    expect(await parseRoomAccess({ kind: 'invited', invitedUserIds: ['ab_one'] }, setup, db))
      .toMatchObject({ ok: false, code: 'invited_player_unavailable' })
  })

  it.each([
    null, 1, { kind: 'unknown' }, { kind: 'public', invitedUserIds: ['ab_One'] },
    { kind: 'invited' }, { kind: 'invited', invitedUserIds: 'ab_One' },
    { kind: 'invited', invitedUserIds: [] }, { kind: 'invited', invitedUserIds: ['host'] },
    { kind: 'invited', invitedUserIds: ['ab_One', 'ab_Two'] },
    { kind: 'invited', invitedUserIds: [7] },
    { kind: 'invited', invitedUserIds: Array.from({ length: 33 }, () => 'ab_One') },
  ])('rejects malformed or unfillable invitation setup %#', async input => {
    expect(await parseRoomAccess(input, setup, db)).toMatchObject({ ok: false, code: 'invalid_room_access' })
    expect(await db.prepare('SELECT id FROM rooms').all()).toEqual([])
  })

  it('rejects anonymous and hotseat private creation and unavailable guest accounts', async () => {
    expect(await parseRoomAccess(invitedAccess, { ...setup, creatorId: undefined }, db))
      .toMatchObject({ ok: false, code: 'login_required' })
    expect(await parseRoomAccess(invitedAccess, { ...setup, hotseat: true }, db))
      .toMatchObject({ ok: false, code: 'invalid_room_access' })
    for (const id of ['missing', 'ab_pending', 'ab_deleting']) {
      expect(await parseRoomAccess({ kind: 'invited', invitedUserIds: [id] }, setup, db))
        .toMatchObject({ ok: false, code: 'invited_player_unavailable' })
    }
  })

  it('matches English usernames case-insensitively and Chinese display names, excluding self and unavailable accounts', async () => {
    for (const [id, username, displayName] of [
      ['ab_One', 'alice', '阿明甲'], ['ab_Two', 'albert', '阿明乙'],
      ['ab_pending', 'al_pending', '阿明待验证'], ['ab_deleting', 'al_deleting', '阿明待删除'],
    ]) await db.prepare('UPDATE users SET username = ?, display_name = ? WHERE id = ?').run(username, displayName, id)
    expect((await searchInvitablePlayers(db, 'aL', 'host')).map(player => player.id).sort()).toEqual(['ab_One', 'ab_Two'])
    expect(await searchInvitablePlayers(db, '阿明', 'ab_One')).toEqual([
      { id: 'ab_Two', username: 'albert', displayName: '阿明乙' },
    ])
    expect(await searchInvitablePlayers(db, 'ab', 'host')).toEqual([])
    expect(await searchInvitablePlayers(db, 'al%', 'host')).toEqual([])
  })
})

describe('durable room admission', () => {
  it('retains access through metadata saves, full snapshots and a fresh restore', async () => {
    const persistence = new PostgresRoomPersistence(db)
    const session = new GameSession(42, undefined, { playerCount: 2 })
    try {
      await persistence.save('private-room', null, { ...meta, access: { kind: 'invited', invitedUserIds: ['ab_One'] } })
      const initial = await persistence.load('private-room')
      expect(initial?.meta.access).toEqual({ kind: 'invited', invitedUserIds: ['ab_One'] })
      await persistence.save('private-room', serializeSessionSnapshot(session.state, session), initial!.meta)
      const restored = (await new PostgresRoomPersistence(db).listRestorable({
        now: Date.now(), waitingTtlMs: 60_000, playingTtlMs: 60_000,
      })).find(room => room.id === 'private-room')
      const room = snapshotToRoom(restored!)
      try {
        expect(room.players).toEqual([])
        expect(room.session.state.players).toHaveLength(2)
        expect(toRoomMeta(room).access).toEqual({ kind: 'invited', invitedUserIds: ['ab_One'] })
        expect(['host', 'ab_One', 'outsider', undefined].map(userId => canAccessRoom(room, userId)))
          .toEqual([true, true, false, false])
      } finally { room.session.dispose() }
    } finally { session.dispose() }
  })

  it('rejects malformed persisted policies instead of making the room public', async () => {
    const persistence = new PostgresRoomPersistence(db)
    await persistence.save('corrupt-room', null, meta)
    await db.prepare("UPDATE rooms SET invited_user_ids='[7]'::jsonb WHERE id='corrupt-room'").run()
    await expect(persistence.load('corrupt-room')).rejects.toThrow('Invalid stored room access policy')
  })

  it('filters before the lobby limit and rejects outsider or anonymous discovery', async () => {
    const directory = new RoomDirectory(db)
    await directory.register('node', 'http://127.0.0.1:9001', 'build')
    await directory.activate('node')
    const persistence = new PostgresRoomPersistence(db)
    for (const id of ['a-private', 'z-public']) {
      await persistence.save(id, null, { ...meta, ...(id === 'a-private' ? { access: { kind: 'invited', invitedUserIds: ['ab_One'] } as const } : {}) })
      const { owner } = await directory.claim(id)
      await db.transaction(async () => {
        await directory.markActive(id, owner)
        await directory.presence(id, owner, 1, 1)
      })()
    }
    expect((await directory.lobby(1, 'host')).map(room => room.id)).toEqual(['a-private'])
    expect((await directory.lobby(1, 'ab_One')).map(room => room.id)).toEqual(['a-private'])
    expect((await directory.lobby(1, 'outsider')).map(room => room.id)).toEqual(['z-public'])
    expect((await directory.lobby(1)).map(room => room.id)).toEqual(['z-public'])
    expect(JSON.stringify(await directory.lobby(50, 'ab_One'))).not.toContain('invitedUserIds')
    await expect(discoverRoom(directory, 'user:outsider', { roomId: 'a-private' }, 'outsider'))
      .rejects.toMatchObject({ code: 'not_participant' })
    await expect(discoverRoom(directory, 'development-anonymous', { roomId: 'a-private' }))
      .rejects.toMatchObject({ code: 'login_required' })
    expect(await discoverRoom(directory, 'user:ab_One', { roomId: 'a-private' }, 'ab_One'))
      .toEqual({ roomId: 'a-private', wsPath: '/nodes/node/ws' })
    const contexts = new GameContextStore(db)
    expect(await contexts.resolve('a-private', 'outsider')).toMatchObject({ ok: false, code: 'not_participant' })
    expect(await contexts.resolve('a-private', 'host')).toMatchObject({ ok: true, playerIndex: 0, phase: 'waiting' })
    expect(await contexts.resolve('a-private', 'ab_One')).toMatchObject({ ok: false, code: 'not_participant' })
    expect(await db.prepare("SELECT user_id FROM room_players WHERE room_id='a-private'").all())
      .toEqual([{ user_id: 'host' }])
  })
})
