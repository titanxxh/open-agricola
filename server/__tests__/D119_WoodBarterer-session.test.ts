import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { Resource } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B087_Cottager'
import '../../shared/cards/D/D119_WoodBarterer'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit49Farm from './_helpers/audit/ae-negative-49-farm'

const CARD_ID = 'D119_WoodBarterer'
const COTTAGER = 'B087_Cottager'
const FILLER = '__test_placeholder__'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({
  played = true,
  resources = {},
  houseType = 'wood',
  cottager = false,
}: {
  played?: boolean
  resources?: Partial<Resource>
  houseType?: 'wood' | 'clay'
  cottager?: boolean
} = {}) => {
  const session = new GameSession(6119, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })

  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = [
    ...(played ? [CARD_ID] : []),
    ...(cottager ? [COTTAGER] : []),
  ]
  player.resources = { ...player.resources, food: 0, ...resources }
  player.houseType = houseType

  for (const id of ['lessons', 'farm-expansion', 'fencing', 'farm-redevelopment', 'day-laborer']) {
    const space = state.actionSpaces.find((candidate) => candidate.id === id)
    if (space) space.takenBy = []
  }

  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const enterWoodBarterer = (session: GameSession, response: SessionResponse) =>
  resolveTriggerIfPresent(session, response, CARD_ID)

const woodBartererOption = (
  response: SessionResponse,
  paid: Partial<Resource>,
  gained: Partial<Resource>,
) => options(response).find((option) => {
  const preview = option.effectPreview
  return Object.entries(paid).every(([resource, amount]) =>
    preview?.resourcesPaid?.[resource as keyof Resource] === amount)
    && Object.entries(gained).every(([resource, amount]) =>
      preview?.resourcesGained?.[resource as keyof Resource] === amount)
})

const applyWoodBarterer = (
  session: GameSession,
  response: SessionResponse,
  paid: Partial<Resource>,
  gained: Partial<Resource>,
) => {
  const offered = enterWoodBarterer(session, response)
  expect(offered.interaction.stateId, JSON.stringify(offered)).toBe('wait')
  const option = woodBartererOption(offered, paid, gained)
  expect(option, JSON.stringify(offered.interaction)).toBeDefined()
  return session.resolveChoice(offered.interaction.playerIndex, option!.value)
}

const chooseMode = (session: GameSession, response: SessionResponse, labelKey: string) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind === 'farm-select') {
    return response
  }
  const option = options(response).find((candidate) => candidate.labelKey === labelKey)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const commitRoom = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
    return response
  }
  const room = response.interaction.request.farm.selectableTiles[0]
  expect(room).toBeDefined()
  return session.commitSelectionChoice(response.interaction.playerIndex, { rooms: [room!] })
}

const woodBartererTriggers = (response: SessionResponse) => response.state.events.filter((event) =>
  event.type === 'card.triggered' && event.sourceCardId === CARD_ID,
).length

