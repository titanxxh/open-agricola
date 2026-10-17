import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/C/C082_HardwareStore'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit43Exchanges from './_helpers/audit/ae-negative-43-exchanges'

const CARD_ID = 'C082_HardwareStore'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({ played = true, food = 0 }: { played?: boolean; food?: number } = {}) => {
  const session = new GameSession(6082, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.wood = played ? 0 : 1
  owner.resources.clay = played ? 0 : 1
  owner.resources.food = food
  session.loadState(state)
  return session
}

const playCard = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const enterHardwareStore = (session: GameSession, response: SessionResponse) =>
  resolveTriggerIfPresent(session, response, CARD_ID)

describe('C082 Hardware Store parity', () => {
  it('C082 S1: paying one wood and one clay plays Hardware Store for one printed point', () => {
    const response = playCard(setup({ played: false }))
    const printed = response.scores[0]!.categories.find((category) => category.key === 'cards')
      ?.entries.find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
    expect(printed).toBe(1)
  })

  it('C082 S2: Day Laborer food can immediately buy all four building resources', () => {
    const session = setup()
    let response = enterHardwareStore(session, session.takeAction(0, 'day-laborer'))
    response = resolveNonSkipChoice(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, wood: 1, clay: 1, reed: 1, stone: 1,
    })
  })

  it('C082 S3: declining Hardware Store keeps both Day Laborer food', () => {
    const session = setup()
    let response = enterHardwareStore(session, session.takeAction(0, 'day-laborer'))
    response = resolveSkipChoice(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })

  it('C082 S4: a non-Day-Laborer action does not offer Hardware Store', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      grain: 1, wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })
})

describe('ae-negative-43-exchanges', () => {
  const { STORE, sessions, save, ok, make, trigger, finish, menu, purchase, buildings } = audit43Exchanges
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C082 N1 real purchase pays wood and clay and missing clay rejects before free legal alternative',()=>{const s=make(STORE,false,state=>Object.assign(state.players[0]!.resources,{wood:1,clay:1})),a=purchase(s,STORE);assert.deepEqual(buildings(a.r),{food:0,wood:0,clay:0,reed:0,stone:0});assert.equal(a.r.scores![0]!.categories.find(c=>c.key==='cards')?.entries.find(e=>'cardId'in e&&e.cardId===STORE)?.score,1);const t=make(STORE,false,state=>state.players[0]!.resources.wood=1),pending=menu(t),bad=assertRejectedUnchanged(t,()=>t.resolveChoice(0,STORE)),legal=ok(t.resolveChoice(0,'B004_WoodPile'));assert.ok(legal.state.players[0]!.minorHand.includes(STORE));save('C082-N1',{a,pending,bad,legal})})
  it('C082 N2 Day Laborer funds exactly one complete bundle and decline preserves both food',()=>{for(const accept of[true,false]){const s=make(STORE),pending=trigger(s,ok(s.takeAction(0,'day-laborer')),STORE),r=finish(s,pending,accept);assert.deepEqual(buildings(r),accept?{food:0,wood:1,clay:1,reed:1,stone:1}:{food:2,wood:0,clay:0,reed:0,stone:0});assert.deepEqual(buildings(r,1),{food:0,wood:0,clay:0,reed:0,stone:0});save(`C082-N2-${accept}`,{pending,r})}})
  it('C082 N3 unrelated action and card in hand never grant the building bundle',()=>{for(const played of[true,false]){const s=make(STORE,played),r=ok(s.takeAction(0,'grain-seeds'));assert.deepEqual(buildings(r),{food:0,wood:0,clay:0,reed:0,stone:0});assert.equal(r.state.players[0]!.resources.grain,1);save(`C082-N3-${played}`,r)}})
})
