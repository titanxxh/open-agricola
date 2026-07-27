import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../../db.ts'
import { RoomRegistry } from '../../game/room-registry.ts'
import { SqliteRoomPersistence } from '../../game/persistence/sqlite-adapter.ts'
import { createRoomPersistenceCheckpoint } from '../../game/room-persistence-checkpoint.ts'
import { RoomCommitter, type RoomCommitScheduler } from '../../game/room-committer.ts'
import { createLobby } from '../../game/lobby.ts'
import { Broadcaster } from '../broadcaster.ts'
import { createConnectionCtx } from '../connection-ctx.ts'
import { dispatch } from '../room-router.ts'

const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })

const messages = (ws: ReturnType<typeof fakeWs>): Array<Record<string, unknown>> =>
  ws.send.mock.calls.map(([raw]) => JSON.parse(raw as string) as Record<string, unknown>)

describe('durable publish', () => {
  it('does not publish a successful state until its replay transaction commits', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES (?, ?, ?, 'hash', 1)
    `).run('u1', 'u1', 'U1')
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES (?, ?, ?, 'hash', 1)
    `).run('u2', 'u2', 'U2')
    const persistence = new SqliteRoomPersistence(db)
    const registry = new RoomRegistry()
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const broadcaster = new Broadcaster({ checkpoint })
    const lobby = createLobby({ registry, checkpoint, broadcaster })
    const tasks: Array<{ callback: () => void; delay: number }> = []
    const scheduler: RoomCommitScheduler = {
      setTimeout(callback, delay) {
        const task = { callback, delay }
        tasks.push(task)
        return task
      },
      clearTimeout(handle) {
        const index = tasks.indexOf(handle as (typeof tasks)[number])
        if (index >= 0) tasks.splice(index, 1)
      },
    }
    const committer = new RoomCommitter({
      persistence,
      enabled: true,
      viewerBuildId: 'viewer-1',
      gameBuildId: 'game-1',
      viewerBuildExists: () => true,
      scheduler,
    })
    const deps = { registry, checkpoint, broadcaster, lobby, committer }
    const hostWs = fakeWs()
    const guestWs = fakeWs()
    const host = createConnectionCtx(hostWs as never, deps, true, 'u1')
    const guest = createConnectionCtx(guestWs as never, deps, true, 'u2')

    dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'Host' })
    dispatch(guest, {
      type: 'joinRoom',
      roomId: host.currentRoom!.id,
      name: 'Guest',
    })
    expect(persistence.loadReplayHead(host.currentRoom!.id)?.latestStepNo).toBe(0)
    checkpoint.flushAll()
    expect(db.prepare('SELECT version FROM rooms WHERE id = ?').get(host.currentRoom!.id))
      .toEqual({ version: 0 })
    hostWs.send.mockClear()
    guestWs.send.mockClear()

    dispatch(guest, { type: 'action', spaceId: 'forest', requestId: 'rejected-action' })

    expect(messages(hostWs)).toEqual([])
    expect(messages(guestWs)).toContainEqual(expect.objectContaining({
      type: 'stateUpdate',
      requestId: 'rejected-action',
      version: 0,
    }))
    expect(persistence.loadReplayHead(host.currentRoom!.id)?.latestStepNo).toBe(0)
    hostWs.send.mockClear()
    guestWs.send.mockClear()
    db.exec(`
      CREATE TRIGGER reject_action_step
      BEFORE INSERT ON game_replay_steps
      WHEN NEW.step_no = 1
      BEGIN
        SELECT RAISE(ABORT, 'disk unavailable');
      END;
    `)

    dispatch(host, { type: 'action', spaceId: 'forest', requestId: 'action-1' })

    expect(messages(hostWs).map(({ type }) => type)).toEqual(['roomPersistencePaused'])
    expect(messages(guestWs).map(({ type }) => type)).toEqual(['roomPersistencePaused'])
    expect(persistence.loadReplayHead(host.currentRoom!.id)?.latestStepNo).toBe(0)
    expect(tasks.map(({ delay }) => delay)).toEqual([1_000])

    dispatch(host, { type: 'action', spaceId: 'reed-bank', requestId: 'action-2' })
    expect(messages(hostWs)).toContainEqual(expect.objectContaining({
      type: 'error',
      requestId: 'action-2',
    }))

    const reconnectWs = fakeWs()
    const reconnect = createConnectionCtx(reconnectWs as never, deps, true, 'u2')
    dispatch(reconnect, {
      type: 'joinRoom',
      roomId: host.currentRoom!.id,
      name: 'Renamed Guest',
      requestId: 'reconnect',
    })
    expect(reconnect.currentRoom).toBeNull()
    expect(messages(reconnectWs).map(({ type }) => type)).toEqual([
      'roomPersistencePaused',
    ])

    db.exec('DROP TRIGGER reject_action_step')
    tasks.shift()!.callback()

    expect(messages(guestWs).map(({ type }) => type)).toEqual([
      'roomPersistencePaused',
      'stateUpdate',
      'roomPersistenceResumed',
    ])
    expect(messages(reconnectWs).map(({ type }) => type)).toEqual([
      'roomPersistencePaused',
      'roomPersistenceResumed',
      'roomJoined',
      'playerJoined',
      'stateUpdate',
    ])
    expect(reconnect.currentRoom).toBe(host.currentRoom)
    expect(reconnect.currentRoom!.session.state.players[1]?.name).toBe('Guest')
    expect(persistence.loadReplayHead(host.currentRoom!.id)?.latestStepNo).toBe(1)
    expect(host.currentRoom!.version).toBe(1)

    dispatch(host, {
      type: 'choice',
      value: 'confirm',
      requestId: 'confirm-turn',
    })
    expect(persistence.loadReplayHead(host.currentRoom!.id)?.latestStepNo).toBe(2)

    hostWs.send.mockClear()
    guestWs.send.mockClear()
    db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
      ) VALUES (?, 3, 3, 0, 1, 'action', '{}', 'delta', X'00', ?, 1003)
    `).run(host.currentRoom!.id, 'f'.repeat(64))

    dispatch(guest, {
      type: 'action',
      spaceId: 'reed-bank',
      requestId: 'action-conflict',
    })

    expect(messages(guestWs)).toContainEqual(expect.objectContaining({
      type: 'error',
      requestId: 'action-conflict',
    }))

    committer.shutdown()
    checkpoint.shutdown()
    db.close()
  })
})
