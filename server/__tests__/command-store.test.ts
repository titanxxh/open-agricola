import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { CommandStore } from '../game/command-store'

let commands: CommandStore
let peer: CommandStore
let now = Date.now()
beforeAll(async () => { const db = await createTestDatabase(); commands = new CommandStore(db, () => now); peer = new CommandStore(db, () => now) })
afterAll(async () => { await commands.db.close() })

it('reserves one creation outcome across concurrent callers and excludes transport request IDs', async () => {
  const scope = await commands.issueScope('alice')
  const identity = { scopeId: scope.scopeId, commandId: randomUUID() }
  const [first, second] = await Promise.all([
    commands.reserve('alice', identity, null, { type: 'createRoom', maxPlayers: 2, requestId: 'first' }),
    peer.reserve('alice', identity, null, { maxPlayers: 2, type: 'createRoom', requestId: 'retry' }),
  ])
  expect(first).toEqual(second)
  expect(first.kind).toBe('pending')
  if (first.kind !== 'pending') throw new Error('Expected reservation')
  expect(first.request.resultRoomId).toMatch(/^[a-f0-9-]{36}$/)
  await expect(peer.reserve('alice', identity, null, { type: 'createRoom', maxPlayers: 3 })).rejects.toMatchObject({ code: 'command_content_conflict' })
  await expect(peer.lookup('bob', identity)).rejects.toMatchObject({ code: 'command_scope_expired' })
})

it('commits the receipt with its domain write and returns it before reevaluating input', async () => {
  const scope = await commands.issueScope('alice')
  const identity = { scopeId: scope.scopeId, commandId: randomUUID() }
  const command = { type: 'action', spaceId: 'forest', expectedVersion: 7 }
  const reserved = await commands.reserve('alice', identity, 'room-one', command)
  if (reserved.kind !== 'pending') throw new Error('Expected reservation')
  const outcome = { ok: true, roomId: 'room-one', roomVersion: 8, stepNo: 8 }
  await expect(commands.complete(reserved.request, outcome)).rejects.toThrow('enclosing transaction')
  await expect(commands.db.transaction(async () => {
    await commands.db.prepare("INSERT INTO game_contexts(room_id, lifecycle, created_at, updated_at) VALUES ('receipt-rollback', 'active', 1, 1)").run()
    await commands.complete(reserved.request, outcome)
    throw new Error('rollback')
  })()).rejects.toThrow('rollback')
  expect(await peer.lookup('alice', identity)).toMatchObject({ kind: 'pending' })
  expect(await commands.db.prepare("SELECT 1 FROM game_contexts WHERE room_id = 'receipt-rollback'").get()).toBeUndefined()
  await commands.db.transaction(async () => { await commands.complete(reserved.request, outcome) })()
  expect(await peer.reserve('alice', identity, 'room-one', command)).toMatchObject({ kind: 'completed', receipt: { ...identity, outcome } })
  await expect(peer.reserve('alice', identity, 'room-two', command)).rejects.toMatchObject({ code: 'command_content_conflict' })
})

it('does not turn an expired or cleaned identity into a new operation', async () => {
  const scope = await commands.issueScope('alice')
  const identity = { scopeId: scope.scopeId, commandId: randomUUID() }
  const pending = await commands.reserve('alice', identity, 'room', { type: 'undoAction', expectedVersion: 1 })
  if (pending.kind !== 'pending') throw new Error('Expected reservation')
  await commands.db.transaction(async () => { await commands.complete(pending.request, { ok: false, roomId: 'room', error: 'No undo' }) })()
  now = scope.expiresAt + 1
  await expect(peer.resumeScope('alice', scope.scopeId)).rejects.toMatchObject({ code: 'command_scope_expired' })
  await commands.cleanup()
  await expect(peer.lookup('alice', identity)).rejects.toMatchObject({ code: 'command_scope_expired' })
  await expect(peer.reserve('alice', identity, 'room', { type: 'undoAction', expectedVersion: 1 })).rejects.toMatchObject({ code: 'command_scope_expired' })
})
