import { describe, expect, it, vi } from 'vitest'
import type { ActionDefinition, ActionAvailabilityContext, Resource } from '../../shared/contract/types'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { deriveCanBeExecutedByFlow, initializeFlowDerivedCanBeExecutedByPlayer } from '../../shared/actions/flow'
import type { ActionRegistry } from '../../shared/engine/registry'
import { serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

// Query the real Session placement boundary. Cost preview already owns the
// final base doability result; the discarded leaf predicate must not run.
const setup = () => {
  const session = new GameSession(941, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  session.state.currentPlayerIndex = 0
  session.state.players[0]!.resources.food = 2
  const registry = (session as unknown as { registry: ActionRegistry }).registry
  const baseProbe = vi.fn(() => false)
  const previewProbe = vi.fn((context: ActionAvailabilityContext, costs?: Partial<Resource>) =>
    context.player.resources.food >= 3 + (costs?.food ?? 0))
  const leaf: ActionDefinition = {
    ...registry.get('gain')!,
    id: '__cost_preview_probe__',
    canBeExecutedByPlayer: baseProbe,
    costPreview: { getBaseCost: () => ({ food: 3 }), canExecute: previewProbe },
  }
  registry.register(leaf)
  const action: ActionDefinition = {
    ...registry.get('forest')!,
    strictCanExecute: false,
    canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
    flow: { type: 'leaf', actionId: leaf.id, params: { food: 1 } },
  }
  initializeFlowDerivedCanBeExecutedByPlayer(action, id => registry.get(id))
  registry.register(action)
  const space = session.state.actionSpaces.find(entry => entry.id === 'forest')!
  Object.assign(space, action, { takenBy: [] })
  return { session, leaf, space, baseProbe, previewProbe }
}

describe('Session cost preview probes', () => {
  it.each([false, true])('skips the discarded leaf predicate, preview=%s', (available) => {
    const { session, baseProbe, previewProbe } = setup()
    baseProbe.mockReturnValue(!available)
    previewProbe.mockReturnValue(available)
    const before = serializeSessionSnapshot(session.state, session)

    expect(session.getActionAvailability(0).forest).toBe(available)
    expect(baseProbe).not.toHaveBeenCalled()
    expect(previewProbe).toHaveBeenCalledOnce()
    previewProbe.mockClear()
    expect(session.getAvailableActions(0).some(action => action.spaceId === 'forest')).toBe(available)
    expect(baseProbe).not.toHaveBeenCalled()
    expect(previewProbe).toHaveBeenCalledOnce()
    expect(serializeSessionSnapshot(session.state, session)).toEqual(before)
    if (!available) {
      expect(session.takeAction(0, 'forest').ok).toBe(false)
      expect(serializeSessionSnapshot(session.state, session)).toEqual(before)
    }
  })

  it('recomputes the preview from current state on each query', () => {
    const { session, baseProbe, previewProbe } = setup()
    expect(session.getActionAvailability(0).forest).toBe(false)
    session.state.players[0]!.resources.food = 3
    expect(session.getActionAvailability(0).forest).toBe(true)
    expect(previewProbe).toHaveBeenCalledTimes(2)
    expect(baseProbe).not.toHaveBeenCalled()
  })

  it.each([-1, 1])('keeps computeCosts adjustment %s in admission', (foodAdjustment) => {
    const { session, leaf, baseProbe, previewProbe } = setup()
    session.state.players[0]!.resources.food = 3
    session.withCtx(() => requireActiveCardRegistry('cost preview probe').registerListener({
      id: '__preview_cost_adjustment__',
      actions: [leaf.id],
      phases: ['computeCosts'],
      handler: () => ({ costs: { food: foodAdjustment } }),
    }))
    const available = foodAdjustment < 0
    baseProbe.mockReturnValue(!available)
    expect(session.getActionAvailability(0).forest).toBe(available)
    expect(previewProbe.mock.calls[0]![1]).toEqual({ food: foodAdjustment })
    expect(baseProbe).not.toHaveBeenCalled()
    const before = serializeSessionSnapshot(session.state, session)
    const response = session.takeAction(0, 'forest')
    expect(response.ok).toBe(available)
    if (available) expect(response.state.players[0]!.resources.food).toBe(4)
    else expect(serializeSessionSnapshot(session.state, session)).toEqual(before)
  })

  it('keeps the structural preview gate before its canExecute check', () => {
    const { session, leaf, baseProbe, previewProbe } = setup()
    const structural = vi.fn(() => false)
    leaf.costPreview!.isStructurallyPossible = structural
    previewProbe.mockReturnValue(true)
    expect(session.getActionAvailability(0).forest).toBe(false)
    expect(structural).toHaveBeenCalledOnce()
    expect(baseProbe).not.toHaveBeenCalled()
    expect(previewProbe).not.toHaveBeenCalled()
    structural.mockReturnValue(true)
    expect(session.getActionAvailability(0).forest).toBe(true)
    expect(previewProbe).toHaveBeenCalledOnce()
  })

  it('preserves a strict custom composite gate before the leaf preview', () => {
    const { session, space, previewProbe } = setup()
    const strictGate = vi.fn(() => false)
    space.strictCanExecute = true
    space.canBeExecutedByPlayer = strictGate
    previewProbe.mockReturnValue(true)
    expect(session.getActionAvailability(0).forest).toBe(false)
    expect(strictGate).toHaveBeenCalledOnce()
    expect(previewProbe).not.toHaveBeenCalled()
    strictGate.mockReturnValue(true)
    expect(session.getActionAvailability(0).forest).toBe(true)
    expect(previewProbe).not.toHaveBeenCalled()
  })

  it.each([false, true])('preserves the leaf isDoable override, doable=%s', (doable) => {
    const { session, leaf, previewProbe } = setup()
    previewProbe.mockReturnValue(!doable)
    session.withCtx(() => requireActiveCardRegistry('cost preview probe').registerListener({
      id: '__preview_doable_override__',
      actions: [leaf.id],
      phases: ['isDoable'],
      handler: () => ({ doable }),
    }))
    expect(session.getActionAvailability(0).forest).toBe(doable)
    expect(previewProbe).toHaveBeenCalledOnce()
  })

  it('retains child hook queries when a composite itself has a cost preview', () => {
    const { session, leaf, space, previewProbe } = setup()
    previewProbe.mockReturnValue(false)
    const childHook = vi.fn(() => undefined)
    session.withCtx(() => requireActiveCardRegistry('cost preview probe').registerListener({
      id: '__preview_child_observation__',
      actions: [leaf.id],
      phases: ['isDoable'],
      handler: childHook,
    }))
    space.costPreview = { getBaseCost: () => ({}), canExecute: () => true }
    expect(session.getActionAvailability(0).forest).toBe(true)
    expect(previewProbe).toHaveBeenCalledOnce()
    expect(childHook).toHaveBeenCalledOnce()
  })
})
