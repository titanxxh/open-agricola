import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A075_LumberMill } from '../../shared/cards/A/A075_LumberMill'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A057_MilkingParlor'
import '../../shared/cards/A/A073_AgriculturalFertilizers'
import '../../shared/cards/A/A079_GardenHoe'
import '../../shared/cards/A/A020_DoubleTurnPlow'
import '../../shared/cards/A/A115_ChiefForester'
import '../../shared/cards/A/A071_ClearingSpade'
import '../../shared/cards/A/A066_FeedingDish'
import '../../shared/cards/A/A078_Canoe'
import assert from 'node:assert/strict'
import { undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit10FarmPaySow from './_helpers/audit/ae-negative-10-farm-pay-sow'

const CARD_ID = 'A075_LumberMill'
const DISCOUNTED_MINOR_ID = 'A057_MilkingParlor'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = [
  'A116_WoodCutter',
  'B116_Shoreforester',
  'C109_SchnappsDistiller',
  'D116_TreeInspector',
]

// Touch the import so the listener side-effect remains referenced.
void A075_LumberMill

describe('A075_LumberMill session', () => {
  const setup = (resources: Partial<Record<string, number>>) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      ...resources,
    }
    state.availableMajorImprovements = ['Major_Joinery']
    // Placeholder hands keep improvement option counts deterministic
    // (see CLAUDE.md Common Pitfalls).
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)
    return session
  }

  const setupPurchase = (occupations: number) => {
    const session = new GameSession(5075, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = [FILLER]
    player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    player.resources.stone = 2
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.minorHand = [FILLER]
    opponent.occupationHand = [FILLER]
    session.loadState(state)
    return session
  }

  const enterImprovementChoice = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
    return response
  }

  const playMinor = (session: GameSession, cardId: string) => {
    const response = enterImprovementChoice(session)
    if (!response.state.players[0]!.minorHand.includes(cardId)) return response
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
    if (!option) return response
    return session.resolveChoice(0, option.value)
  }

  it('A075 S1: exactly three occupations allow paying two stone for Lumber Mill', () => {
    const response = playMinor(setupPurchase(3), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })

  it('A075 S2: four occupations keep Lumber Mill unavailable without payment', () => {
    const response = enterImprovementChoice(setupPurchase(4))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(2)
  })

  // Mandatory closure transform (ADR 0004): the printed {wood:2, stone:2}
  // row is never offered — Mandatory Saturation hides it, the player can
  // only pay the discounted {wood:1, stone:2}.
  it('A075 S3: discounts a major improvement by one wood and never offers the printed cost', () => {
    const session = setup({ wood: 2, stone: 2 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
      const options = resp.interaction.request.options ?? []
      const printed = options.find((entry) =>
        (entry.labelParams?.resourcesPaid as Record<string, number>)?.wood === 2,
      )
      expect(printed).toBeUndefined()
      const discounted = options.find((entry) =>
        (entry.labelParams?.resourcesPaid as Record<string, number>)?.wood === 1,
      )
      expect(discounted).toBeDefined()
      resp = session.resolveChoice(0, discounted!.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Joinery')
    expect(after.resources.wood).toBe(1)
    expect(after.resources.stone).toBe(0)
  })

  // With exactly the discounted cost on hand the purchase resolves without
  // a payment wait: the closure leaves a single affordable candidate.
  it('auto-resolves payment when only the discounted candidate is affordable', () => {
    const session = setup({ wood: 1, stone: 2 })
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Joinery')
    expect(after.resources.wood).toBe(0)
    expect(after.resources.stone).toBe(0)
    expect(readCardResourceStats(after, CARD_ID)?.saved).toEqual({ wood: 1 })
  })

  it('A075 S4: discounts a minor improvement by one wood', () => {
    const session = new GameSession(6075, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed = [CARD_ID]
    player.minorHand = [DISCOUNTED_MINOR_ID]
    player.occupationHand = [FILLER]
    player.resources.wood = 1
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.minorHand = [FILLER]
    opponent.occupationHand = [FILLER]
    session.loadState(state)

    const response = playMinor(session, DISCOUNTED_MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(DISCOUNTED_MINOR_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})

describe('ae-negative-10-farm-pay-sow', () => {
  const { MILL, sessions, scenario, setup, ok, res, opts, turn, complete, enter, purchase, buy, deny, stable, undo } = audit10FarmPaySow
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  scenario('A075 N1 zero occupations permit paying two stone for Lumber Mill',()=>{const r=buy(setup(MILL,{played:false,fields:0,resources:{stone:2}}),MILL);assert.equal(res(r).stone,0);return{cardPlayed:true,stonePaid:2,occupations:0}})
  scenario('A075 N2 exactly three occupations permit the actual purchase and two printed points',()=>{const r=buy(setup(MILL,{played:false,fields:0,resources:{stone:2},occupations:3}),MILL);assert.equal(res(r).stone,0);assert.equal(r.scores?.[0]?.categories.find(c=>c.key==='cards')?.entries.find(e=>'cardId' in e&&e.cardId===MILL)?.score,2);return{cardPlayed:true,stonePaid:2,occupations:3,printedPoints:2}})
  scenario('A075 N3 four occupations reject the forged purchase before a legal retry',()=>{deny(setup(MILL,{played:false,fields:0,resources:{stone:2},occupations:4}),MILL);return{unavailable:true,forgedRejected:true,legalRetryCompleted:true}})
  scenario('A075 N4 one stone short rejects the forged purchase before a legal retry',()=>{deny(setup(MILL,{played:false,fields:0,resources:{stone:1}}),MILL);return{unavailable:true,forgedRejected:true,legalRetryCompleted:true}})
  scenario('A075 N5 actual Joinery purchase pays one wood and two stone',()=>{const s=setup(MILL,{fields:0,resources:{wood:1,stone:2}});const r=complete(purchase(s,enter(s,0,'major-improvement'),'Major_Joinery'));assert.equal(res(r).wood,0);assert.equal(res(r).stone,0);assert.equal(r.state.availableMajorImprovements.includes('Major_Joinery'),false);return{woodPaid:1,stonePaid:2,joineryOwned:true}})
  scenario('A075 N6 zero wood cannot pay the still positive discounted Joinery fee',()=>{deny(setup(MILL,{fields:0,resources:{stone:2}}),'Major_Joinery','major-improvement');return{unavailable:true,forgedRejected:true,legalRetryCompleted:true}})
  scenario('A075 N7 one wood Feeding Dish becomes free without gaining wood',()=>{const s=setup(MILL,{fields:0,configure(state){state.players[0]!.minorHand.push('A066_FeedingDish')}});const r=buy(s,'A066_FeedingDish');assert.equal(res(r).wood,0);return{targetPlayed:true,woodPaid:0,woodGained:0}})
  scenario('A075 N8 two wood Canoe costs one wood with its independent occupation prerequisite',()=>{const s=setup(MILL,{fields:0,occupations:1,resources:{wood:1},configure(state){state.players[0]!.minorHand.push('A078_Canoe')}});const r=buy(s,'A078_Canoe');assert.equal(res(r).wood,0);return{targetPlayed:true,woodPaid:1}})
  scenario('A075 N9 nonwood Fan fee remains one reed with a real baking provider',()=>{const s=setup(MILL,{fields:0,majors:['Major_Fireplace1'],resources:{reed:1},configure(state){state.players[0]!.minorHand.push('A061_WinnowingFan')}});const r=buy(s,'A061_WinnowingFan');assert.equal(res(r).reed,0);assert.equal(res(r).wood,0);return{targetPlayed:true,reedPaid:1,woodPaid:0,woodGained:0}})
  scenario('A075 N10 a real fourth occupation after Lumber Mill does not disable its discount',()=>{const s=setup(MILL,{fields:0,occupations:3,configure(state){state.players[0]!.occupationHand=['D116_TreeInspector'];state.players[0]!.minorHand.push('A066_FeedingDish')}});let r=turn(s,0,'lessons');if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const card=opts(r).find(o=>o.value==='D116_TreeInspector');if(card)r=ok(s.resolveChoice(0,card.value))}if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const payment=opts(r).find(o=>o.value!=='cancel');assert.ok(payment);r=ok(s.resolveChoice(0,payment.value))}complete(r);assert.equal(r.state.players[0]!.occupationPlayed.length,4);turn(s,1,'grain-seeds');r=buy(s,'A066_FeedingDish');assert.equal(res(r).wood,0);return{occupations:4,targetPlayed:true,woodPaid:0}})
  scenario('A075 N11 opponent actual Joinery purchase still pays its printed fee',()=>{const s=setup(MILL,{fields:0,configure(state){Object.assign(state.players[1]!.resources,{wood:2,stone:2})}});turn(s,0,'grain-seeds');const r=complete(purchase(s,enter(s,1,'major-improvement'),'Major_Joinery',1));assert.equal(res(r,1).wood,0);assert.equal(res(r,1).stone,0);return{opponentWoodPaid:2,opponentStonePaid:2,opponentJoineryOwned:true}})
  scenario('A075 N12 real stable construction still costs two wood',()=>{const r=complete(stable(setup(MILL,{fields:0,resources:{wood:2}}),[{row:1,col:1}]));assert.equal(res(r).wood,0);return{stableCount:1,woodPaid:2}})
  scenario('A075 N13 undo discounted Joinery purchase restores resources and supply before one retry',()=>{const s=setup(MILL,{fields:0,resources:{wood:1,stone:2}});const before=undoRuleSnapshot(s.getState());complete(purchase(s,enter(s,0,'major-improvement'),'Major_Joinery'));const r=undo(s,before,()=>complete(purchase(s,enter(s,0,'major-improvement'),'Major_Joinery')));assert.equal(res(r).wood,0);assert.equal(res(r).stone,0);return{fullScopeRestored:true,retryWood:0,retryStone:0,retryJoineryOwned:true}})
  scenario('A075 N14 Lumber Mill in hand cannot discount a real Feeding Dish purchase',()=>{const s=setup(MILL,{played:false,fields:0,resources:{wood:1},configure(state){state.players[0]!.minorHand.push('A066_FeedingDish')}});const r=buy(s,'A066_FeedingDish');assert.equal(res(r).wood,0);assert.ok(r.state.players[0]!.minorHand.includes(MILL));return{millInHand:true,targetPlayed:true,woodPaid:1}})
})
