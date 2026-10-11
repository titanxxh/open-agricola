import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playOccupation, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'
import { computeAllowedPlacementSpaces } from '../../shared/actions/helpers/placement-availability'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'

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
    sheep.resources.sheep = 0
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
      const available = (actionContext?: Record<string, unknown>) => computeAllowedPlacementSpaces(state, player, { actionContext })
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
