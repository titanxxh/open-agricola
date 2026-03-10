import { describe, expect, it } from 'vitest'
import type { GameSyncPayload, StateUpdateCause, StateUpdateEnvelope } from '../shared/protocol/game'
import type { ClientCommand, ServerEvent, RoomSummary } from '../shared/protocol/ws'
import type { PendingAction } from '../shared/game/types'
import { serializeState } from '../shared/game/serialization'
import { createInitialState } from '../shared/logic/state'

describe('shared protocol types', () => {
  it('GameSyncPayload can be constructed from SessionResponse', () => {
    const state = createInitialState(42)
    const payload: GameSyncPayload = {
      state: serializeState(state),
      pending: { type: 'none' },
      scores: null,
      historyLength: 0,
      hasActionStartSnapshot: false,
      ok: true,
    }
    expect(payload.ok).toBe(true)
    expect(payload.state.round).toBe(1)
    expect(payload.pending.type).toBe('none')
  })

  it('StateUpdateEnvelope wraps a GameSyncPayload', () => {
    const state = createInitialState(42)
    const envelope: StateUpdateEnvelope = {
      type: 'stateUpdate',
      roomId: 'abc123',
      version: 1,
      sync: 'snapshot',
      cause: 'action',
      payload: {
        state: serializeState(state),
        pending: { type: 'none' },
        scores: null,
        historyLength: 0,
        hasActionStartSnapshot: false,
        ok: true,
      },
      emittedAt: Date.now(),
    }
    expect(envelope.type).toBe('stateUpdate')
    expect(envelope.version).toBe(1)
  })

  it('PendingAction covers all variants', () => {
    const variants: PendingAction[] = [
      { type: 'none' },
      { type: 'choice', playerIndex: 0, spaceId: 'test', options: [] },
      { type: 'animalReorg', playerIndex: 0, spaceId: 'test' },
      { type: 'harvestFeed', playerIndex: 0, remaining: 5 },
      { type: 'harvestFeed', playerIndex: 0, remaining: 3, feedQueue: [{ index: 1, remaining: 2 }] },
      { type: 'confirmNextPlayer', nextPlayerIndex: 1 },
    ]
    expect(variants.length).toBe(6)
    variants.forEach((v) => expect(v.type).toBeDefined())
  })

  it('ClientCommand covers all action types', () => {
    const commands: ClientCommand[] = [
      { type: 'action', spaceId: 'test' },
      { type: 'choice', value: 'confirm' },
      { type: 'reorg', zones: [] },
      { type: 'feed', selections: [] },
      { type: 'nextPlayer' },
      { type: 'roundEnd' },
      { type: 'getState' },
      { type: 'createRoom', maxPlayers: 2 },
      { type: 'joinRoom', roomId: 'abc', requestedPlayerIndex: 0 },
    ]
    expect(commands.length).toBe(9)
  })

  it('ServerEvent discriminates on type', () => {
    const events: ServerEvent[] = [
      { type: 'error', error: 'test' },
      { type: 'roomCreated', roomId: 'abc', playerIndex: 0 },
      { type: 'roomJoined', roomId: 'abc', playerIndex: 1 },
      { type: 'gameStarted' },
      { type: 'playerDisconnected', playerIndex: 0 },
    ]
    expect(events.length).toBe(5)
  })

  it('StateUpdateCause has all expected values', () => {
    const causes: StateUpdateCause[] = ['action', 'choice', 'reorg', 'feed', 'undo', 'dev', 'reconnect']
    expect(causes.length).toBe(7)
  })

  it('RoomSummary has expected shape', () => {
    const room: RoomSummary = { id: 'abc', playerCount: 1, maxPlayers: 2 }
    expect(room.id).toBe('abc')
  })
})
