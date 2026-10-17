import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A060_OrientalFireplace'
import '../../shared/cards/A/A061_WinnowingFan'
import '../../shared/cards/A/A063_DutchWindmill'
import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import * as audit09Baking from './_helpers/audit/ae-negative-09-baking'

const CARD_ID = 'A060_OrientalFireplace'
const FIREPLACE_ID = 'Major_Fireplace1'
const COOKING_HEARTH_ID = 'Major_CookingHearth1'
const FILLER = '__test_placeholder__'

const setupPurchase = (fireplace = true) => {
  const session = new GameSession(5060, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = [FILLER]
  player.improvements = fireplace ? [FIREPLACE_ID] : []
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    grain: 0,
    vegetable: 0,
    food: 0,
  }
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const play = (session: GameSession): SessionResponse => {
  let response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (!option) return response
  response = session.resolveChoice(0, option.value)
  return response
}

const setupPlayed = (resources: Partial<{
  vegetable: number
  sheep: number
  cattle: number
  grain: number
}> = {}) => {
  const session = new GameSession(6060, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = [CARD_ID]
  player.minorHand = [FILLER]
  player.occupationHand = [FILLER]
  player.resources = {
    ...player.resources,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    cattle: 0,
    ...resources,
  }
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy = []
  state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy = []
  session.loadState(state)
  return session
}

describe('A060 Oriental Fireplace parity', () => {
  it('A060 S1: returning a Fireplace plays Oriental Fireplace without resources', () => {
    const response = play(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(FIREPLACE_ID)
    expect(response.state.availableMajorImprovements).toContain(FIREPLACE_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0,
    })
  })

  it('A060 S2: without a Fireplace or Cooking Hearth Oriental Fireplace is unavailable', () => {
    const response = enterImprovementChoice(setupPurchase(false))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.interaction.stateId !== 'wait'
      || !(response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)).toBe(true)
  })

  it('A060 S3: anytime exchanges convert vegetables, sheep, and cattle at printed rates', () => {
    const session = setupPlayed({ vegetable: 1, sheep: 2, cattle: 1 })
    expect(session.takeAction(0, 'farmland').ok).toBe(true)

    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, 'bulk:0=1,1=2,2=1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      vegetable: 0, sheep: 0, cattle: 0, food: 15,
    })
  })

  it('A060 S4: grain is excluded from anytime cooking and bakes for two food per grain', () => {
    const session = setupPlayed({ grain: 2 })
    const active = session.takeAction(0, 'farmland')
    expect(active.ok, active.error).toBe(true)
    expect(active.interaction.anytimeActions.map((action) => action.id)).not.toContain('exchange')

    const bakeSession = setupPlayed({ grain: 2 })
    let response = bakeSession.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const bakeOptions = response.interaction.request.options?.map((option) => option.value) ?? []
    expect(bakeOptions).toContain(`count-${CARD_ID}-2`)
    response = bakeSession.resolveChoice(0, `count-${CARD_ID}-2`)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
  })

  it('A060 S5: upgrading Oriental Fireplace removes it instead of returning it to major supply', () => {
    const session = setupPlayed()
    const state = session.getState().state
    state.availableMajorImprovements = [COOKING_HEARTH_ID]
    session.loadState(state)

    let response = session.takeAction(0, 'major-improvement')
    if (!response.state.players[0]!.improvements.includes(COOKING_HEARTH_ID)
      && response.interaction.stateId === 'wait') {
      const option = response.interaction.request.options?.find((candidate) =>
        candidate.value === COOKING_HEARTH_ID)
      if (option) response = session.resolveChoice(0, option.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(COOKING_HEARTH_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.availableMajorImprovements).not.toContain(CARD_ID)
  })
})

describe('ae-negative-09-baking', () => {
  const { ORIENTAL, FIRE, sessions, scenario, setup, ok, values, opts, enter, buy, deny, bake, cook, point } = audit09Baking
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  scenario('A060 N1 returning owned Fireplace1 is the actual printed payment', () => { const s=setup(ORIENTAL,{played:false,majors:['Major_Fireplace1']});const r=buy(s,ORIENTAL);assert.equal(r.state.players[0]!.improvements.includes('Major_Fireplace1'),false);assert.equal(r.state.availableMajorImprovements.includes('Major_Fireplace1'),true);assert.equal(values(r).food,20);point(r,ORIENTAL,1);return {cardPlayed:true,returnedMajor:'Major_Fireplace1',ownedReturnedMajor:false,paidBuildingGoods:{},food:20,printedPoints:1} })
  scenario('A060 N2 returning owned Fireplace2 is a separate legal payment', () => { const s=setup(ORIENTAL,{played:false,majors:['Major_Fireplace2']});const r=buy(s,ORIENTAL);assert.equal(r.state.players[0]!.improvements.includes('Major_Fireplace2'),false);assert.equal(r.state.availableMajorImprovements.includes('Major_Fireplace2'),true);assert.equal(values(r).food,20);return {cardPlayed:true,returnedMajor:'Major_Fireplace2',ownedReturnedMajor:false,paidBuildingGoods:{},food:20} })
  scenario('A060 N3 returning owned CookingHearth1 is an independent legal payment', () => { const s=setup(ORIENTAL,{played:false,majors:['Major_CookingHearth1']});const r=buy(s,ORIENTAL);assert.equal(r.state.players[0]!.improvements.includes('Major_CookingHearth1'),false);assert.equal(r.state.availableMajorImprovements.includes('Major_CookingHearth1'),true);assert.equal(values(r).food,20);return {cardPlayed:true,returnedMajor:'Major_CookingHearth1',ownedReturnedMajor:false,paidBuildingGoods:{},food:20} })
  scenario('A060 N4 returning owned CookingHearth2 is an independent legal payment', () => { const s=setup(ORIENTAL,{played:false,majors:['Major_CookingHearth2']});const r=buy(s,ORIENTAL);assert.equal(r.state.players[0]!.improvements.includes('Major_CookingHearth2'),false);assert.equal(r.state.availableMajorImprovements.includes('Major_CookingHearth2'),true);assert.equal(values(r).food,20);return {cardPlayed:true,returnedMajor:'Major_CookingHearth2',ownedReturnedMajor:false,paidBuildingGoods:{},food:20} })
  scenario('A060 N5 no owned replacement card blocks and rejects a forged purchase', () => { const r=deny(setup(ORIENTAL,{played:false}),ORIENTAL);return {orientalInHand:true,orientalPlayed:false,forgedPurchaseRejected:true,legalRetryCompleted:r.state.players[0]!.minorPlayed.includes('A054_Credit')} })
  scenario('A060 N6 an opponent owned Fireplace cannot pay the owner replacement fee', () => { const s=setup(ORIENTAL,{played:false,configure(state){state.players[1]!.improvements=[FIRE];takeMajorImprovementFromSupply(state,FIRE)}});const r=deny(s,ORIENTAL);assert.ok(r.state.players[1]!.improvements.includes(FIRE));return{orientalInHand:true,forgedPurchaseRejected:true,opponentStillOwnsFireplace:true,legalRetryCompleted:true} })
  scenario('A060 N7 a nonmatching owned Joinery cannot replace the printed return fee', () => { const r=deny(setup(ORIENTAL,{played:false,majors:['Major_Joinery']}),ORIENTAL);assert.ok(r.state.players[0]!.improvements.includes('Major_Joinery'));return{orientalInHand:true,forgedPurchaseRejected:true,joineryStillOwned:true,legalRetryCompleted:true} })
  scenario('A060 N8 actual anytime vegetable cooking gives four food', () => { const s=setup(ORIENTAL,{resources:{vegetable:1}});const r=cook(s,'vegetable');assert.equal(values(r).food,24);return{vegetable:0,food:24,paid:{vegetable:1},received:{food:4}} })
  scenario('A060 N9 actual anytime cooking consumes one legally housed sheep for three food', () => { const s=setup(ORIENTAL,{animal:'sheep'});const r=cook(s,'sheep');assert.equal(values(r).food,23);assert.equal(countRoomAnimals(r.state.players[0]!),0);return{housedSheep:0,food:23,paid:{sheep:1},received:{food:3}} })
  scenario('A060 N10 actual anytime cooking consumes one legally housed cattle for five food', () => { const s=setup(ORIENTAL,{animal:'cattle'});const r=cook(s,'cattle');assert.equal(values(r).food,25);assert.equal(countRoomAnimals(r.state.players[0]!),0);return{housedCattle:0,food:25,paid:{cattle:1},received:{food:5}} })
  scenario('A060 N11 the printed Oriental cooking options exclude boar while a legal vegetable exchange preserves the pet', () => { const s=setup(ORIENTAL,{animal:'boar',resources:{vegetable:1}});const pending=ok(s.takeAnytimeAction(0,'exchange'));assert.equal(opts(pending).some(o=>JSON.stringify(o).includes('boar')),false);const r=ok(s.resolveChoice(0,'bulk:0=1'));assert.equal(values(r).vegetable,0);assert.equal(values(r).food,24);assert.equal(values(r).boar,1);assert.equal(countRoomAnimals(r.state.players[0]!),1);return{orientalBoarOption:false,housedBoar:1,vegetable:0,food:24} })
  scenario('A060 N12 grain is excluded from Oriental anytime cooking and real Bake Bread converts two grains to four food', () => { const s=setup(ORIENTAL,{resources:{grain:2}});assert.equal(s.getState().interaction.anytimeActions.some(a=>a.id==='exchange'),false);assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,'exchange'));const r=bake(s,2,0,ORIENTAL);assert.equal(values(r).grain,0);assert.equal(values(r).food,24);return{orientalAnytimeGrainOption:false,grain:0,food:24,bakePaidGrain:2,bakeReceivedFood:4} })
  scenario('A060 N13 Oriental in hand supplies no Oriental cooking rate', () => { const s=setup(ORIENTAL,{played:false,resources:{vegetable:1}});assert.equal(s.getState().interaction.anytimeActions.some(a=>a.sourceCard===ORIENTAL),false);assert.ok(s.getState().state.players[0]!.minorHand.includes(ORIENTAL));return{orientalCookSourceOffered:false,orientalInHand:true} })
  scenario('A060 N14 undo restores actual replacement payment and permits one purchase retry', () => { const s=setup(ORIENTAL,{played:false,majors:[FIRE]});const before=undoRuleSnapshot(s.getState());buy(s,ORIENTAL);assertUndoRestored(before,s.undoAction());const r=buy(s,ORIENTAL);assert.equal(r.state.players[0]!.minorPlayed.filter(c=>c===ORIENTAL).length,1);return{fullRuleScopeRestored:true,singleRetryCardPlayed:true} })
  scenario('A060 N15 a real return-card choice cannot select the opponent card and returns only the chosen owned major', () => { const s=setup(ORIENTAL,{played:false,majors:[FIRE,'Major_CookingHearth1'],configure(state){state.players[1]!.improvements=['Major_Fireplace2'];takeMajorImprovementFromSupply(state,'Major_Fireplace2')}});let r=enter(s);assert.ok(opts(r).some(o=>o.value===ORIENTAL));r=ok(s.resolveChoice(0,ORIENTAL));assert.ok(r.interaction.stateId==='wait');assert.equal(r.interaction.promptKey,'prompt.selectPayment');assert.equal(opts(r).some(o=>JSON.stringify(o).includes('Major_Fireplace2')),false);const own=opts(r).find(o=>JSON.stringify(o).includes(FIRE));assert.ok(own,JSON.stringify(r.interaction));assertRejectedUnchanged(s,()=>s.resolveChoice(0,own.value.split('~')[0]+'~foreign-unissued-payment'));r=ok(s.resolveChoice(0,own.value));assert.ok(r.state.players[0]!.minorPlayed.includes(ORIENTAL));assert.ok(r.state.players[0]!.improvements.includes('Major_CookingHearth1'));assert.ok(r.state.players[1]!.improvements.includes('Major_Fireplace2'));assert.equal(r.state.players[0]!.improvements.includes(FIRE),false);return{unissuedReturnChoiceRejected:true,returnedMajor:FIRE,hearthStillOwned:true,opponentFireplaceStillOwned:true,orientalPlayed:true} })
})
