import { randomUUID } from 'node:crypto'
import { beforeEach, afterEach, vi } from 'vitest'
import type { ClientCommand } from '../../../shared/contract/protocol/ws'
import * as database from '../../db'
import { createTestDatabase } from './postgres'
import { recordingResources } from './recording'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter'
import { RoomRegistry } from '../../game/room-registry'
import { RoomCommitter } from '../../game/room-committer'
import { CommandStore } from '../../game/command-store'
import { drainRoomWork } from '../../game/room-queue'
import { createRoomPersistenceCheckpoint } from '../../game/room-persistence-checkpoint'
import { createLobby } from '../../game/lobby'
import { Broadcaster } from '../../connection/broadcaster'
import { dispatch as dispatchCommand } from '../../connection/room-router'
import type { ConnectionCtx } from '../../connection/connection-ctx'

/** Real recorded Room fixtures; transport messages remain visible to each test. */
export function recordedRouterFixture() {
  let db: Awaited<ReturnType<typeof createTestDatabase>>
  let recording: Awaited<ReturnType<typeof recordingResources>>
  const instances: Array<{ registry: RoomRegistry; committer: RoomCommitter }> = []
  const users = new Set<string>()
  const scopes = new Map<string, string>()
  beforeEach(async () => {
    db = await createTestDatabase()
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    recording = await recordingResources(db)
    vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true')
  })
  afterEach(async () => {
    for (const instance of instances) instance.committer.shutdown()
    await drainRoomWork()
    for (const { registry } of instances) for (const room of registry.iter()) {
      registry.delete(room.id)
      room.session.dispose()
    }
    instances.length = 0
    scopes.clear(); users.clear()
    await recording?.close()
    await db?.close()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  const newDeps = (persistence = new PostgresRoomPersistence(db)) => {
    const registry = new RoomRegistry()
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const broadcaster = new Broadcaster()
    const commands = new CommandStore(db)
    const committer = new RoomCommitter({ persistence, ...recording.replay, resources: recording.resources,
      viewerBuildExists: async id => !!await recording.resources.viewer(id) })
    const deps = { persistence, registry, checkpoint, broadcaster, commands, committer,
      gameContextStore: recording.gameContextStore, lobby: createLobby({ registry, checkpoint, broadcaster }) }
    instances.push(deps)
    return deps
  }
  const dispatch = async (ctx: ConnectionCtx, command: ClientCommand) => {
    // Capture the client's version before asynchronous scope/user preparation.
    const input = ctx.currentRoom ? { roomId: ctx.currentRoom.id, expectedVersion: ctx.currentRoom.version,
      inputWindowId: ctx.currentRoom.inputWindow?.id } : {}
    const actor = ctx.currentUserId ? `user:${ctx.currentUserId}` : 'development-anonymous'
    if (ctx.currentUserId && !users.has(ctx.currentUserId)) {
      await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'hash',1) ON CONFLICT(id) DO NOTHING")
      .run(ctx.currentUserId, ctx.currentUserId, ctx.currentUserId)
      users.add(ctx.currentUserId)
    }
    if (!scopes.has(actor)) scopes.set(actor, (await ctx.commands!.issueScope(actor)).scopeId)
    await dispatchCommand(ctx, { ...command, commandContext: command.commandContext ?? {
      scopeId: scopes.get(actor)!, commandId: randomUUID(), ...(command.type === 'createRoom' ? {} : input),
    } })
  }
  return { newDeps, dispatch }
}
