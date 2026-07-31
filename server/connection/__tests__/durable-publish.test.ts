import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import * as database from '../../db.ts'
import { RoomRegistry } from '../../game/room-registry.ts'
import { SqliteRoomPersistence } from '../../game/persistence/sqlite-adapter.ts'
import { createRoomPersistenceCheckpoint } from '../../game/room-persistence-checkpoint.ts'
import { RoomCommitter, type RoomCommitScheduler } from '../../game/room-committer.ts'
import { createLobby } from '../../game/lobby.ts'
import { Broadcaster } from '../broadcaster.ts'
import { createConnectionCtx } from '../connection-ctx.ts'
import { dispatch } from '../room-router.ts'
import { createCard, publish } from '../../workshop-drafts.ts'

const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })

const messages = (ws: ReturnType<typeof fakeWs>): Array<Record<string, unknown>> =>
  ws.send.mock.calls.map(([raw]) => JSON.parse(raw as string) as Record<string, unknown>)

describe('durable publish', () => {
  it('does not publish a successful state until its replay transaction commits', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    database.runMigrations(db)
    vi.spyOn(database, 'getDb').mockReturnValue(db)
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
    const unpublished = createCard(db, {
      authorId: 'u1',
      draft: {
        cardId: 'CUSTOM_Unpublished',
        cardType: 'minor',
        name: 'Unpublished',
        description: 'Unpublished',
        cardJson: {
          id: 'CUSTOM_Unpublished',
          name: 'Unpublished',
          deck: 'CUSTOM',
          number: 1,
          desc: [],
        },
        effectCode: null,
        compiledCode: null,
        codeManifest: null,
        artUrl: null,
        generation: {},
      } as never,
    })
    const draftWs = fakeWs()
    const draftAuthor = createConnectionCtx(draftWs as never, deps, true, 'u1')
    dispatch(draftAuthor, {
      type: 'createRoom',
      maxPlayers: 2,
      customCardIds: [unpublished.id],
      requestId: 'draft-rejected',
    })
    expect(draftAuthor.currentRoom).toBeNull()
    expect(messages(draftWs)).toContainEqual(expect.objectContaining({
      type: 'error',
      requestId: 'draft-rejected',
    }))

    const publishedCard = createCard(db, {
      authorId: 'u1',
      draft: {
        cardId: 'CUSTOM_Published',
        cardType: 'minor',
        name: 'Published',
        description: 'Published',
        cardJson: {
          id: 'CUSTOM_Published',
          name: 'Published',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 1,
          desc: ['Published'],
        },
        effectCode: null,
        compiledCode: null,
        codeManifest: null,
        artUrl: null,
        generation: {},
      } as never,
    })
    publish(db, { cardId: publishedCard.id, authorId: 'u1', baseRevision: publishedCard.revision })
    const publishedWs = fakeWs()
    const publishedAuthor = createConnectionCtx(publishedWs as never, deps, true, 'u1')
    dispatch(publishedAuthor, {
      type: 'createRoom',
      maxPlayers: 2,
      customCardIds: [publishedCard.id],
    })
    expect(publishedAuthor.currentRoom?.customCards).toHaveLength(1)
    dispatch(publishedAuthor, { type: 'dissolveRoom' })

    const hostWs = fakeWs()
    const guestWs = fakeWs()
    const host = createConnectionCtx(hostWs as never, deps, true, 'u1')
    const guest = createConnectionCtx(guestWs as never, deps, true, 'u2')

    dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'Host' })
    hostWs.send.mockClear()
    dispatch(host, {
      type: 'action',
      spaceId: 'forest',
      requestId: 'waiting-action',
    })
    expect(messages(hostWs)).toContainEqual(expect.objectContaining({
      type: 'error',
      requestId: 'waiting-action',
    }))
    expect(persistence.loadReplayHead(host.currentRoom!.id)).toBeNull()
    hostWs.send.mockClear()
    const joinPublications: Array<{ stepNo?: number; names?: string[] }> = []
    const captureJoinPublication = () => {
      const snapshot = persistence.load(host.currentRoom!.id)
      joinPublications.push({
        stepNo: persistence.loadReplayHead(host.currentRoom!.id)?.latestStepNo,
        names: snapshot?.serialized?.players.map((player) => player.name),
      })
    }
    const sendTo = broadcaster.sendTo.bind(broadcaster)
    vi.spyOn(broadcaster, 'sendTo').mockImplementation((ws, event) => {
      if (event.type === 'roomJoined') captureJoinPublication()
      sendTo(ws, event)
    })
    const broadcastEvent = broadcaster.broadcastEvent.bind(broadcaster)
    vi.spyOn(broadcaster, 'broadcastEvent').mockImplementation((room, event) => {
      if (event.type === 'playerJoined') captureJoinPublication()
      broadcastEvent(room, event)
    })
    dispatch(guest, {
      type: 'joinRoom',
      roomId: host.currentRoom!.id,
      name: 'Guest',
    })
    expect(joinPublications).toEqual([
      { stepNo: 0, names: ['Host', 'Guest'] },
      { stepNo: 0, names: ['Host', 'Guest'] },
    ])
    expect(messages(guestWs).map(({ type }) => type)).toEqual([
      'roomJoined',
      'playerJoined',
      'stateUpdate',
      'gameStarted',
    ])
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
      'seat_replaced',
    ])
    expect(guestWs.close).toHaveBeenCalledWith(4001, 'seat replaced')
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
    reconnectWs.send.mockClear()
    db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
      ) VALUES (?, 3, 3, 0, 1, 'action', '{}', 'delta', X'00', ?, 1003)
    `).run(host.currentRoom!.id, 'f'.repeat(64))

    dispatch(reconnect, {
      type: 'action',
      spaceId: 'reed-bank',
      requestId: 'action-conflict',
    })

    expect(messages(reconnectWs)).toContainEqual(expect.objectContaining({
      type: 'error',
      requestId: 'action-conflict',
    }))

    committer.shutdown()
    checkpoint.shutdown()
    db.close()
    vi.restoreAllMocks()
  })
})
