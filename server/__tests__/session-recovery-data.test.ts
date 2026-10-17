import { describe, expect, it } from 'vitest'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { confirmNext, undoRuleSnapshot, assertUndoRestored } from './_helpers/session-assertions'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

// Shared recovery defect: real purchases must be followed by exact public undo,
// including naturally empty hands. These scenarios use fresh two-player games.
const evidence = createScenarioEvidence(import.meta.url)

function succeeded(response: SessionResponse): SessionResponse {
  expect(response.ok, response.error).toBe(true)
  return response
}

function playOccupation(session: GameSession, card: string): SessionResponse {
  let response = succeeded(session.takeAction(0, 'lessons'))
  if (response.state.players[0]!.occupationHand.includes(card)) {
    expect(response.interaction.stateId).toBe('wait')
    response = succeeded(session.resolveChoice(0, card))
  }
  expect(response.state.players[0]!.occupationPlayed).toContain(card)
  return response
}

describe('Session Recovery Snapshot data', () => {
  it.each([false, true])('preserves a purchased occupation hand through undo (remaining card: %s)', remaining => {
    const session = evidence.track(createWorkSession({ seed: 4242, configure(state) {
      state.round = 3
      for (const player of state.players) player.resources.food = 40
      state.players[0]!.occupationHand = remaining
        ? ['A102_Grocer', '__test_placeholder__'] : ['A102_Grocer']
    } }))
    confirmNext(session, playOccupation(session, 'A102_Grocer'))
    confirmNext(session, succeeded(session.takeAction(1, 'grain-seeds')))
    const original = session.getState()
    const before = { ...original, state: captureStateWithHistory(original.state),
      interaction: structuredClone(original.interaction), scores: structuredClone(original.scores) }
    expect(before.state.players[0]!.occupationHand).toEqual(remaining ? ['__test_placeholder__'] : [])
    const pending = succeeded(session.takeAction(0, 'farmland'))
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } })
    const undone = succeeded(session.undoAction())
    evidence.record('occupation recovery', { before, undone })
    expect(undone.state.players[0]!.occupationHand).toEqual(before.state.players[0]!.occupationHand)
    for (const response of [undone, session.getState()]) {
      assertUndoRestored(undoRuleSnapshot(before), response)
      expect(response.interaction).toEqual(before.interaction)
      expect(response.state.currentPlayerIndex).toBe(0)
    }
    const retried = succeeded(session.takeAction(0, 'farmland'))
    expect(retried.interaction.stateId).toBe('wait')
    if (retried.interaction.stateId !== 'wait' || retried.interaction.request.kind !== 'farm-select' || retried.interaction.request.farm.farmType !== 'plow') throw new Error('Expected plow retry')
    const result = succeeded(session.commitSelectionChoice(0, { tile: retried.interaction.request.farm.selectableTiles[0]! }))
    expect(result.state.players[0]!.fields).toHaveLength(1)
    expect(result.state.players[0]!.occupationHand).toEqual(before.state.players[0]!.occupationHand)
  })

  it('preserves a naturally empty hand and pending choice through process recovery', () => {
    const session = evidence.track(createWorkSession({ seed: 4242, configure(state) {
      state.round = 3
      for (const player of state.players) player.resources.food = 40
      state.players[0]!.occupationHand = ['A102_Grocer']
    } }))
    confirmNext(session, playOccupation(session, 'A102_Grocer'))
    confirmNext(session, succeeded(session.takeAction(1, 'grain-seeds')))
    const original = session.getState()
    const before = { ...original, state: captureStateWithHistory(original.state),
      interaction: structuredClone(original.interaction), scores: structuredClone(original.scores) }
    const pending = succeeded(session.takeAction(0, 'farmland'))
    const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const persisted = JSON.parse(JSON.stringify(saved))
    const restored = evidence.track(new GameSession(rehydrateState(persisted)))
    expect(restored.state.players[0]!.occupationHand).toEqual([])
    expect(restored.state.players[0]!.playedCards).toEqual([])
    expect(restored.getState().interaction).toEqual(pending.interaction)
    const undone = succeeded(restored.undoAction())
    assertUndoRestored(undoRuleSnapshot(before), undone)
    expect(undone.interaction).toEqual(before.interaction)
    expect(saved.state.players[0]!.occupationHand).toEqual([])
    expect(succeeded(restored.takeAction(0, 'farmland')).interaction.stateId).toBe('wait')
  })

  it('keeps an exhausted passing-minor hand empty when a later action is undone', () => {
    const session = evidence.track(createWorkSession({ seed: 4242, configure(state) {
      state.round = 3
      for (const player of state.players) Object.assign(player.resources, { food: 40, clay: 0 })
      state.players[0]!.minorHand = ['A005_ClayEmbankment']
    } }))
    let purchase = succeeded(session.takeAction(0, 'meeting-place'))
    if (purchase.interaction.stateId === 'wait' && purchase.interaction.request.kind === 'choice') {
      const improvement = purchase.interaction.request.options.find(option => option.value.startsWith('action-improvement-'))
      if (improvement) purchase = succeeded(session.resolveChoice(0, improvement.value))
    }
    if (purchase.state.players[0]!.minorHand.includes('A005_ClayEmbankment')) {
      purchase = succeeded(session.resolveChoice(0, 'A005_ClayEmbankment'))
    }
    expect(purchase.state.players[0]!.minorHand).toEqual([])
    expect(purchase.state.players[0]!.resources).toMatchObject({ food: 39, clay: 0 })
    expect(purchase.state.players[1]!.minorHand).toContain('A005_ClayEmbankment')
    confirmNext(session, purchase)
    confirmNext(session, succeeded(session.takeAction(1, 'grain-seeds')))
    const original = session.getState()
    const before = { ...original, state: captureStateWithHistory(original.state),
      interaction: structuredClone(original.interaction), scores: structuredClone(original.scores) }
    succeeded(session.takeAction(0, 'farmland'))
    const undone = succeeded(session.undoAction())
    for (const response of [undone, session.getState()]) {
      assertUndoRestored(undoRuleSnapshot(before), response)
      expect(response.interaction).toEqual(before.interaction)
      expect(response.state.players[0]!.minorHand).toEqual([])
      expect(response.state.players[1]!.minorHand).toContain('A005_ClayEmbankment')
    }
  })

  it('loads explicitly empty hands without changing optional fields or dealing a new game', () => {
    const source = evidence.track(createWorkSession())
    source.state.players[0]!.minorHand = []
    source.state.players[0]!.occupationHand = []
    source.state.players[0]!.farmTerrain = []
    const saved = captureStateWithHistory(source.state)
    const restored = evidence.track(new GameSession(saved))
    expect(restored.state.players[0]!.minorHand).toEqual([])
    expect(restored.state.players[0]!.occupationHand).toEqual([])
    expect(restored.state.players[0]!.farmTerrain).toEqual([])
    expect(restored.state.players[0]!.playedCards).toEqual([])
    const before = undoRuleSnapshot(restored.getState())
    expect(restored.loadState(saved).ok).toBe(true)
    expect(undoRuleSnapshot(restored.getState())).toBe(before)
  })

  it('retains normal seven-card dealing at the new-game boundary', () => {
    const session = evidence.track(createOpeningSession({ seed: 4242,
      expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } },
    }))
    for (const player of session.state.players) {
      expect(player.minorHand).toHaveLength(7)
      expect(player.occupationHand).toHaveLength(7)
    }
  })
})
