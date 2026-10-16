import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { rehydrateState, serializeSessionSnapshot, type PersistedSessionSnapshot } from '../../shared/session/serialization'
import type { ActionContext, ActionFlow } from '../../shared/contract/types'

const HOOK_ID = '__stable_cost_contribution__'
const SOURCE = '__stable_price_offer__'
const sessions: GameSession[] = []
const anytimeSessions = new WeakSet<GameSession>()
const registerCost = (session: GameSession, delta: number, sourceScoped = false) => session.actionHooks.register({
  id: HOOK_ID, actions: ['stables'], phases: ['computeCosts'],
  handler: context => sourceScoped && context.sourceCard !== SOURCE ? undefined : {
    costs: { wood: delta }, costAttribution: [{ sourceCard: SOURCE, costs: { wood: delta } }],
  },
})
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
})

const setup = ({ wood = 10, delta = 0, actionContext, sourceScoped = false }: {
  wood?: number; delta?: number; actionContext?: ActionContext; sourceScoped?: boolean
} = {}) => {
  const session = createWorkSession({ configure: state => {
    state.round = 3
    const player = state.players[0]!
    player.resources.wood = wood
    player.minorPlayed = [SOURCE]
    player.workers[4]!.supplyUse = {
      sourceCard: SOURCE, disposition: 'return-to-supply', status: 'reserved', returnRound: state.round,
    }
  } })
  sessions.push(session)
  const flow: ActionFlow = { type: 'leaf', actionId: 'stables', sourceCard: SOURCE, actionContext }
  session.withCtx(() => {
    const registry = requireActiveCardRegistry('stable cost test')
    registry.setEffect({ id: SOURCE, contributeExtraTurn: () => flow })
    if (actionContext || sourceScoped) {
      registry.registerListener({
        id: SOURCE, cardIds: [SOURCE], phases: ['anytime'], handler: () => ({ sourceCard: SOURCE, flow }),
      })
      anytimeSessions.add(session)
    }
  })
  registerCost(session, delta, sourceScoped)
  return session
}

const prices = (session: GameSession) => {
  const entry = serializeSessionSnapshot(session.state, session).frame.players[0]!.scheduledEffects
    .find(effect => effect.sourceCard === SOURCE && effect.timing === 'contributeExtraTurn')
  if (entry?.description.kind !== 'action' || entry.description.effectPreview?.kind !== 'actionCosts') throw new Error('Expected stable prices')
  return entry.description.effectPreview.options.map(option => ({
    amount: option.amount, payments: option.paymentOptions.map(payment =>
      Object.fromEntries(Object.entries(payment.resourcesPaid).filter(([, amount]) => amount > 0))),
  }))
}

const enter = (session: GameSession): SessionResponse => {
  let response = anytimeSessions.has(session) ? session.takeAnytimeAction(0, SOURCE) : session.takeAction(0, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    const stable = response.interaction.request.options.find(option => option.labelKey === 'actions.stables.name')!
    response = session.resolveChoice(0, stable.value)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
  return response
}

const build = (session: GameSession, count: number) => {
  const selected = enter(session)
  if (selected.interaction.stateId !== 'wait' || selected.interaction.request.kind !== 'farm-select') throw new Error('Expected stable selection')
  expect(selected.interaction.request.farm.maxSelections).toBeGreaterThanOrEqual(count)
  return session.commitSelectionChoice(0, { stables: Array.from({ length: count }, (_, col) => ({ row: 0, col })) })
}

describe('stable cost contributions (#1204)', () => {
  it.each([
    [0, 1, 2], [0, 2, 4], [1, 1, 3], [1, 2, 5], [-1, 2, 3], [-10, 2, 0],
  ])('applies a fixed %s wood contribution once when building %s stables, paying %s wood', (delta, count, paid) => {
    const session = setup({ delta })
    const resources = { ...session.state.players[0]!.resources }
    const beforeScores = session.getState().scores
    expect(prices(session)).toContainEqual({ amount: count, payments: [paid ? { wood: paid } : {}] })
    const response = build(session, count)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...resources, wood: 10 - paid })
    expect(response.state.players[0]!.stableTiles).toEqual(Array.from({ length: count }, (_, col) => ({ row: 0, col })))
    const payments = response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'stables')
    if (paid) expect(payments).toEqual([expect.objectContaining({ resources: { wood: paid } })])
    else expect(payments).toEqual([])
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores?.[0]?.total).toBe((beforeScores?.[0]?.total ?? 0) + count)
  })

  it('attributes an action surcharge once, independently of the number of stables', () => {
    const session = setup({ delta: 1 })
    const response = build(session, 2)
    expect(response.ok, response.error).toBe(true)
    expect(readCardResourceStats(response.state.players[0]!, SOURCE)?.paid).toEqual({ wood: 1 })
  })

  it.each([[3, 1], [5, 2], [4, 1]])('offers exactly %s wood worth of stable capacity: %s stables', (wood, max) => {
    const session = setup({ wood, delta: 1 })
    expect(session.getActionAvailability(0)['farm-expansion']).toBe(true)
    const response = enter(session)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected stable selection')
    expect(response.interaction.request.farm.maxSelections).toBe(max)
  })

  it('rejects unaffordable entry and overlarge submissions without payment or construction', () => {
    const poor = setup({ wood: 2, delta: 1 })
    const before = JSON.stringify(poor.state.players)
    expect(poor.getActionAvailability(0)['farm-expansion']).toBe(false)
    expect(poor.takeAction(0, 'farm-expansion').ok).toBe(false)
    expect(JSON.stringify(poor.state.players)).toBe(before)
    const session = setup({ wood: 4, delta: 1 })
    enter(session)
    const response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }, { row: 0, col: 1 }] })
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.events.filter(event => event.type === 'resource.paid')).toEqual([])
  })

  it.each([{ exactCost: { wood: 1 } }, { costOverride: { wood: -1 } }])('separates a declared unit price from the fixed hook fee: %j', actionContext => {
    const session = setup({ delta: 1, actionContext })
    expect(prices(session)).toContainEqual({ amount: 2, payments: [{ wood: 3 }] })
    const response = build(session, 2)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(7)
  })

  it('keeps source-scoped contributions in the payload-aware pricing pass', () => {
    const session = setup({ delta: 1, sourceScoped: true })
    expect(prices(session)).toContainEqual({ amount: 2, payments: [{ wood: 5 }] })
    const response = build(session, 2)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(5)
  })

  it('keeps preview reads pure and agrees with pending recovery, payment and undo', () => {
    const session = setup({ delta: 1 })
    const before = JSON.stringify(serializeSessionSnapshot(session.state, session))
    const expected = prices(session)
    expect(prices(session)).toEqual(expected)
    expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(before)
    enter(session)
    const saved: PersistedSessionSnapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
    const restored = new GameSession(rehydrateState(saved))
    sessions.push(restored)
    registerCost(restored, 1)
    let response = restored.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(7)
    response = restored.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(10)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.events.filter(event => event.type === 'resource.paid')).toEqual([])
    expect(build(restored, 1).state.players[0]!.resources.wood).toBe(7)
  })

  it('keeps simultaneous Session prices and payments isolated', () => {
    const first = setup({ delta: 1 })
    const second = setup({ delta: 2 })
    expect(prices(first)).toContainEqual({ amount: 1, payments: [{ wood: 3 }] })
    expect(prices(second)).toContainEqual({ amount: 1, payments: [{ wood: 4 }] })
    expect(build(first, 1).state.players[0]!.resources.wood).toBe(7)
    expect(build(second, 1).state.players[0]!.resources.wood).toBe(6)
  })
})
