import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A088_HedgeKeeper'
import '../../shared/cards/A/A087_Conservator'
import '../../shared/cards/A/A090_PlowDriver'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit11FarmFuture from './_helpers/audit/ae-negative-11-farm-future'

const CARD_ID = 'A088_HedgeKeeper'
const FILLER = '__test_placeholder__'
const ONE_CELL = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
const TWO_CELL = [
  'H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3',
]

const setup = ({ wood = 0, played = true, existingFence = false } = {}) => {
  const session = new GameSession(5088, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    player.resources.wood = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.wood = wood
  if (existingFence) {
    owner.fenceSegments = [{
      edge: ONE_CELL[0]!, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
    }]
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const buildFences = (session: GameSession, edges: string[]) => {
  const pending = session.takeAction(0, 'fencing')
  expect(pending.ok, pending.error).toBe(true)
  expect(pending.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
  })
  return session.commitSelectionChoice(0, { edges, palisadeEdges: [] })
}

describe('A088 Hedge Keeper session', () => {
  it('A088 S1: Hedge Keeper is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A088 S2: completes an existing edge with three free fences and no wood', () => {
    const session = setup({ existingFence: true })
    expect(session.getActionAvailability(0).fencing).toBe(true)
    const response = buildFences(session, ONE_CELL)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(session.withCtx(() => getOwnOrdinaryFenceReserveCount(response.state.players[0]!))).toBe(11)
  })

  it('A088 S3: building four fences with Hedge Keeper costs one wood', () => {
    const session = setup({ wood: 1 })
    const response = buildFences(session, ONE_CELL)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('A088 S4: building six fences with Hedge Keeper costs three wood', () => {
    const session = setup({ wood: 3 })
    const response = buildFences(session, TWO_CELL)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(6)
  })

  it('A088 S5: the three-fence discount does not make six fences affordable with only two wood', () => {
    const session = setup({ wood: 2 })
    const response = buildFences(session, TWO_CELL)

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

})

describe('ae-negative-11-farm-future', () => {
  const { HEDGE, sessions, scenario, setup, ok, res, ready, turn, complete, lessons, denyHost, FOUR, SIX, closed, fenceEntry, fenceCommit, fence, fields } = audit11FarmFuture
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  scenario('A088 N1 real first and later Lessons pay zero and one food without an immediate ability',()=>{for(const prior of[0,1]){const s=setup(HEDGE,{played:false,occupations:prior,resources:{food:prior},house:'stone'});const r=lessons(s,HEDGE);assert.equal(res(r).food,0);assert.equal(fields(r),0);assert.equal(r.state.players[0]!.fenceSegments.length,0)}return{firstFee:0,laterFee:1,immediateFields:0,immediateFences:0}})
  scenario('A088 N2 missing the later Lessons food rejects a real forged entry before a legal action',()=>{return denyHost(setup(HEDGE,{played:false,occupations:1}),'lessons')})
  scenario('A088 N3 legal closed pasture geometry permits 1 new free fences at zero wood',()=>{const s=setup(HEDGE,{configure(state){closed(state,[{"row": 1, "col": 2}, {"row": 1, "col": 3}])}});const r=fence(s,["V-1-3"]);assert.equal(res(r).wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,7);assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)),8);return{newFences:1,woodPaid:0,totalFences:7,reserve:8}})
  scenario('A088 N4 legal closed pasture geometry permits 2 new free fences at zero wood',()=>{const s=setup(HEDGE,{configure(state){closed(state,[{"row": 1, "col": 2}, {"row": 1, "col": 3}, {"row": 2, "col": 2}])}});const r=fence(s,["H-3-3", "V-2-4"]);assert.equal(res(r).wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,10);assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)),5);return{newFences:2,woodPaid:0,totalFences:10,reserve:5}})
  scenario('A088 N5 legal closed pasture geometry permits 3 new free fences at zero wood',()=>{const s=setup(HEDGE,{configure(state){closed(state,[{"row": 1, "col": 3}])}});const r=fence(s,["H-1-4", "H-2-4", "V-1-5"]);assert.equal(res(r).wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,7);assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)),8);return{newFences:3,woodPaid:0,totalFences:7,reserve:8}})
  scenario('A088 N6 4 actual new fences still pay 1 wood after the discount',()=>{const s=setup(HEDGE,{resources:{wood:1}}),r=fence(s,FOUR);assert.equal(res(r).wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)),11);return{newFences:4,woodPaid:1,reserve:11}})
  scenario('A088 N7 6 actual new fences still pay 3 wood after the discount',()=>{const s=setup(HEDGE,{resources:{wood:3}}),r=fence(s,SIX);assert.equal(res(r).wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,6);assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)),9);return{newFences:6,woodPaid:3,reserve:9}})
  scenario('A088 N8 six fences with two wood reject before four legal fences pay one wood',()=>{const s=setup(HEDGE,{resources:{wood:2}});fenceEntry(s);assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{edges:SIX}));const r=fenceCommit(s,FOUR);assert.equal(res(r).wood,1);return{underpaidRejected:true,retryFences:4,retryWood:1}})
  scenario('A088 N9 fifteen real placed fence pieces cannot be exceeded by the discount',()=>{const s=setup(HEDGE,{resources:{wood:10},configure(state){closed(state,[{row:0,col:2},{row:0,col:3},{row:1,col:2},{row:1,col:3},{row:1,col:4}],true)}});assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(s.getState().state.players[0]!)),0);const result=denyHost(s,'fencing');return{...result,fences:15,reserve:0}})
  scenario('A088 N10 open room field and outside farm fence targets reject before a closed legal pasture',()=>{const s=setup(HEDGE,{resources:{wood:5},configure(state){state.players[0]!.fields=[{row:0,col:3,stacks:[]}]}});fenceEntry(s);for(const edges of[['H-0-1'],['H-1-0','H-2-0','V-1-0','V-1-1'],['H-0-3','H-1-3','V-0-3','V-0-4'],['H-3-5']])assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{edges}));const r=fenceCommit(s,FOUR);assert.equal(res(r).wood,4);return{rejected:[true,true,true,true],retryFences:4,retryWood:4}})
  scenario('A088 N11 Hedge Keeper in hand cannot discount owner fences',()=>{const r=fence(setup(HEDGE,{played:false,resources:{wood:4}}));assert.equal(res(r).wood,0);return{newFences:4,woodPaid:4,discount:0}})
  scenario('A088 N12 only the opponent Hedge Keeper cannot discount owner fences',()=>{const r=fence(setup(HEDGE,{opponent:true,resources:{wood:4}}));assert.equal(res(r).wood,0);return{newFences:4,woodPaid:4,discount:0}})
  scenario('A088 N13 a later natural round grants three free fences again without accumulating a quota',()=>{const s=setup(HEDGE,{round:5,resources:{wood:1}});fence(s);turn(s,1,'forest');turn(s,0,'day-laborer');let r=confirmNext(s,turn(s,1,'grain-seeds'));assert.equal(r.state.round,6);ready(s,0);r=fence(s,['H-0-2','H-1-2','V-0-3']);assert.equal(res(r).wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,7);return{round:6,totalFences:7,totalWoodPaid:1,secondFreeFences:3}})
  scenario('A088 N14 actual discounted fence undo probes full restoration before one retry',()=>{const s=setup(HEDGE,{resources:{wood:1}});const before=undoRuleSnapshot(s.getState());fence(s);assertUndoRestored(before,s.undoAction());const r=fence(s);assert.equal(res(r).wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);return{restored:true,retryFences:4,retryWood:0}})
  scenario('A088 N15 the opponent actual four fence action pays full wood despite the owner Hedge Keeper',()=>{const s=setup(HEDGE,{configure(state){state.players[1]!.resources.wood=4}});complete(turn(s,0,'day-laborer'));turn(s,1,'fencing');const r=complete(ok(s.commitSelectionChoice(1,{edges:FOUR,palisadeEdges:[]})));assert.equal(res(r,1).wood,0);assert.equal(r.state.players[1]!.fenceSegments.length,4);assert.equal(r.state.players[0]!.fenceSegments.length,0);return{opponentWoodPaid:4,opponentFences:4,ownerFences:0}})
})
