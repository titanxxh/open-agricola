import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as database from '../../db'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import { recordingResources } from '../../__tests__/_helpers/recording'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter'
import { createConnectionCtx } from '../connection-ctx'
import { dispatch } from '../room-router'
import { createWsServer } from '../ws-server'
import { CommandStore } from '../../game/command-store'
let db: Awaited<ReturnType<typeof createTestDatabase>>
let recording: Awaited<ReturnType<typeof recordingResources>>
let persistence: PostgresRoomPersistence
const servers: Array<Awaited<ReturnType<typeof createWsServer>>> = []
const start = async () => {
  const server = await createWsServer(createServer(), { persistence, ...recording }); servers.push(server); return server
}
beforeEach(async () => {
  vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true')
  db = await createTestDatabase(); recording = await recordingResources(db)
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  persistence = new PostgresRoomPersistence(db)
})
afterEach(async () => {
  for (const server of servers.splice(0)) await server.shutdown()
  await recording.close(); await db.close(); vi.restoreAllMocks(); vi.unstubAllEnvs()
})
const join = async (server: Awaited<ReturnType<typeof createWsServer>>, roomId: string) => {
  const ws = { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() }
  const ctx = createConnectionCtx(ws as never, { ...server, commands: new CommandStore(db), gameContextStore: recording.gameContextStore }, true)
  await dispatch(ctx, { type: 'joinRoom', roomId, requestedPlayerIndex: 0 })
  expect(ws.send.mock.calls.map(([raw]) => JSON.parse(raw))).toContainEqual(expect.objectContaining({ type: 'roomJoined', roomId, playerIndex: 0 }))
  return ctx
}

it('keeps a recorded development game joinable after a normal restart beyond seven days', async () => {
  const first = await start(), ctx = await join(first, 'dev2')
  const scope = await ctx.commands!.issueScope('development-anonymous')
  await dispatch(ctx, { type: 'devSetResources', playerIndex: 0, resources: { wood: 17 }, commandContext: {
    scopeId: scope.scopeId, commandId: randomUUID(), roomId: 'dev2', expectedVersion: ctx.currentRoom!.version,
  } })
  expect(ctx.currentRoom!.session.state.players[0]!.resources.wood).toBe(17)
  const before = await persistence.load('dev2')
  await first.shutdown(); servers.pop()
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 86400000)
  const next = await start(), restored = await join(next, 'dev2')
  expect(restored.currentRoom!.session.state.players[0]!.resources.wood).toBe(17)
  expect((await persistence.load('dev2'))?.serialized).toEqual(before?.serialized)
  expect(await recording.gameContextStore.activeExpiresAt('dev2')).toBeNull()
})

it('exempts development rematches from empty-room expiry and retires ordinary games normally', async () => {
  const server = await start(), ctx = await join(server, 'dev2')
  const scope = await ctx.commands!.issueScope('development-anonymous')
  await dispatch(ctx, { type: 'newGame', commandContext: { scopeId: scope.scopeId, commandId: randomUUID(), roomId: 'dev2', expectedVersion: ctx.currentRoom!.version } })
  const nextId = ctx.currentRoom!.id
  expect(nextId).toMatch(/^dev2-/)
  expect(await recording.gameContextStore.lifecycle('dev2')).toBe('expired')
  await recording.gameContextStore.setActiveExpiry(nextId, 1)
  expect(await recording.gameContextStore.activeExpiresAt(nextId)).toBeNull()
  await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, commandContext: { scopeId: scope.scopeId, commandId: randomUUID() } })
  const ordinary = ctx.currentRoom!.id
  await recording.gameContextStore.setActiveExpiry(ordinary, 1)
  expect(await recording.gameContextStore.lifecycle(ordinary)).toBe('expired')
  expect(await persistence.load(ordinary)).toBeNull()
  await server.shutdown(); servers.pop()
  const restored = await start()
  expect(restored.registry.has(nextId)).toBe(true)
  expect(restored.registry.has('dev2')).toBe(false)
})

it('allocates a fresh permanent game after an explicit development reset without reviving a terminal context', async () => {
  const server = await start()
  expect(await persistence.loadReplayHead('dev2')).not.toBeNull()
  await server.shutdown(); servers.pop()
  await persistence.discard('dev2')
  expect(await recording.gameContextStore.lifecycle('dev2')).toBe('expired')
  const next = await start()
  const replacement = [...next.registry.iter()].find(room => room.id.startsWith('dev2-'))!
  expect(replacement).toBeDefined()
  expect(next.registry.has('dev2')).toBe(false)
  expect((await persistence.loadReplayHead(replacement.id))?.latestStepNo).toBe(0)
  expect(await persistence.loadReplayHead('dev2')).toBeNull()
  expect(await recording.gameContextStore.lifecycle('dev2')).toBe('expired')
})
