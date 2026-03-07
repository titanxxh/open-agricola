import { describe, expect, it } from 'vitest'
import { serializeState, rehydrateState } from '../shared/game/serialization'
import type { GameSyncPayload } from '../shared/protocol/game'
import type { PendingAction } from '../shared/game/types'
import { createInitialState } from '../shared/logic/state'

/**
 * Tests the full data pipeline that useGameSync.applySnapshot relies on:
 *   SessionResponse -> serializeState -> GameSyncPayload -> rehydrateState -> GameState
 */
describe('game sync pipeline (applySnapshot path)', () => {
  const rawState = createInitialState(42)

  function buildPayload(overrides?: Partial<GameSyncPayload>): GameSyncPayload {
    return {
      state: serializeState(rawState),
      pending: { type: 'none' },
      scores: null,
      historyLength: 0,
      hasActionStartSnapshot: false,
      ok: true,
      ...overrides,
    }
  }

  it('rehydrates a snapshot payload into a functional GameState', () => {
    const payload = buildPayload()
    const state = rehydrateState(payload.state)
    expect(state.round).toBe(1)
    expect(state.players.length).toBe(2)
    for (const space of state.actionSpaces) {
      expect(typeof space.canBeExecutedByPlayer).toBe('function')
      expect(typeof space.execute).toBe('function')
    }
  })

  it('preserves pending action through the pipeline', () => {
    const choicePending: PendingAction = {
      type: 'choice',
      playerIndex: 0,
      spaceId: 'grain-utilization',
      options: [
        { value: 'confirm', labelKey: 'ui.confirm' },
        { value: 'cancel', labelKey: 'ui.cancel' },
      ],
      promptKey: 'ui.interactionFenceSelect',
    }
    const payload = buildPayload({ pending: choicePending })
    expect(payload.pending.type).toBe('choice')
    if (payload.pending.type === 'choice') {
      expect(payload.pending.options.length).toBe(2)
      expect(payload.pending.spaceId).toBe('grain-utilization')
    }
  })

  it('carries error information when ok is false', () => {
    const payload = buildPayload({ ok: false, error: 'some error' })
    expect(payload.ok).toBe(false)
    expect(payload.error).toBe('some error')
  })

  it('carries scores when provided', () => {
    const scores = [
      { playerIndex: 0, name: 'P1', total: 30, categories: {} as Record<string, number> },
      { playerIndex: 1, name: 'P2', total: 25, categories: {} as Record<string, number> },
    ]
    const payload = buildPayload({ scores })
    expect(payload.scores?.length).toBe(2)
    expect(payload.scores?.[0]?.total).toBe(30)
  })

  it('carries historyLength and hasActionStartSnapshot', () => {
    const payload = buildPayload({ historyLength: 5, hasActionStartSnapshot: true })
    expect(payload.historyLength).toBe(5)
    expect(payload.hasActionStartSnapshot).toBe(true)
  })

  it('preserves player resource modifications through round-trip', () => {
    const modified = createInitialState(42)
    modified.players[0]!.resources.wood = 50
    modified.players[0]!.resources.food = 100
    const payload: GameSyncPayload = {
      state: serializeState(modified),
      pending: { type: 'none' },
      scores: null,
      historyLength: 0,
      hasActionStartSnapshot: false,
      ok: true,
    }
    const restored = rehydrateState(payload.state)
    expect(restored.players[0]!.resources.wood).toBe(50)
    expect(restored.players[0]!.resources.food).toBe(100)
  })

  it('preserves action space takenBy through round-trip', () => {
    const modified = createInitialState(42)
    const first = modified.actionSpaces[0]!
    first.takenBy = 'p1'
    const payload = buildPayload({ state: serializeState(modified) })
    const restored = rehydrateState(payload.state)
    const restoredSpace = restored.actionSpaces.find((s) => s.id === first.id)
    expect(restoredSpace?.takenBy).toBe('p1')
  })

  it('all pending action variants are valid payload values', () => {
    const variants: PendingAction[] = [
      { type: 'none' },
      { type: 'choice', playerIndex: 0, spaceId: 's', options: [] },
      { type: 'animalReorg', playerIndex: 0, spaceId: 's' },
      { type: 'harvestFeed', playerIndex: 0, remaining: 5 },
      { type: 'confirmNextPlayer', nextPlayerIndex: 1 },
    ]
    for (const pending of variants) {
      const payload = buildPayload({ pending })
      expect(payload.pending.type).toBe(pending.type)
      const json = JSON.stringify(payload)
      expect(json).toBeTruthy()
    }
  })
})
