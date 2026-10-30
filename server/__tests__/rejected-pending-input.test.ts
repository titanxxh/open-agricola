import { describe, expect, it } from 'vitest'
import type { SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import type { ActionDefinition, ActionFlow, InteractionRequest } from '../../shared/contract/types'
import type { ActionRegistry } from '../../shared/engine/registry'
import type { CommitSelectionPayload } from '../../shared/contract/protocol/commit-selection'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'

const evidence = createScenarioEvidence(import.meta.url)
const cases: Array<{ kind: string; request: InteractionRequest; context?: Record<string, unknown>; invalid: CommitSelectionPayload; retryable: CommitSelectionPayload; valid: CommitSelectionPayload }> = [
  { kind: 'occupation hand', request: { kind: 'selection', selection: { kind: 'occupation-hand', selectableCards: ['A110_HedgeKeeper'], minSelections: 1, maxSelections: 1 } }, context: { selectionKind: 'occupation-hand', minSelections: 1, maxSelections: 1 }, invalid: { cardIds: ['missing'] }, retryable: { cardIds: ['A110_HedgeKeeper'] }, valid: { cardIds: ['A126_Mason'] } },
  { kind: 'farm position', request: { kind: 'selection', selection: { kind: 'farm-position', selectablePositions: [{ row: 0, col: 1 }], minSelections: 1, maxSelections: 1 } }, context: { selectableTiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }], minSelections: 1, maxSelections: 1 }, invalid: { positions: [{ row: -1, col: 1 }] }, retryable: { positions: [{ row: 0, col: 1 }] }, valid: { positions: [{ row: 0, col: 2 }] } },
  { kind: 'resource quantity', request: { kind: 'resource-quantity-select', cardId: '__input_contract__', availableByResource: { wood: 3 }, requireAtLeastOne: true }, invalid: { resourceCounts: { wood: 4 } }, retryable: { resourceCounts: { wood: 2 } }, valid: { resourceCounts: { wood: 1 } } },
  { kind: 'resource batch', request: { kind: 'resource-batch-exchange-select', cardId: '__input_contract__', discardAvailableByResource: { wood: 3 }, receiveResources: ['clay'], maxTotal: 3, requireAtLeastOne: true }, invalid: { resourceBatchExchange: { discard: { wood: 1 }, receive: { clay: 2 } } }, retryable: { resourceBatchExchange: { discard: { wood: 2 }, receive: { clay: 2 } } }, valid: { resourceBatchExchange: { discard: { wood: 1 }, receive: { clay: 1 } } } },
]

// A bounded public Session fixture distinguishes front-door validation from
// effect rejection after history was pushed. The effect intentionally mutates
// before its retryable failure so incomplete checkpoints cannot pass.
function setup(testCase: typeof cases[number]) {
  const session = evidence.track(createWorkSession({ seed: 42, configure(state) {
    state.players[0]!.occupationHand = ['A110_HedgeKeeper', 'A126_Mason']
  } }))
  const registry = (session as unknown as { registry: ActionRegistry }).registry
  const flow: ActionFlow = { type: 'leaf', actionId: '__input_contract__', actionContext: testCase.context }
  const action: ActionDefinition = { ...registry.get('gain')!, id: '__input_contract__', skipChoiceWrap: true,
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'request', promptKey: testCase.kind === 'occupation hand' ? 'ui.interactionOccupationHand' : 'ui.interactionSelection', request: testCase.request }),
    resolveChoice: ({ player }, _choice, payload) => {
      player.resources.food += 1
      const invalid = payload?.cards && (payload.cards as string[])[0] === 'A110_HedgeKeeper'
        || payload?.positions && (payload.positions as string[])[0] === '0-1'
        || payload?.resourceCounts && (payload.resourceCounts as Record<string, number>).wood === 2
        || payload?.resourceBatchExchange && (payload.resourceBatchExchange as { discard: Record<string, number> }).discard.wood === 2
      return invalid ? { type: 'fail', errorKey: 'log.action', recoverable: true } : { type: 'ok' }
    },
  }
  registry.register(action)
  const host = { ...registry.get('forest')!, flow, canBeExecutedByPlayer: () => true }
  registry.register(host)
  Object.assign(session.state.actionSpaces.find(space => space.id === 'forest')!, host)
  return session
}
function snapshot(response: SessionResponse) {
  return { interaction: response.interaction, state: JSON.parse(JSON.stringify(response.state)), historyLength: response.historyLength, hasActionStartSnapshot: response.hasActionStartSnapshot, scores: response.scores }
}

describe('input rejection at structured public Session seams', () => {
  it.each(cases)('$kind rejects prevalidation and effect input atomically, then retries once', testCase => {
    const session = setup(testCase)
    const pending = session.takeAction(0, 'forest')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction.stateId).toBe('wait')
    const before = snapshot(pending)
    for (const payload of [testCase.invalid, testCase.retryable, testCase.retryable]) {
      const rejected = assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, payload))
      expect(snapshot(rejected)).toEqual(before)
      expect(snapshot(session.getState())).toEqual(before)
    }
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, testCase.valid))
    // Same Session retains the fixture's registry while restoring JSON cursor.
    session.loadState(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, testCase.retryable))
    const accepted = session.commitSelectionChoice(0, testCase.valid)
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.resources.food).toBe(before.state.players[0]!.resources.food + 1)
    expect(accepted.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })
})