describe('D119 Wood Barterer session', () => {
  it('D119 S1: Wood Barterer can be played as the first occupation through Lessons', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D119 S2: before Farm Expansion two wood can be gained to make a room affordable', () => {
    const session = setup({ resources: { wood: 3, reed: 2 } })
    let response = session.takeAction(0, 'farm-expansion')
    response = applyWoodBarterer(session, response, {}, { wood: 2 })
    response = chooseMode(session, response, 'actions.construct.name')
    response = commitRoom(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('D119 S3: before Farm Expansion one wood can be exchanged for one reed', () => {
    const session = setup({ resources: { wood: 6, reed: 1 } })
    let response = session.takeAction(0, 'farm-expansion')
    response = applyWoodBarterer(
      session, response, { wood: 1 }, { reed: 1 },
    )
    response = chooseMode(session, response, 'actions.construct.name')
    response = commitRoom(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('D119 S4: before Farm Expansion two wood can be exchanged for two reed', () => {
    const session = setup({ resources: { wood: 7 } })
    let response = session.takeAction(0, 'farm-expansion')
    response = applyWoodBarterer(
      session, response, { wood: 2 }, { reed: 2 },
    )
    response = chooseMode(session, response, 'actions.construct.name')
    response = commitRoom(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('D119 S5: the Wood Barterer option can be declined before building a room', () => {
    const session = setup({ resources: { wood: 5, reed: 2 } })
    let response = session.takeAction(0, 'farm-expansion')
    response = enterWoodBarterer(session, response)
    expect(options(response).some((option) => option.value === '__skip__'), JSON.stringify(response.interaction)).toBe(true)
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    response = chooseMode(session, response, 'actions.construct.name')
    response = commitRoom(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('D119 S6: before Fencing two wood can be gained to complete a four-fence pasture', () => {
    const session = setup({ resources: { wood: 2 } })
    let response = applyWoodBarterer(session, session.takeAction(0, 'fencing'), {}, { wood: 2 })
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })
    response = session.commitSelectionChoice(0, {
      edges: ONE_CELL_FENCES, palisadeEdges: [], })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D119 S7: exchanges before renovation to supply its missing reed', () => {
    const session = setup({ houseType: 'clay', resources: { wood: 1, stone: 2 } })
    expect(session.getActionAvailability(0)['farm-redevelopment']).toBe(true)
    const response = applyWoodBarterer(
      session, session.takeAction(0, 'farm-redevelopment'), { wood: 1 }, { reed: 1 },
    )
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, stone: 0 })
    expect(response.interaction.request.kind).not.toBe('engine-blocked')
  })

  it('blocks after choosing wood when renovation still needs reed, and restores the placement on undo', () => {
    const session = setup({ houseType: 'clay', resources: { stone: 2 } })
    expect(session.getActionAvailability(0)['farm-redevelopment']).toBe(true)
    const response = applyWoodBarterer(session, session.takeAction(0, 'farm-redevelopment'), {}, { wood: 2 })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('engine-blocked')
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, reed: 0, stone: 2 })
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, stone: 2 })
    expect(undone.state.actionSpaces.find((space) => space.id === 'farm-redevelopment')?.takenBy).toEqual([])
  })

  it('waits after before for Grocer, then rechecks renovation only when continued', () => {
    const session = setup({ houseType: 'clay', resources: { stone: 2, food: 1 } })
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('A102_Grocer')
    state.players[0]!.cardStates.A102_Grocer = { stack: ['reed'] }
    session.loadState(state)
    let response = applyWoodBarterer(session, session.takeAction(0, 'farm-redevelopment'), {}, { wood: 2 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    expect(response.interaction.anytimeActions.map((entry) => entry.id)).toContain('A102-grocer-anytime')
    response = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, reed: 1, wood: 2, stone: 2 })
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.interaction.request.kind).toBe('choice')
    response = session.resolveChoice(0, 'continue')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, reed: 0, wood: 2, stone: 0 })
  })

  it.each([false, true])('keeps the continue window across multiple anytime actions, reconnect=%s', (reconnect) => {
    let session = setup({ houseType: 'clay', resources: { stone: 2, food: 2 } })
    const initial = session.getState().state
    initial.players[0]!.occupationPlayed.push('A102_Grocer')
    initial.players[0]!.cardStates.A102_Grocer = { stack: ['reed', 'wood'] }
    session.loadState(initial)
    let response = applyWoodBarterer(session, session.takeAction(0, 'farm-redevelopment'), {}, { wood: 2 })
    const beforeQuery = JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })
    session.getActionAvailability(0)
    expect(JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })).toBe(beforeQuery)
    expect(session.resolveChoice(1, 'continue').ok).toBe(false)
    expect(session.takeAnytimeAction(1, 'A102-grocer-anytime').ok).toBe(false)
    if (reconnect) {
      const state = JSON.parse(JSON.stringify(session.state))
      const cursor = session.createSessionPrivateCursor()
      session = new GameSession(6119, undefined, { playerCount: 2 })
      session.loadState(state)
      session.restoreSessionPrivateCursor(cursor)
    }
    response = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 3, reed: 0 })
    expect(response.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    response = session.undoStep(0)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 2, reed: 0 })
    expect(response.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    session.takeAnytimeAction(0, 'A102-grocer-anytime')
    response = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3, reed: 1 })
    expect(response.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    response = session.resolveChoice(0, 'continue')
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3, reed: 0, stone: 0 })
  })

  it.each([false, true])('offers unrelated anytime and blocks a still-impossible continue, useAnytime=%s', (useAnytime) => {
    const session = setup({ houseType: 'clay', resources: { stone: 2, food: 1 } })
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('A102_Grocer')
    state.players[0]!.cardStates.A102_Grocer = { stack: ['wood'] }
    session.loadState(state)
    let response = applyWoodBarterer(session, session.takeAction(0, 'farm-redevelopment'), {}, { wood: 2 })
    expect(response.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    if (useAnytime) {
      response = session.takeAnytimeAction(0, 'A102-grocer-anytime')
      expect(response.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
      expect(response.interaction.anytimeActions).toEqual([])
    }
    response = session.resolveChoice(0, 'continue')
    expect(response.interaction.request.kind).toBe('engine-blocked')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: useAnytime ? 3 : 2, reed: 0, stone: 2 })
    expect(session.resolveChoice(0, 'continue').ok).toBe(false)
    response = session.undoAction(0)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, reed: 0, stone: 2 })
    expect(response.state.players[0]!.cardStates.A102_Grocer?.stack).toEqual(['wood'])
  })

  it('D119 S8: a Cottager card-granted room action does not trigger Wood Barterer', () => {
    const session = setup({ resources: { wood: 5, reed: 2 }, cottager: true })
    let response = resolveTriggerIfPresent(session, session.takeAction(0, 'day-laborer'), COTTAGER)
    response = chooseMode(session, response, 'actions.construct.name')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    response = chooseMode(session, response, 'actions.construct.name')
    response = commitRoom(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, food: 2 })
    expect(woodBartererTriggers(response)).toBe(0)
  })
})

