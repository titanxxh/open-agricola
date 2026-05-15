import { describe, expect, it } from 'vitest'
import type { GameSyncPayload, StateUpdateCause, StateUpdateEnvelope } from '../shared/contract/protocol/game'
import type { ClientCommand, ServerEvent, RoomSummary } from '../shared/contract/protocol/ws'
import type { InteractionRequest } from '../shared/contract/types'
import { serializeState } from '../shared/session/serialization'
import { createInitialState } from '../shared/session/state-bootstrap'
import { EngineStack } from '../shared/engine'

const emptyCtx = () => ({ engineStack: new EngineStack() })

describe('shared protocol types', () => {
  it('GameSyncPayload can be constructed from SessionResponse', () => {
    const state = createInitialState(42)
    const payload: GameSyncPayload = {
      state: serializeState(state, emptyCtx()),
      interaction: {
        stateId: 'idle',
        allowedCommands: ['takeAction', 'undoStep', 'undoAction'],
        anytimeActions: [],
      },
      scores: null,
      historyLength: 0,
      hasActionStartSnapshot: false,
      ok: true,
    }
    expect(payload.ok).toBe(true)
    expect(payload.state.round).toBe(1)
    expect(payload.interaction.stateId).toBe('idle')
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
        state: serializeState(state, emptyCtx()),
        interaction: {
          stateId: 'idle',
          allowedCommands: ['takeAction', 'undoStep', 'undoAction'],
          anytimeActions: [],
        },
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

  it('InteractionRequest covers all variants', () => {
    const variants: InteractionRequest[] = [
      { kind: 'choice', options: [] },
      { kind: 'animal-reorg', zones: [] },
      { kind: 'confirm-next-player', nextPlayerIndex: 1 },
      { kind: 'confirm-player-switch', fromPlayerIndex: 0, toPlayerIndex: 1 },
      { kind: 'feed', remaining: 5, foodUsed: 0 },
      {
        kind: 'feed',
        remaining: 3,
        foodUsed: 1,
        feedQueue: [{ index: 1, remaining: 2, foodUsed: 0 }],
      },
      {
        kind: 'farm-select',
        farm: { farmType: 'plow', selectableTiles: [] },
      },
      { kind: 'select-trigger', ownerPlayerId: 'p1', options: [] },
      {
        kind: 'selection',
        selection: {
          selectionType: 'farm-position',
          selectablePositions: [],
          maxSelections: 1,
        },
      },
      {
        kind: 'card-draft',
        mode: 'simultaneous',
        round: 1,
        totalRounds: 7,
        poolSize: 7,
        seatOrder: [],
        pools: {},
        pendingPicks: [],
          kept: {},
      },
      { kind: 'engine-blocked', actionId: 'bake-bread' },
    ]
    expect(variants.length).toBe(11)
    variants.forEach((v) => expect(v.kind).toBeDefined())
  })

  it('ClientCommand covers all action types', () => {
    const commands: ClientCommand[] = [
      { type: 'action', spaceId: 'test' },
      { type: 'choice', value: 'confirm' },
      { type: 'anytime', actionId: 'bake-bread' },
      { type: 'roundEnd' },
      { type: 'getState' },
      { type: 'createRoom', maxPlayers: 2 },
      { type: 'joinRoom', roomId: 'abc', requestedPlayerIndex: 0 },
    ]
    expect(commands.length).toBe(7)
  })

  it('ServerEvent discriminates on type', () => {
    const events: ServerEvent[] = [
      { type: 'error', error: 'test' },
      { type: 'roomCreated', roomId: 'abc', playerIndex: 0, maxPlayers: 2 },
      { type: 'roomJoined', roomId: 'abc', playerIndex: 1 },
      { type: 'gameStarted' },
      { type: 'playerDisconnected', playerIndex: 0 },
    ]
    expect(events.length).toBe(5)
  })

  it('StateUpdateCause has all expected values', () => {
    const causes: StateUpdateCause[] = ['action', 'choice', 'anytime', 'reorg', 'feed', 'undo', 'dev', 'reconnect']
    expect(causes.length).toBe(8)
  })

  it('RoomSummary has expected shape', () => {
    const room: RoomSummary = { id: 'abc', playerCount: 1, maxPlayers: 2 }
    expect(room.id).toBe('abc')
  })
})
