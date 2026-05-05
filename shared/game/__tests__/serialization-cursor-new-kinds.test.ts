import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { rehydrateState, serializeState } from '../serialization'
import { InteractionNode, INTERACTION_ONLY_ACTION_ID } from '../../engine'
import type { ActionFlow, InteractionRequest } from '../types'

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
 * inject-pushes the new-kind InteractionNode onto its engineStack.
 */

const pushSyntheticInteraction = (
  session: GameSession,
  request: InteractionRequest,
  promptKey: string,
): void => {
  // Mirror GameCore.startDevFenceSelect's pattern: push a synthetic
  // interaction-only frame whose engine hosts an injected InteractionNode
  // carrying the new-kind request.
  const node = new InteractionNode(
    `interaction:cursor-test-${request.kind}`,
    [{ value: 'confirm', labelKey: 'ui.cursorTestConfirm' }],
    request,
  )
  // setChoice writes promptKey + choices on the node so snapshot.choiceData
  // captures both alongside the request.
  node.setChoice(promptKey as never, [
    { value: 'confirm', labelKey: 'ui.cursorTestConfirm' },
  ])

  const flow: ActionFlow = { type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID }
  // Using the public `startDevFenceSelect` indirectly is too tied to
  // 'fence-select' shape; instead reach into the engineStack via the
  // public getEngineStack accessor and synthesise a frame.
  const engineStack = session.getEngineStack()
  // Hack: we rely on internal createFlowEngine being exposed through some
  // path. Instead, drive a real engine via injectInteraction on a fresh one.
  // The simplest in-test approach is to call startDevFenceSelect (which
  // pushes a fence-select frame) then mutate the InteractionNode in place.
  session.startDevFenceSelect(0)
  const frame = engineStack.current()
  expect(frame).toBeDefined()
  if (!frame) return
  const interactionNode = frame.engine.peekInteraction()
  expect(interactionNode).toBeDefined()
  if (!interactionNode) return
  // Repurpose the existing InteractionNode: rewrite its request + promptKey
  // so the cursor round-trip captures the new kind.
  interactionNode.request = request
  interactionNode.setChoice(promptKey as never, node.choices)
  void flow
}

describe('serialization cursor — new InteractionRequest kinds', () => {
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
    expect(stack.peekInteraction()?.request?.kind).toBe('farm-select')

    const serialized = serializeState(before.state, { engineStack: stack })
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)
    const restored = new GameSession(rehydrated)
    const restoredNode = restored.getEngineStack().peekInteraction()
    expect(restoredNode?.request?.kind).toBe('farm-select')
    expect(restoredNode?.request).toEqual(request)
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
    const restoredNode = restored.getEngineStack().peekInteraction()
    expect(restoredNode?.request?.kind).toBe('selection')
    expect(restoredNode?.request).toEqual(request)
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
        selectableCards: ['A1_TestOcc', 'A2_TestOcc'],
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
    const restoredNode = restored.getEngineStack().peekInteraction()
    expect(restoredNode?.request?.kind).toBe('selection')
    expect(restoredNode?.request).toEqual(request)
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
    const restoredNode = restored.getEngineStack().peekInteraction()
    expect(restoredNode?.request?.kind).toBe('card-draft')
    expect(restoredNode?.request).toEqual(request)
  })
})
