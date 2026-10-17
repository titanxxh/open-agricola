import { descriptionEffects } from './_helpers/choice-description'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D082_HuntingTrophy'
import '../../shared/cards/D/D056_FatstockStretcher'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit43Renovation from './_helpers/audit/ae-negative-43-renovation'

const CARD_ID = 'D082_HuntingTrophy'
const TARGET_MINOR = 'D056_FatstockStretcher'
const FILLER = '__test_placeholder__'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({
  played = true, boar = 0, fireplace = false, resources = {}, houseType = 'wood',
}: {
  played?: boolean
  boar?: number
  fireplace?: boolean
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
  houseType?: 'wood' | 'clay'
} = {}) => {
  const session = new GameSession(6082, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
    if (space.id === 'house-redevelopment' || space.id === 'farm-redevelopment') {
      space.roundAvailable = 1
    }
  })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.fenceSegments = []
    player.stableTiles = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.resources = { ...owner.resources, boar, ...resources }
  if (fireplace) {
    owner.improvements = ['Major_Fireplace1']
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (cardId) => cardId !== 'Major_Fireplace1',
    )
  }
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const chooseRenovationTarget = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    return session.resolveChoice(response.interaction.playerIndex, 'clay')
  }
  return response
}

const chooseImprovement = (
  session: GameSession, response: SessionResponse, cardId: string,
) => {
  for (let guard = 0; guard < 8 && response.interaction.stateId === 'wait'; guard += 1) {
    if (response.interaction.request.kind === 'confirm-next-player') return response
    const options = response.interaction.request.options ?? []
    const card = options.find((option) =>
      option.value === cardId || option.value === `minor:${cardId}`)
    if (card) {
      response = session.resolveChoice(response.interaction.playerIndex, card.value)
      continue
    }
    if (response.interaction.promptKey === 'prompt.selectPayment') {
      const payment = options.find((option) => option.value.startsWith('pay:')) ?? options[0]
      expect(payment, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
      continue
    }
    const branch = options.find((option) => option.value.startsWith('action-improvement-'))
      ?? options.find((option) => option.labelKey?.includes('improvement'))
    if (!branch) throw new Error(`unexpected improvement interaction: ${JSON.stringify(response.interaction)}`)
    response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

describe('D082 Hunting Trophy parity', () => {
  it('D082 S1: playing returns exactly one boar', () => {
    const response = playMinor(setup({ played: false, boar: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 0 })
  })

  it('D082 S2: Hunting Trophy cannot be played without a boar', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })

  it('offers returning or cooking one boar with the real Fireplace source', () => {
    const session = setup({ played: false, boar: 1, fireplace: true })
    const offered = playMinor(session)
    expect(offered.state.players[0]!.resources.boar).toBe(1)
    const options = offered.interaction.request.options ?? []
    expect(options.some(option => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'payment' && effect.resourcesPaid?.boar === 1))).toBe(true)
    const cook = options.find((option) => option.labelKey === 'ui.interactionResourceExchange')
    expect(cook, JSON.stringify(offered.interaction)).toBeDefined()
    expect(options.map((option) => option.value)).not.toContain('__skip__')
    const response = session.resolveChoice(0, cook!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 2 })
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.exchanged', exchangeSource: 'Major_Fireplace1', paid: { boar: 1 }, gained: { food: 2 },
    }))
  })

  it('D082 S4: House Redevelopment discounts the follow-up improvement', () => {
    const session = setup({ resources: { clay: 2, reed: 1, wood: 1 } })
    const state = session.getState().state
    state.players[0]!.minorHand = [TARGET_MINOR]
    session.loadState(state)

    let response = chooseRenovationTarget(session, session.takeAction(0, 'house-redevelopment'))
    response = chooseImprovement(session, response, TARGET_MINOR)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 0, wood: 1 },
    })
    expect(response.state.players[0]!.minorPlayed).toContain(TARGET_MINOR)
  })

  it('D082 S5: House Redevelopment exposes a free one-wood improvement', () => {
    const session = setup({ resources: { clay: 2, reed: 1 } })
    const state = session.getState().state
    state.players[0]!.minorHand = [TARGET_MINOR]
    session.loadState(state)

    let response = chooseRenovationTarget(session, session.takeAction(0, 'house-redevelopment'))

    response = chooseImprovement(session, response, TARGET_MINOR)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 0, wood: 0 },
    })
    expect(response.state.players[0]!.minorHand).not.toContain(TARGET_MINOR)
    expect(response.state.players[0]!.minorPlayed).toContain(TARGET_MINOR)
  })

  it('D082 S6: Meeting Place does not discount an improvement', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorHand = [TARGET_MINOR]
    session.loadState(state)

    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId === 'wait') {
      const branch = response.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-'))
      if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
    }

    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) =>
        option.value === TARGET_MINOR || option.value === `minor:${TARGET_MINOR}`) ?? false
      : false).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(TARGET_MINOR)
  })

  it('House Redevelopment discounts a major improvement in both preview and payment', () => {
    const session = setup({ resources: { clay: 2, reed: 1, stone: 3 } })
    const state = session.getState().state
    state.availableMajorImprovements = ['Major_Well']
    session.loadState(state)
    let response = chooseRenovationTarget(session, session.takeAction(0, 'house-redevelopment'))
    response = chooseImprovement(session, response, 'Major_Well')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Well')
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 0, wood: 0, stone: 0 },
    })
  })

  it('D082 S7: Farm Redevelopment offers four fences with only one wood after renovation', () => {
    const session = setup({
      houseType: 'clay', resources: { stone: 2, reed: 1, wood: 1 },
    })

    let response = session.takeAction(0, 'farm-redevelopment')
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(response.interaction.playerIndex, 'stone')
    }
    if (response.interaction.stateId === 'wait') {
      const fencing = response.interaction.request.options?.find((option) =>
        option.labelKey === 'actions.fencing.name')
      expect(fencing, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, fencing!.value)
    }
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })
    response = session.commitSelectionChoice(0, {
      edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { stone: 0, reed: 0, wood: 0 },
    })
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('D082 S8: ordinary Fencing receives no Hunting Trophy discount', () => {
    const session = setup({ resources: { wood: 1 } })
    const before = session.getState()

    const response = session.takeAction(0, 'fencing')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})

