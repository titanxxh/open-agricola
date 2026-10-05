import { randomUUID } from 'node:crypto'
import type { ClientCommand } from '../../../shared/contract/protocol/ws'
import type { ConnectionCtx } from '../connection-ctx'
import { CommandStore } from '../../game/command-store'
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import * as database from '../../db'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter'
import { RoomCommitter } from '../../game/room-committer'
import { RoomRegistry } from '../../game/room-registry'
import { createRoomPersistenceCheckpoint } from '../../game/room-persistence-checkpoint'
import { createLobby } from '../../game/lobby'
import { Broadcaster } from '../broadcaster'
import { createConnectionCtx } from '../connection-ctx'
import { dispatch as runDispatch } from '../room-router'

const db = await createTestDatabase()
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
afterAll(async () => { await db.close() })
const socket = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() }) as unknown as WebSocket

it('holds ordinary room execution and a connection room change behind an in-flight commit', async () => {
  vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true')
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  const commands = new CommandStore(db)
  const scope = await commands.issueScope('development-anonymous')
  const dispatch = (ctx: ConnectionCtx, command: ClientCommand) => runDispatch(ctx, ['joinRoom', 'getState'].includes(command.type) ? command : { ...command, commandContext: { scopeId: scope.scopeId, commandId: randomUUID(), ...(command.type === 'createRoom' ? {} : { roomId: ctx.currentRoom!.id, expectedVersion: ctx.currentRoom!.version, inputWindowId: ctx.currentRoom?.inputWindow?.id }) } })
  const persistence = new PostgresRoomPersistence(db)
  const checkpoint = createRoomPersistenceCheckpoint({ persistence })
  const registry = new RoomRegistry()
  const broadcaster = new Broadcaster()
  const committer = new RoomCommitter({ persistence, viewerBuildId: 'test-viewer', gameBuildId: 'test-game', viewerBuildExists: () => true })
  const deps = { commands, registry, checkpoint, broadcaster, committer, lobby: createLobby({ registry, checkpoint, broadcaster }) }
  const host = createConnectionCtx(socket(), deps, true)
  const guest = createConnectionCtx(socket(), deps, true)
  let release!: () => void
  let enter!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const pending: Promise<unknown>[] = []
  try {
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, enableParentCards: false })
    const room = host.currentRoom!
    for (const player of room.session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    await dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id })
    const actor = room.session.state.currentPlayerIndex === 0 ? host : guest
    const observer = actor === host ? guest : host
    const seat = actor.currentPlayerIndex
    const original = persistence.commitReplay.bind(persistence)
    vi.spyOn(persistence, 'commitReplay').mockImplementationOnce(async commit => {
      enter()
      await gate
      return original(commit)
    })
    const action = dispatch(actor, { type: 'action', spaceId: 'forest' })
    pending.push(Promise.resolve(action))
    await Promise.race([entered, Promise.resolve(action).then(() => { throw new Error('Command failed to reach commit') })])
    let readCompleted = false
    const read = Promise.resolve(dispatch(observer, { type: 'getState' })).then(() => { readCompleted = true })
    let moveCompleted = false
    const move = Promise.resolve(dispatch(actor, { type: 'createRoom', maxPlayers: 2 })).then(() => { moveCompleted = true })
    pending.push(read, move)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(readCompleted).toBe(false)
    expect(moveCompleted).toBe(false)
    release()
    await Promise.all([action, read, move])
    expect(actor.currentRoom?.id).not.toBe(room.id)
    expect((await persistence.load(room.id))?.serialized?.state.players[seat]?.resources.wood).toBeGreaterThan(0)
    expect(room.players.some(player => player.ws === actor.ws)).toBe(false)
    const previousRoomId = room.id
    await dispatch(observer, { type: 'newGame' })
    expect(observer.currentRoom?.id).not.toBe(previousRoomId)
    expect(await persistence.load(previousRoomId)).toBeNull()
    expect((await persistence.load(observer.currentRoom!.id))?.meta.status).toBe('waiting')
    expect((await db.prepare('SELECT lifecycle FROM game_contexts WHERE room_id = ?').get(previousRoomId))?.lifecycle).toBe('expired')

  } finally {
    release?.()
    await Promise.allSettled(pending)
    committer.shutdown()
    await checkpoint.shutdown()
    for (const room of registry.iter()) room.session.dispose()
  }
})

it('serializes a duplicate stable creation identity before a Room object exists', async () => {
  const { enqueueRoomCommand } = await import('../../game/room-queue')
  const identity = { scopeId: '01800000-0000-4000-8000-000000000001', commandId: '01800000-0000-4000-8000-000000000002' }
  let created = 0
  let finish: () => void = () => undefined
  const writing = new Promise<void>(resolve => { finish = resolve })
  const first = enqueueRoomCommand(identity, [{}], async () => { await writing; created++; return created })
  const second = enqueueRoomCommand(identity, [{}], () => created)
  await Promise.resolve()
  expect(created).toBe(0)
  finish()
  expect(await first).toBe(1)
  expect(await second).toBe(1)
})
