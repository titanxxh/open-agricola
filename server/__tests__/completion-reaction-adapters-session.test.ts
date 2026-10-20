import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { readTurnScopeToken } from '../../shared/cards/helpers/turn-token'

const FRESH = 'A097_Freshman'
const BUYER = 'D161_CabbageBuyer'
const REACTION = 'TEST_CompetingImprovementReaction'
const END_BAKE = 'TEST_EndBake'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function choose(session: GameSession, response: SessionResponse, value: string) {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected choice')
  expect(getChoiceOptions(response).some(option => option.value === value && !option.disabled), JSON.stringify(response.interaction)).toBe(true)
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function accept(session: GameSession, response: SessionResponse) {
  const option = getChoiceOptions(response).find(option => !option.disabled && !['__skip__', '__pass__'].includes(option.value))
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}
function source(session: GameSession, response: SessionResponse, card: string) {
  const option = getChoiceOptions(response).find(option => option.sourceCard === card && !option.disabled)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}
function restore(session: GameSession) {
  const next = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(next)
  return next
}
function endBake(session: GameSession) {
  session.withCtx(() => requireActiveCardRegistry('end-bake-test').registerEffects([{
    id: END_BAKE,
    onEndTurn: () => ({ type: 'seq', sourceCard: END_BAKE, children: [
      { type: 'leaf', actionId: 'special-effect', sourceCard: END_BAKE, params: { kind: 'increment-counter', key: 'count', amount: 1 } },
      { type: 'leaf', actionId: 'bake-bread', sourceCard: END_BAKE },
    ] }),
  }]))
}
function competingReaction(session: GameSession) {
  session.withCtx(() => requireActiveCardRegistry('buyer-reaction-test').registerListener({
    id: 'test-competing-improvement', cardIds: [REACTION], actions: ['improvement'], phases: ['after'],
    handler: () => ({ sourceCard: REACTION, flow: { type: 'leaf', actionId: 'gain', sourceCard: REACTION, params: { wood: 1 }, optional: true } }),
  }))
}

describe('completion reactions use turn identity and primary receipts', () => {
  it('Freshman survives pending restore, cannot repeat for Bread Paddle or end-turn Bake, and renews next turn', () => {
    let session = createWorkSession({ seed: 4242, configure(state) {
      state.round = 14
      const p = state.players[0]!
      p.occupationPlayed = [FRESH, 'C140_PackagingArtist']
      p.minorPlayed = ['B025_BreadPaddle', END_BAKE]
      p.occupationHand = ['A114_SeasonalWorker', 'A116_WoodCutter']
      Object.assign(p.resources, { food: 0, grain: 0 })
    } })
    sessions.push(session)
    endBake(session)
    let r = source(session, session.takeAction(0, 'grain-utilization'), FRESH)
    const firstToken = readTurnScopeToken(r.state.players[0]!)
    expect(firstToken).toEqual(expect.any(Number))
    expect(r.state.players[0]!.cardStates[FRESH]?.extraData?.usedTurnToken).toBe(firstToken)
    session = restore(session)
    endBake(session)
    r = choose(session, session.getState(), 'A114_SeasonalWorker')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = source(session, r, END_BAKE)
    expect(r.interaction.request.kind, JSON.stringify(r.interaction)).toBe('confirm-next-player')
    expect(r.state.players[0]!.occupationHand).toContain('A116_WoodCutter')
    expect(r.state.players[0]!.cardStates[END_BAKE]?.counters?.count).toBe(1)
    expect(confirmNext(session, r).interaction.stateId).toBe('idle')
    r = confirmNext(session, session.takeAction(1, 'day-laborer'))
    expect(r.state.currentPlayerIndex).toBe(0)
    r = source(session, session.takeAction(0, 'meeting-place'), 'C140_PackagingArtist')
    r = source(session, r, FRESH)
    expect(r.state.players[0]!.cardStates[FRESH]?.extraData?.usedTurnToken).not.toBe(firstToken)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = source(session, r, END_BAKE)
    expect(r.state.players[0]!.occupationPlayed).toEqual(expect.arrayContaining(['A114_SeasonalWorker', 'A116_WoodCutter']))
    expect(r.state.events.filter(event => event.type === 'card.played' && ['A114_SeasonalWorker', 'A116_WoodCutter'].includes(event.cardId))).toHaveLength(2)
    expect(r.state.players[0]!.resources.food).toBe(0)
  })

  it.each([
    { improvement: 'none', cost: 3, first: BUYER },
    { improvement: 'A005_ClayEmbankment', cost: 2, first: BUYER },
    { improvement: 'A005_ClayEmbankment', cost: 2, first: REACTION },
    { improvement: 'Major_Fireplace1', cost: 1, first: BUYER },
    { improvement: 'Major_Fireplace1', cost: 1, first: REACTION },
  ])('prices $improvement independently of selecting $first first', example => {
    let session = createWorkSession({ seed: 42, options: { playerCount: 4 }, configure(state) {
      state.round = 6
      state.roundActionOrder[4] = 'house-redevelopment'
      const p = state.players[0]!
      p.occupationPlayed = [BUYER]
      p.minorPlayed = [REACTION]
      p.minorHand = ['A005_ClayEmbankment']
      Object.assign(p.resources, { food: 10, clay: 10, reed: 1, wood: 0, grain: 0, vegetable: 0 })
    } })
    sessions.push(session)
    competingReaction(session)
    let r = session.takeAction(0, 'house-redevelopment')
    expect(r.ok, r.error).toBe(true)
    if (getChoiceOptions(r).some(option => option.value === 'clay')) r = choose(session, r, 'clay')
    if (example.improvement === 'none') r = choose(session, r, '__skip__')
    else {
      r = accept(session, r)
      r = choose(session, r, example.improvement)
    }
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') {
      expect(getChoiceOptions(r).filter(option => !option.disabled).map(option => option.sourceCard)).toEqual(expect.arrayContaining([BUYER, REACTION]))
      source(session, r, example.first)
    }
    session = restore(session)
    competingReaction(session)
    r = session.getState()
    for (let step = 0; step < 8 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; step++) {
      if (r.interaction.request.kind === 'select-trigger') {
        const remaining = getChoiceOptions(r).find(option => [BUYER, REACTION].includes(option.sourceCard ?? '') && !option.disabled)
        expect(remaining, JSON.stringify(r.interaction)).toBeDefined()
        r = choose(session, r, remaining!.value)
      } else r = accept(session, r)
    }
    expect(r.state.players[0]!.houseType).toBe('clay')
    const minorCost = example.improvement === 'A005_ClayEmbankment' ? 1 : 0
    expect(r.state.players[0]!.resources.food).toBe(10 - minorCost - example.cost)
    expect(r.state.players[0]!.resources.vegetable).toBe(1)
    expect(r.state.players[0]!.cardStates[BUYER]?.extraData?.inFlight).toBeUndefined()
    expect(r.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === BUYER)).toHaveLength(1)
    expect(r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === BUYER)).toHaveLength(1)
    expect(r.state.log.some(entry => entry.params?.cardId === BUYER)).toBe(true)
    expect(r.scores).toHaveLength(4)
    if (example.improvement === 'A005_ClayEmbankment') {
      expect(r.state.events.some(event => event.type === 'card.passed' && event.cardId === example.improvement)).toBe(true)
    }
    r = session.undoAction(0)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({ food: 10, vegetable: 0 })
    expect(r.state.players[0]!.houseType).toBe('wood')
  })
})
