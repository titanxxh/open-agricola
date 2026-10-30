import { describe, expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import { serializeSessionSnapshot } from '../../../shared/session/serialization'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'

const { newDeps, dispatch } = recordedRouterFixture()
const edges = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']

const openFenceRoom = async () => {
  const messages: ServerEvent[] = []
  const socket = { OPEN: 1, readyState: 1, send: (raw: string) => messages.push(JSON.parse(raw)), close: vi.fn() }
  const ctx = createConnectionCtx(socket as never, newDeps(), true, 'quote-owner')
  await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, hotseat: true })
  const room = ctx.currentRoom!
  room.session.state.players[0]!.resources.wood = 10
  room.session.state.round = 14
  room.session.state.actionSpaces.find(space => space.id === 'fencing')!.roundAvailable = 1
  for (const player of room.session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  room.session.loadState(room.session.state)
  const pending = room.session.takeAction(0, 'fencing')
  expect(pending.ok, pending.error).toBe(true)
  if (pending.interaction.stateId !== 'wait' || !pending.interaction.requestKey) throw new Error('Expected fence request')
  return { messages, ctx, room, requestKey: pending.interaction.requestKey }
}

describe('room fence selection quotes', () => {
  it('reads the current room without a state publication and rejects stale versions or another seat', async () => {
    const { messages, ctx, room, requestKey } = await openFenceRoom()
    const before = JSON.stringify(serializeSessionSnapshot(room.session.state, room.session))
    messages.length = 0
    await dispatch(ctx, { type: 'quoteFenceSelection', requestId: 'quote', playerIndex: 0,
      requestKey, expectedVersion: room.version, payload: { edges } })
    expect(messages).toEqual([{ type: 'fenceSelectionQuote', requestId: 'quote', roomId: room.id, version: room.version,
      quote: { requestKey, woodCost: 4, affordable: true, valid: true, error: null } }])
    expect(JSON.stringify(serializeSessionSnapshot(room.session.state, room.session))).toBe(before)
    await dispatch(ctx, { type: 'quoteFenceSelection', requestId: 'old', playerIndex: 0,
      requestKey, expectedVersion: room.version - 1, payload: { edges } })
    expect(messages.at(-1)).toMatchObject({ type: 'error', requestId: 'old', error: 'Fence quote is stale' })
    room.hotseat = false
    await dispatch(ctx, { type: 'quoteFenceSelection', requestId: 'other-seat', playerIndex: 1,
      requestKey, expectedVersion: room.version, payload: { edges } })
    expect(messages.at(-1)).toMatchObject({ type: 'error', requestId: 'other-seat', error: 'seat mismatch: you cannot act on another player' })
    expect(JSON.stringify(serializeSessionSnapshot(room.session.state, room.session))).toBe(before)
  })

  it('rejects unknown fence fields in both the quote and the commit, then commits the parsed draft', async () => {
    const { messages, ctx, room, requestKey } = await openFenceRoom()
    const before = JSON.stringify(serializeSessionSnapshot(room.session.state, room.session))
    const stray = { edges, extraWood: 0 } as never
    await dispatch(ctx, { type: 'quoteFenceSelection', requestId: 'stray-quote', playerIndex: 0,
      requestKey, expectedVersion: room.version, payload: stray })
    expect(messages.at(-1)).toMatchObject({ type: 'error', requestId: 'stray-quote', error: 'Invalid fence selection' })
    await dispatch(ctx, { type: 'commitSelection', requestId: 'stray-commit', playerIndex: 0, payload: stray })
    expect(messages.at(-1)).toMatchObject({ type: 'error', requestId: 'stray-commit', error: 'invalid payload' })
    expect(JSON.stringify(serializeSessionSnapshot(room.session.state, room.session))).toBe(before)

    await dispatch(ctx, { type: 'commitSelection', requestId: 'commit', playerIndex: 0, payload: { edges } })
    expect(messages.filter(message => message.type === 'error' && message.requestId === 'commit')).toEqual([])
    const player = room.session.state.players[0]!
    expect(player.resources.wood).toBe(6)
    expect(player.fenceSegments?.map(segment => segment.edge).sort()).toEqual([...edges].sort())
  })
})
