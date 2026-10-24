import { afterEach, describe, expect, it } from 'vitest'
import { serializeSessionSnapshot } from '../../shared/session/serialization'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { ActionContext, GameState } from '../../shared/contract/types'
import type { GameSession } from '../game/authoritative-session'

const sessions: GameSession[] = []
const edges = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const SOURCE = '__fence_quote_offer__'
const setup = ({ actionContext, configure }: { actionContext?: ActionContext; configure?: (state: GameState) => void } = {}) => {
  const session = createWorkSession({ configure: state => {
    state.round = 14
    state.actionSpaces.find(space => space.id === 'fencing')!.roundAvailable = 1
    state.players[0]!.resources.wood = 10
    if (actionContext) {
      state.players[0]!.minorPlayed = [SOURCE, 'B030_WoodPalisades']
      state.players[0]!.cardStates[SOURCE] = { counters: { fences: 2 } }
    }
    configure?.(state)
  } })
  sessions.push(session)
  if (actionContext) session.withCtx(() => requireActiveCardRegistry('fence quote test').registerListener({
    id: SOURCE, cardIds: [SOURCE], actions: ['anytime'], phases: ['anytime'],
    handler: () => ({ sourceCard: SOURCE, flow: { type: 'leaf', actionId: 'fence', sourceCard: SOURCE, actionContext } }),
  }))
  const response = actionContext ? session.takeAnytimeAction(0, SOURCE) : session.takeAction(0, 'fencing')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || !response.interaction.requestKey) throw new Error('Expected fence request')
  return { session, requestKey: response.interaction.requestKey }
}
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('authoritative fence selection quote', () => {
  it.each([
    { name: 'unit, palisade and fixed costs', context: { fencePolicy: { costPolicy: { fence: { wood: 2 }, palisade: { wood: 3 }, fixedWood: 1 } } },
      payload: { edges: edges.slice(1), palisadeEdges: edges.slice(0, 1) }, wood: 10 },
    { name: 'reserved free fences and declared discounts', context: { fenceSupplyReservations: { [SOURCE]: { counterKey: 'fences', selectedCount: 2 } },
      fenceCostDiscounts: [{ sourceCard: SOURCE, fenceCount: 1 }] }, payload: { edges }, wood: 1 },
    { name: 'borrowed pieces with a fixed fee', context: { fencePolicy: { sourcePolicy: { kind: 'borrowed', donorCaps: { p2: 4 } },
      costPolicy: { fence: { wood: 0 }, fixedWood: 2 } } },
      payload: { edges, fenceSources: Object.fromEntries(edges.map(edge => [edge, 'p2'])) }, wood: 2 },
  ])('quotes and settles $name', ({ context, payload, wood }) => {
    const { session, requestKey } = setup({ actionContext: context })
    const before = JSON.stringify(serializeSessionSnapshot(session.state, session))
    expect(session.quoteFenceSelection(0, requestKey, payload)).toEqual({ requestKey, woodCost: wood, affordable: true, valid: true, error: null })
    expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(before)
    const built = session.commitSelectionChoice(0, payload)
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(10 - wood)
  })

  it('recomputes geometry-sensitive hooks on the selected edges and keeps registries isolated', () => {
    const { session, requestKey } = setup()
    session.actionHooks.register({ id: '__fence_quote_geometry__', actions: ['fence'], phases: ['computeCosts'],
      handler: context => ({ costs: { wood: Array.isArray(context.params?.newFenceEdges)
        && context.params.newFenceEdges.includes('V-0-1') ? -1 : 1 } }),
    })
    const other = setup()
    const before = JSON.stringify(serializeSessionSnapshot(session.state, session))
    expect(session.quoteFenceSelection(0, requestKey, { edges: edges.slice(0, 2) }).woodCost).toBe(3)
    expect(session.quoteFenceSelection(0, requestKey, { edges }).woodCost).toBe(3)
    expect(other.session.quoteFenceSelection(0, other.requestKey, { edges }).woodCost).toBe(4)
    expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(before)
    expect(session.commitSelectionChoice(0, { edges }).state.players[0]!.resources.wood).toBe(7)
  })

  it('includes the spring reduction while preserving its minimum payment and payment budgets', () => {
    const configure = (state: GameState) => {
      state.enableThroughTheSeasons = true
      state.throughTheSeasons = { startSeason: 'spring', currentSeason: 'spring' }
    }
    const spring = setup({ configure })
    expect(spring.session.quoteFenceSelection(0, spring.requestKey, { edges }).woodCost).toBe(2)
    expect(spring.session.quoteFenceSelection(0, spring.requestKey, { edges: edges.slice(0, 1) }).woodCost).toBe(1)
    expect(spring.session.commitSelectionChoice(0, { edges }).state.players[0]!.resources.wood).toBe(8)
    const budget = setup({ actionContext: { fencePolicy: { paymentBudget: { wood: 4 } } } })
    const tooLarge = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
    expect(budget.session.quoteFenceSelection(0, budget.requestKey, { edges: tooLarge })).toMatchObject({
      woodCost: 6, affordable: false, valid: false, error: 'NOT_ENOUGH_WOOD',
    })
    expect(budget.session.commitSelectionChoice(0, { edges: tooLarge }).ok).toBe(false)
  })

  it('rejects stale requests, other actors and malformed drafts without changing the session', () => {
    const { session, requestKey } = setup()
    const before = JSON.stringify(serializeSessionSnapshot(session.state, session))
    expect(() => session.quoteFenceSelection(1, requestKey, { edges })).toThrow('Fence selection is no longer current')
    expect(() => session.quoteFenceSelection(0, 'old-step', { edges })).toThrow('Fence selection is no longer current')
    expect(() => session.quoteFenceSelection(0, requestKey, { edges, extraWood: Number.NaN })).toThrow('Invalid fence selection')
    expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(before)
  })

  it('quotes partial and complete drafts without changing the interaction, then agrees with actual payment', () => {
    const { session, requestKey } = setup()
    const before = JSON.stringify(serializeSessionSnapshot(session.state, session))
    expect(session.quoteFenceSelection(0, requestKey, { edges: edges.slice(0, 2) })).toMatchObject({
      requestKey, woodCost: 2, affordable: true, valid: false,
    })
    expect(session.quoteFenceSelection(0, requestKey, { edges })).toEqual({
      requestKey, woodCost: 4, affordable: true, valid: true, error: null,
    })
    expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(before)
    const built = session.commitSelectionChoice(0, { edges })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(6)
    expect(built.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid', resources: { wood: 4 }, paymentFor: 'fencing',
    }))
    expect(() => session.quoteFenceSelection(0, requestKey, { edges })).toThrow('Fence selection is no longer current')
  })
})
