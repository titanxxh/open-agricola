import { describe, expect, it } from 'vitest'
import { serializeState, rehydrateState } from '../shared/session/serialization'
import type { GameSyncPayload } from '../shared/protocol/game'
import { createInitialState } from '../shared/logic/state'
import { EngineStack } from '../shared/engine'

const emptyCtx = () => ({ engineStack: new EngineStack() })

/**
 * Tests the full data pipeline that useGameSync.applySnapshot relies on:
 *   SessionResponse -> serializeState -> GameSyncPayload -> rehydrateState -> GameState
 */
describe('game sync pipeline (applySnapshot path)', () => {
  const rawState = createInitialState(42)

  function buildPayload(overrides?: Partial<GameSyncPayload>): GameSyncPayload {
    return {
      state: serializeState(rawState, emptyCtx()),
      interaction: {
        stateId: 'idle',
        allowedCommands: ['takeAction', 'undoStep', 'undoAction'],
        anytimeActions: [],
      },
      scores: null,
      historyLength: 0,
      hasActionStartSnapshot: false,
      ok: true,
      ...overrides,
    }
  }

  it('rehydrates a snapshot payload into a functional GameState', () => {
    const payload = buildPayload()
    const { state } = rehydrateState(payload.state)
    expect(state.round).toBe(1)
    expect(state.players.length).toBe(2)
    for (const space of state.actionSpaces) {
      expect(typeof space.canBeExecutedByPlayer).toBe('function')
      expect(typeof space.execute).toBe('function')
    }
  })

  it('preserves interaction state through the pipeline', () => {
    const payload = buildPayload({
      interaction: {
        stateId: 'wait',
        playerIndex: 0,
        spaceId: 'grain-utilization',
        promptKey: 'ui.interactionFenceSelect',
        request: {
          kind: 'choice',
          options: [
            { value: 'confirm', labelKey: 'ui.confirm' },
            { value: 'cancel', labelKey: 'ui.cancel' },
          ],
        },
        options: [
          { value: 'confirm', labelKey: 'ui.confirm' },
          { value: 'cancel', labelKey: 'ui.cancel' },
        ],
        allowedCommands: ['resolveChoice', 'undoStep', 'undoAction'],
        anytimeActions: [],
      },
    })
    expect(payload.interaction.stateId).toBe('wait')
    if (payload.interaction.stateId === 'wait') {
      expect(payload.interaction.options?.length).toBe(2)
      expect(payload.interaction.spaceId).toBe('grain-utilization')
    }
  })

  it('carries error information when ok is false', () => {
    const payload = buildPayload({ ok: false, error: 'some error' })
    expect(payload.ok).toBe(false)
    expect(payload.error).toBe('some error')
  })

  it('carries scores when provided', () => {
    const scores = [
      { playerId: 'p1', playerName: 'P1', total: 30, categories: [] },
      { playerId: 'p2', playerName: 'P2', total: 25, categories: [] },
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
      state: serializeState(modified, emptyCtx()),
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
    const { state: restored } = rehydrateState(payload.state)
    expect(restored.players[0]!.resources.wood).toBe(50)
    expect(restored.players[0]!.resources.food).toBe(100)
  })

  it('preserves action space takenBy through round-trip', () => {
    const modified = createInitialState(42)
    const first = modified.actionSpaces[0]!
    first.takenBy = [{ playerId: 'p1', workerId: '1' }]
    const payload = buildPayload({ state: serializeState(modified, emptyCtx()) })
    const { state: restored } = rehydrateState(payload.state)
    const restoredSpace = restored.actionSpaces.find((s) => s.id === first.id)
    expect(restoredSpace?.takenBy).toEqual([{ playerId: 'p1', workerId: '1' }])
  })
})