describe('ae-negative-49-farm', () => {
  const { BARTER, sessions, save, ok, make, choose, finish, lesson, ready, action, barter, fence, room } = audit49Farm
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D119 N1 real Lessons gives no immediate wood and the before Fencing two wood branch makes four actual fences affordable',()=>{const bought=lesson(make(BARTER,false),BARTER);assert.equal(bought.state.players[0]!.resources.wood,0);const s=make(BARTER,true,state=>state.players[0]!.resources.wood=2),pending=ok(s.takeAction(0,'fencing')),a=barter(s,pending),r=fence(s,a);assert.equal(a.state.players[0]!.resources.wood,4);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);save('D119-N1',{bought,pending,a,r})})
  it('D119 N2 one or two actual wood trades fund the missing room reed before constructing exactly one real room',()=>{for(const[cost,wood,reed]of[[1,6,1],[2,7,0]] as const){const s=make(BARTER,true,state=>Object.assign(state.players[0]!.resources,{wood,reed})),pending=ok(s.takeAction(0,'farm-expansion')),a=barter(s,pending,cost,cost),r=room(s,a);assert.equal(r.state.players[0]!.rooms,3);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.reed,0);save(`D119-N2-${cost}`,{pending,a,r})}})
  it('D119 N3 forged trade is rejected before a legal gain and optional decline leaves only the ordinary fence payment',()=>{const s=make(BARTER,true,state=>state.players[0]!.resources.wood=2),pending=ok(s.takeAction(0,'fencing')),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'__invalid_trade_three_wood__')),r=fence(s,barter(s,pending));assert.equal(r.state.players[0]!.resources.wood,0);const t=make(BARTER,true,state=>state.players[0]!.resources.wood=4),offered=ok(t.takeAction(0,'fencing'));let decline=offered;if(decline.interaction.stateId==='wait'&&decline.interaction.request.kind==='select-trigger')decline=ok(t.resolveChoice(0,BARTER));decline=choose(t,decline,o=>['__skip__','__pass__'].includes(o.value));const declined=fence(t,decline);assert.equal(declined.state.players[0]!.resources.wood,0);assert.equal(declined.state.players[0]!.resources.reed,0);const unrelated=action(make(BARTER),0,'day-laborer');assert.equal(unrelated.state.players[0]!.resources.wood,0);save('D119-N3',{pending,bad,r,offered,declined,unrelated})})
  it('D119 N4 real Farm Redevelopment receives its before space branch then pays renovation and fences while hand and opponent controls get no bundle',()=>{const s=make(BARTER,true,state=>Object.assign(state.players[0]!.resources,{wood:4,clay:2,reed:1})),pending=ok(s.takeAction(0,'farm-redevelopment'));let a=barter(s,pending);if(a.interaction.stateId==='wait'&&a.interaction.request.kind==='choice'&&a.interaction.promptKey==='ui.interactionChooseRenovationTarget')a=choose(s,a,o=>o.value==='clay');const r=fence(s,a);assert.equal(r.state.players[0]!.houseType,'clay');assert.equal(r.state.players[0]!.resources.wood,2);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[0]!.resources.reed,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);const t=make(BARTER,false,state=>state.players[0]!.resources.wood=4),hand=fence(t,ok(t.takeAction(0,'fencing')));assert.equal(hand.state.players[0]!.resources.wood,0);const q=make(BARTER,true,state=>state.players[1]!.resources.wood=4);action(q,0,'grain-seeds');ready(q);const before=ok(q.takeAction(1,'fencing')),opponent=finish(q,ok(q.commitSelectionChoice(1,{edges:['H-0-2','H-1-2','V-0-2','V-0-3']})));assert.equal(opponent.state.players[0]!.resources.wood,0);assert.equal(opponent.state.players[1]!.resources.wood,0);save('D119-N4',{pending,a,r,hand,before,opponent})})
})
