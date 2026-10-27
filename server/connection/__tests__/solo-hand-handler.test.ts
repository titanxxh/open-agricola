import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import { GameSession } from '../../game/authoritative-session'

const { newDeps, dispatch } = recordedRouterFixture()

it('records one seat-bound hand confirmation and replays its receipt after the window closes', async () => {
  const deps = newDeps()
  const send = vi.fn()
  const ws = { OPEN: 1, readyState: 1, send, close: vi.fn() }
  const ctx = createConnectionCtx(ws as never, deps, true)
  ctx.currentUserId = 'solo-owner'
  // Rooms creation is tested by its own feature. This fixture starts the WS
  // command boundary with a recorded, one-seat Room and a real opening Session.
  await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
  const room = ctx.currentRoom!
  room.session.dispose()
  room.session = new GameSession(42, undefined, { playerCount: 1, soloHandMode: 'choose-7', deckIds: ['A'] })
  room.maxPlayers = 1
  room.status = 'playing'
  room.startedAt = 1
  expect((await deps.committer.prepareRoom(room, { missingPrefix: false })).kind).toBe('committed')
  const window = room.inputWindow
  expect(window?.kind).toBe('solo-hand')
  const selection = { groups: room.session.state.soloHandSelection!.groups.map(group => ({ kind: group.kind, cardIds: group.cardIds.slice(0, group.keepCount) })) }
  const scope = await deps.commands.issueScope('user:solo-owner')
  const commandContext = { scopeId: scope.scopeId, commandId: randomUUID(), roomId: room.id,
    expectedVersion: room.version, inputWindowId: window!.id }

  const before = JSON.stringify(room.session.state.soloHandSelection)
  await dispatch(ctx, { type: 'soloHandSubmit', playerIndex: 1, selection, commandContext })
  expect(JSON.stringify(room.session.state.soloHandSelection)).toBe(before)
  expect(room.session.state.players[0]!.minorHand).toEqual([])

  const validContext = { ...commandContext, commandId: randomUUID() }
  const accepted = { type: 'soloHandSubmit' as const, playerIndex: 0, selection, commandContext: validContext }
  await dispatch(ctx, accepted)
  expect(room.session.state.phase).toBe('playing')
  expect(room.session.state.players[0]!.minorHand).toHaveLength(7)
  expect(room.inputWindow).toBeNull()
  const version = room.version
  const events = room.session.state.events.length
  const stored = await deps.persistence.load(room.id)
  expect(stored?.serialized?.state.soloHandSelection?.kept).toEqual(selection)

  await dispatch(ctx, accepted)
  expect(room.version).toBe(version)
  expect(room.session.state.events).toHaveLength(events)
  const receipts = send.mock.calls.map(([raw]) => JSON.parse(raw)).filter(event => event.type === 'commandReceipt' && event.receipt?.commandId === validContext.commandId)
  expect(receipts).toHaveLength(2)
  expect(receipts[0].receipt).toEqual(receipts[1].receipt)
  expect(receipts[0].receipt.outcome.ok).toBe(true)
})
