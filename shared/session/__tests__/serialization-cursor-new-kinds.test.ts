import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { rehydrateState, serializeState } from '../serialization'
import { INTERACTION_ONLY_ACTION_ID } from '../../engine'
import type { InteractionRequest } from '../../contract/types'

/**
 * S2 Task 13 step 10 — verify the three S2-new InteractionRequest kinds
 * (farm-select / selection / card-draft) survive cursor round-trip via
 * `serializeState` → `rehydrateState`.
 *
 * Existing cursor tests in `serialization-cursor.test.ts` cover choice /
 * animal-reorg / feed / confirm-next-player / confirm-player-switch through
 * full GameSession flows. The three kinds added in S2 Task 2 don't yet have
 * effect-side emitters wired up (deferred per `docs/sprint-S2-progress.md`
 * §3), so we exercise them here by constructing a minimal session that
 * pushes a synthetic pending frame onto its engineStack.
 */

const pushSyntheticInteraction = (
  session: GameSession,
  request: InteractionRequest,
  promptKey: string,
  choices = [{ value: 'confirm', labelKey: 'ui.cursorTestConfirm' }],
): void => {
  // Drive the public synthetic-frame path, then repurpose the envelope for
  // the specific request kind under test.
  const engineStack = session.getEngineStack()
  session.startDevFenceSelect(0)
  const frame = engineStack.current()
  expect(frame).toBeDefined()
  if (!frame) return
  const host = frame.engine.peekPendingHost()
  expect(host).toBeDefined()
  if (!host) return
  host.setPending({
    hostNodeId: host.id,
    request,
    choices,
    promptKey: promptKey as never,
    pendingActionId: INTERACTION_ONLY_ACTION_ID,
    ownerNodeId: null,
    contextSnapshot: {
      params: undefined,
      costs: undefined,
      sourceCard: undefined,
      actionContext: undefined,
    },
    syntheticKind: 'interaction-only',
  })
}