describe('ae-negative-43-renovation', () => {
  const { TROPHY, sessions, save, ok, make, choose, finish, menu, purchase, buildings, oneBoar, renovation } = audit43Renovation
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D082 N1 real purchase returns exactly one boar and zero boar refuses before legal alternative',()=>{const s=make(TROPHY,false,oneBoar),a=purchase(s,TROPHY);assert.equal(a.r.state.players[0]!.resources.boar,0);assert.equal(a.r.state.players[0]!.resources.food,0);const t=make(TROPHY,false),pending=menu(t),bad=assertRejectedUnchanged(t,()=>t.resolveChoice(0,TROPHY)),legal=ok(t.resolveChoice(0,'B004_WoodPile'));assert.ok(legal.state.players[0]!.minorHand.includes(TROPHY));save('D082-N1',{a,pending,bad,legal})})
  it('D082 N2 real purchase cooking branch converts one boar into exactly two Fireplace food',()=>{const s=make(TROPHY,false,state=>{oneBoar(state);state.players[0]!.improvements=['Major_Fireplace1']}),pending=menu(s),branch=ok(s.resolveChoice(0,TROPHY)),r=finish(s,choose(s,branch,o=>descriptionEffects(o.descriptionPreview).some(e=>e.kind==='resourceExchange'&&e.resourcesGained?.food===2)),true);assert.equal(r.state.players[0]!.resources.boar,0);assert.equal(r.state.players[0]!.resources.food,2);save('D082-N2',{pending,branch,r})})
  it('D082 N3 House Redevelopment discounts improvement once while renovation still needs full resources',()=>{const s=make(TROPHY,true,state=>{state.players[0]!.minorHand=['D056_FatstockStretcher','B007_Wage'];Object.assign(state.players[0]!.resources,{clay:2,reed:1})}),pending=renovation(s,'house-redevelopment');let r=pending;for(let n=0;n<8&&!r.state.players[0]!.minorPlayed.includes('D056_FatstockStretcher');n++){r=choose(s,r,o=>o.value==='D056_FatstockStretcher'||o.value.startsWith('action-improvement-')||o.value.startsWith('pay:'))}r=finish(s,r);assert.equal(r.state.players[0]!.houseType,'clay');assert.deepEqual(buildings(r),{food:0,wood:0,clay:0,reed:0,stone:0});const t=make(TROPHY,true,state=>Object.assign(state.players[0]!.resources,{clay:1,reed:1})),bad=assertRejectedUnchanged(t,()=>t.takeAction(0,'house-redevelopment')),legal=ok(t.takeAction(0,'grain-seeds'));assert.equal(legal.state.players[0]!.houseType,'wood');save('D082-N3',{pending,r,bad,legal})})
  it('D082 N4 Farm Redevelopment four fences cost one wood and ordinary fencing gets no discount',()=>{const s=make(TROPHY,true,state=>{state.players[0]!.houseType='clay';Object.assign(state.players[0]!.resources,{stone:2,reed:1,wood:1})});let pending=renovation(s,'farm-redevelopment');if(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice')pending=choose(s,pending,o=>o.labelKey==='actions.fencing.name');assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='farm-select');const r=ok(s.commitSelectionChoice(0,{edges:['H-0-0','H-1-0','V-0-0','V-0-1'],palisadeEdges:[],extraWood:0}));assert.equal(r.state.players[0]!.fenceSegments.length,4);assert.deepEqual(buildings(r),{food:0,wood:0,clay:0,reed:0,stone:0});const t=make(TROPHY,true,state=>state.players[0]!.resources.wood=1),bad=assertRejectedUnchanged(t,()=>t.takeAction(0,'fencing')),legal=ok(t.takeAction(0,'grain-seeds'));assert.equal(legal.state.players[0]!.fenceSegments.length,0);save('D082-N4',{pending,r,bad,legal})})
})
