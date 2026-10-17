import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playOccupation, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'
import { computeAllowedPlacementSpaces } from '../../shared/actions/helpers/placement-availability'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected } from './_helpers/negative-rule-audit'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

const CARD_ID = 'E105_Pioneer'
const FIREPLACE = 'Major_Fireplace1'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const setup = (lasso = false, played = true) => {
  const session = createWorkSession({ seed: 9707, configure: (state) => {
    state.round = 4
    for (const [position, id] of [[0, 'sheep-market'], [3, 'major-improvement']] as const) {
      const prior = state.roundActionOrder.indexOf(id)
      ;[state.roundActionOrder[position], state.roundActionOrder[prior]] = [state.roundActionOrder[prior]!, state.roundActionOrder[position]!]
    }
    state.availableMajorImprovements = [FIREPLACE]
    const player = state.players[0]!
    player.occupationPlayed = played ? [CARD_ID] : []
    player.occupationHand = played ? ['__test_placeholder__'] : [CARD_ID]
    player.minorPlayed = lasso ? ['B024_Lasso'] : []
    Object.assign(player.resources, { food: 2, clay: 1, wood: 0, reed: 0, stone: 0 })
    const sheep = state.actionSpaces.find((space) => space.id === 'sheep-market')!
    sheep.resources.sheep = 1
  } })
  sessions.push(session)
  return session
}

const chooseClay = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID, request: { kind: 'choice' } })
  if (response.interaction.stateId !== 'wait') throw new Error('Expected Pioneer resources')
  const clay = response.interaction.request.options!.find((option) => option.effectPreview?.resourcesGained?.clay === 1)!
  return choose(session, response, clay.value)
}

describe('E105 Pioneer before placement action', () => {
  it.each([false, true])('uses its before gain to afford the latest major action, extra placement=%s', (lasso) => {
    const session = setup(lasso)
    const before = snapshotResponse(session.getState())
    expect(session.getAvailableActions(0).some((action) => action.spaceId === 'major-improvement')).toBe(true)
    let response = session.takeAction(0, lasso ? 'sheep-market' : 'major-improvement')
    expect(response.ok).toBe(true)
    if (lasso) {
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
      if (response.interaction.request.kind !== 'animal-reorg') throw new Error('Expected sheep accommodation')
      const house = response.interaction.request.zones.find(zone => zone.zoneType === 'house')!
      response = session.resolveChoice(0, 'confirm', {
        zones: [{ id: house.id, zoneType: 'house', animalType: 'sheep', animalCount: 1 }],
      })
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'B024_Lasso', request: { kind: 'choice' } })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected Lasso extra placement')
      const accept = response.interaction.request.options!.find((option) => option.value !== '__skip__')!
      response = choose(session, response, accept.value)
      response = choose(session, response, 'major-improvement')
    }
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.events.some((event) => event.type === 'resource.paid')).toBe(false)
    const restored = restoreSession(session)
    sessions.push(restored)
    response = chooseClay(restored, restored.getState())
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 3 })
    expect(response.state.players[0]!.improvements).toEqual([FIREPLACE])
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const gains = response.state.events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)
    expect(gains).toHaveLength(1)
    const payment = response.state.events.find((event) => event.type === 'resource.paid' && event.sourceCardId === FIREPLACE)!
    const played = response.state.events.find((event) => event.type === 'card.played' && event.cardId === FIREPLACE)!
    expect(payment.seq).toBeGreaterThan(gains[0]!.seq)
    expect(played.seq).toBeGreaterThan(payment.seq)
    expect(response.state.events.filter((event) => event.type === 'worker.placed')).toHaveLength(lasso ? 2 : 1)
    const undone = restored.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(snapshotResponse(undone)).toEqual(before)
  })

  it('does not grant resources for an older action', () => {
    const session = setup()
    const response = session.takeAction(0, 'grain-seeds')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1, food: 2, grain: 1 })
    expect(response.state.events.some((event) => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toBe(false)
  })

  it('keeps its own explicit resource choice in onBuy and recovers it once', () => {
    const session = setup(false, false)
    const response = playOccupation(session, CARD_ID)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    const restored = restoreSession(session)
    sessions.push(restored)
    const done = chooseClay(restored, restored.getState())
    expect(done.state.players[0]!.resources).toMatchObject({ clay: 2, food: 3 })
    expect(done.state.events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(1)
  })

  it('keeps placement queries pure and respects skipBeforeTriggers, explicit veto, and strict predicates', () => {
    const session = setup()
    session.withCtx(() => {
      const state = session.state
      const player = state.players[0]!
      const before = snapshotResponse(session.getState())
      const available = (actionContext?: Record<string, unknown>) => computeAllowedPlacementSpaces(state, player, { actionHooks: session.actionHooks, actionContext })
        .some((entry) => entry.spaceId === 'major-improvement')
      expect(available()).toBe(true)
      expect(available({ skipBeforeTriggers: true })).toBe(false)
      expect(snapshotResponse(session.getState())).toEqual(before)
      const registry = requireActiveCardRegistry('Pioneer placement regression')
      registry.registerListener({ id: 'CUSTOM_Pioneer-placement-veto', actions: ['major-improvement'], phases: ['isDoable'],
        handler: () => ({ doable: false }) })
      expect(available()).toBe(false)
      registry.removeListenersWhere((listener) => listener.id === 'CUSTOM_Pioneer-placement-veto')
      const space = state.actionSpaces.find((entry) => entry.id === 'major-improvement')!
      space.strictCanExecute = true
      space.canBeExecutedByPlayer = () => false
      expect(available()).toBe(false)
    })
  })
})

describe('ae-negative-47-cards', () => {
  const { sessions, save, ok, make, finish, lesson, pioneerChoice } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E105 N1 actual first Lessons chooses each of four building resources and grants exactly one food', () => { for (const resource of ['wood', 'clay', 'reed', 'stone'] as const) { const s = make('E105_Pioneer', undefined, false), r = pioneerChoice(s, lesson(s, 'E105_Pioneer'), resource); assert.equal(r.state.players[0]!.resources[resource], 1); assert.equal(r.state.players[0]!.resources.food, 101); assert.equal([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.stone].filter(n => n > 0).length, 1); save(`E105-N1-${resource}`, r) } })
  it('E105 N2 most recently revealed empty Cattle Market rejects without Pioneer bonuses and another action gives none', () => { const s = make('E105_Pioneer', st => { st.roundActionOrder[7] = 'cattle-market'; st.actionSpaces.find(a => a.id === 'cattle-market')!.resources.cattle = 0 }, true, 8), r = assertEmptyAccumulationRejected(s, 0, 'cattle-market'); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.food, 100); assert.equal(r.state.players[0]!.resources.cattle, 0); const c = make('E105_Pioneer'), cr = finish(c, ok(c.takeAction(0, 'day-laborer')), false); assert.equal(cr.state.players[0]!.resources.food, 102); assert.equal(cr.state.players[0]!.resources.wood, 0); save('E105-N2', { r, cr }) })
})