describe('serialization cursor — new InteractionRequest kinds', () => {
  it('choice envelope choices override request options in session responses', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    session.loadState(state)

    pushSyntheticInteraction(
      session,
      {
        kind: 'choice',
        options: [{ value: 'request-only', labelKey: 'ui.requestOnly' }],
      },
      'ui.interactionOptionalAction',
      [{ value: 'envelope-choice', labelKey: 'ui.envelopeChoice' }],
    )

    const interaction = session.getState().interaction
    expect(interaction.stateId).toBe('wait')
    if (interaction.stateId === 'wait') {
      expect(interaction.options?.map((option) => option.value)).toEqual(['envelope-choice'])
    }
  })

  it('farm-select kind survives serialize/rehydrate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    session.loadState(state)

    const request: InteractionRequest = {
      kind: 'farm-select',
      farm: {
        farmType: 'plow',
        selectableTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      },
    }
    pushSyntheticInteraction(session, request, 'ui.interactionPlowSelect')

    const before = session.getState()
    const stack = session.getEngineStack()
    const envelope = stack.peekPendingEnvelope()
    expect(envelope?.request.kind).toBe('farm-select')
    expect(envelope?.hostNodeId).toBeTruthy()

    const serialized = serializeState(before.state, { engineStack: stack })
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)
    const restored = new GameSession(rehydrated)
    const restoredEnvelope = restored.getEngineStack().peekPendingEnvelope()
    expect(restoredEnvelope?.request.kind).toBe('farm-select')
    expect(restoredEnvelope?.request).toEqual(request)
    expect(restoredEnvelope?.hostNodeId).toBeTruthy()
  })

  it('selection kind (farm-position) survives serialize/rehydrate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    session.loadState(state)

    const request: InteractionRequest = {
      kind: 'selection',
      selection: {
        selectionType: 'farm-position',
        selectablePositions: [{ row: 1, col: 1 }, { row: 1, col: 2 }],
        minSelections: 1,
        maxSelections: 2,
      },
    }
    pushSyntheticInteraction(session, request, 'ui.interactionSelection')

    const serialized = serializeState(session.getState().state, {
      engineStack: session.getEngineStack(),
    })
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)
    const restored = new GameSession(rehydrated)
    const restoredEnvelope = restored.getEngineStack().peekPendingEnvelope()
    expect(restoredEnvelope?.request.kind).toBe('selection')
    expect(restoredEnvelope?.request).toEqual(request)
    expect(restoredEnvelope?.hostNodeId).toBeTruthy()
  })

  it('selection kind (occupation-hand) survives serialize/rehydrate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    session.loadState(state)

    const request: InteractionRequest = {
      kind: 'selection',
      selection: {
        selectionType: 'occupation-hand',
        selectableCards: ['A001_TestOcc', 'A002_TestOcc'],
        minSelections: 1,
        maxSelections: 1,
      },
    }
    pushSyntheticInteraction(session, request, 'ui.interactionOccupationHand')

    const serialized = serializeState(session.getState().state, {
      engineStack: session.getEngineStack(),
    })
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)
    const restored = new GameSession(rehydrated)
    const restoredEnvelope = restored.getEngineStack().peekPendingEnvelope()
    expect(restoredEnvelope?.request.kind).toBe('selection')
    expect(restoredEnvelope?.request).toEqual(request)
    expect(restoredEnvelope?.hostNodeId).toBeTruthy()
  })

  it('card-draft kind survives serialize/rehydrate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    session.loadState(state)

    const request: InteractionRequest = {
      kind: 'card-draft',
      mode: 'simultaneous',
      round: 1,
      totalRounds: 4,
      poolSize: 7,
      seatOrder: ['p1', 'p2'],
      pools: {
        p1: { occ: ['o1', 'o2'], minor: ['m1', 'm2'] },
        p2: { occ: ['o3', 'o4'], minor: ['m3', 'm4'] },
      },
      pendingPicks: [],
      kept: {
        p1: { occ: [], minor: [] },
        p2: { occ: [], minor: [] },
      },
    }
    pushSyntheticInteraction(session, request, 'ui.interactionCardDraft' as never)

    const serialized = serializeState(session.getState().state, {
      engineStack: session.getEngineStack(),
    })
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)
    const restored = new GameSession(rehydrated)
    const restoredEnvelope = restored.getEngineStack().peekPendingEnvelope()
    expect(restoredEnvelope?.request.kind).toBe('card-draft')
    expect(restoredEnvelope?.request).toEqual(request)
    expect(restoredEnvelope?.hostNodeId).toBeTruthy()
    const restoredInteraction = restored.getState().interaction
    expect(restoredInteraction.stateId).toBe('wait')
    if (restoredInteraction.stateId === 'wait') {
      expect(restoredInteraction.allowedCommands).not.toContain('resolveChoice')
    }
    expect(restored.resolveChoice(0, 'confirm').ok).toBe(false)
  })

  it('engine-blocked kind survives serialize/rehydrate and exposes no undo commands without history', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    session.loadState(state)

    const request: InteractionRequest = {
      kind: 'engine-blocked',
      actionId: 'bake-bread',
    }
    pushSyntheticInteraction(session, request, 'ui.interactionEngineBlocked', [])

    const serialized = serializeState(session.getState().state, {
      engineStack: session.getEngineStack(),
    })
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)
    const restored = new GameSession(rehydrated)
    const restoredEnvelope = restored.getEngineStack().peekPendingEnvelope()
    expect(restoredEnvelope?.request).toEqual(request)

    const restoredInteraction = restored.getState().interaction
    expect(restoredInteraction.stateId).toBe('wait')
    if (restoredInteraction.stateId === 'wait') {
      expect(restoredInteraction.allowedCommands).toEqual([])
      expect(restoredInteraction.anytimeActions).toEqual([])
      expect(restoredInteraction.options).toEqual([])
      expect(restored.resolveChoice(0, 'confirm').ok).toBe(false)
    }
  })
})
