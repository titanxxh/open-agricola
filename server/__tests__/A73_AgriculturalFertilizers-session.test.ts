import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A073_AgriculturalFertilizers'
import '../../shared/cards/A/A075_LumberMill'
import '../../shared/cards/A/A079_GardenHoe'
import '../../shared/cards/A/A020_DoubleTurnPlow'
import '../../shared/cards/A/A115_ChiefForester'
import '../../shared/cards/A/A071_ClearingSpade'
import '../../shared/cards/A/A066_FeedingDish'
import '../../shared/cards/A/A078_Canoe'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import * as audit10FarmPaySow from './_helpers/audit/ae-negative-10-farm-pay-sow'

const CARD_ID = 'A073_AgriculturalFertilizers'

const edgesForTwoTiles = [
  'H-1-1',
  'H-1-2',
  'H-2-1',
  'H-2-2',
  'V-1-1',
  'V-1-3',
]

const edgesForOneTile = [
  'H-1-1',
  'H-2-1',
  'V-1-1',
  'V-1-2',
]

describe('A073_AgriculturalFertilizers session', () => {
  const setupFencing = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 20
    player.resources.grain = 3
    player.resources.vegetable = 1
    // Add empty fields for sow
    player.fields = [
      { row: 0, col: 3, stacks: [] },
      { row: 0, col: 4, stacks: [] },
    ]

    session.loadState(state)
    return session
  }

  it('grants optional sow after fencing 2+ tiles', () => {
    const session = setupFencing()

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTwoTiles,
    })
    expect(resp.ok).toBe(true)
    // After fencing 2 tiles, optional sow should be offered
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.request.options?.some((o) => o.labelKey === 'actions.sow.name')).toBe(true)
    expect(resp.interaction.request.options?.some((o) => o.labelKey === 'ui.interactionOptionalSkip')).toBe(true)
  })

  it('does NOT grant sow after fencing only 1 tile', () => {
    const session = setupFencing()

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: edgesForOneTile,
    })
    expect(resp.ok).toBe(true)
    // Only 1 tile fenced, no sow offered
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('grants optional sow after building 2 stables via farm-expansion', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 20
    player.resources.grain = 2
    player.resources.vegetable = 1
    player.fields = [
      { row: 0, col: 3, stacks: [] },
    ]

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    if (resp.interaction.request.kind === 'choice') {
      const stables = resp.interaction.request.options!.find((option) => option.labelKey === 'actions.stables.name')
      expect(stables).toBeDefined()
      resp = session.resolveChoice(0, stables!.value)
    }
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') return

    const tiles = resp.interaction.request.farm.selectableTiles
    expect(tiles.length).toBeGreaterThanOrEqual(2)
    const [s1, s2] = tiles

    resp = session.commitSelectionChoice(0, { stables: [s1!, s2!] })
    expect(resp.ok).toBe(true)
    // 2 stables built => 2 new used spaces => optional sow offered
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.request.options?.some((o) => o.labelKey === 'actions.sow.name')).toBe(true)
  })

  it('cannot play A73 without at least 1 pasture (prerequisite)', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // No pastures
    player.pastures = []
    // Deterministic hand: A25 (free, no prerequisite) + A73 (needs pasture).
    // `new GameSession()` deals a random hand from RNG (Math.random seed),
    // so the default hand occasionally contained 7 cards where none were
    // playable — skipping the choice prompt and making this test flaky.
    // Pinning the hand to a known-playable card plus A73 removes the RNG
    // dependency.
    player.minorHand = ['A025_Bassinet', CARD_ID]

    session.loadState(state)

    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // A73 should not be in the playable options (no pasture)
    const a73Option = resp.interaction.request.options?.find(
      (option) => option.value === CARD_ID,
    )
    expect(a73Option).toBeUndefined()
  })
})

describe('A073_AgriculturalFertilizers session', () => {
  const CARD_ID = 'A073_AgriculturalFertilizers'

  const setupFencing = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 20
    player.resources.grain = 3
    player.resources.vegetable = 1

    player.fields = [
      { row: 0, col: 3, stacks: [] },
      { row: 0, col: 4, stacks: [] },
    ]

    session.loadState(state)
    return session
  }

  it('A073 S1: a pasture allows playing Agricultural Fertilizers for free', () => {
    const session = new GameSession(6073, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.pastures = [{
      id: 'prerequisite', size: 1, tiles: [{ row: 2, col: 4 }], stables: 0,
      animalType: null, animalCount: 0,
    }]
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)
      && resp.interaction.stateId === 'wait'
      && !resp.interaction.request.options?.some((option) => option.value === CARD_ID)) {
      const enter = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
      if (enter) resp = session.resolveChoice(0, enter.value)
    }
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)) {
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const card = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(card).toBeDefined()
      resp = session.resolveChoice(0, card!.value)
    }

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A073 S2: without a pasture Agricultural Fertilizers is not offered', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!

    player.pastures = []






    player.minorHand = ['A025_Bassinet', CARD_ID]

    session.loadState(state)

    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const a73Option = resp.interaction.request.options?.find(
      (option) => option.value === CARD_ID,
    )
    expect(a73Option).toBeUndefined()
  })
})

describe('ae-negative-10-farm-pay-sow', () => {
  const { FERT, PLOW, sessions, scenario, setup, ok, res, opts, turn, close, complete, enter, purchase, buy, deny, farm, stable, fence, offeredSow, sow, stack, undo } = audit10FarmPaySow
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  scenario('A073 N1 a real pasture permits the free actual purchase',()=>{const r=buy(setup(FERT,{played:false,pastureCols:[4]}),FERT);assert.equal(res(r).wood,0);return{cardPlayed:true,woodPaid:0,pastureCount:1}})
  scenario('A073 N2 no pasture rejects the forged purchase before a legal retry',()=>{const r=deny(setup(FERT,{played:false}),FERT);assert.equal(res(r).wood,0);return{unavailable:true,forgedRejected:true,legalRetryCompleted:true}})
  scenario('A073 N3 two new stable spaces grant one additional Sow paying both crop seeds',()=>{const s=setup(FERT,{pastureCols:[4],resources:{wood:4,grain:1,vegetable:1}});const before=getUsedFarmyardTileKeys(s.getState().state.players[0]!).size;let r=stable(s);assert.equal(getUsedFarmyardTileKeys(r.state.players[0]!).size-before,2);assert.equal(offeredSow(r),true);r=sow(s,r,[{row:0,col:1,crop:'grain'},{row:0,col:2,crop:'vegetable'}]);assert.equal(res(r).wood,0);assert.equal(res(r).grain,0);assert.equal(res(r).vegetable,0);assert.equal(stack(r,1),3);assert.equal(stack(r,2),2);return{woodPaid:4,newUsedSpaces:2,extraSowCount:1,grainPaid:1,vegetablePaid:1,grainStack:3,vegetableStack:2}})
  scenario('A073 N4 one new stable space gives no additional Sow',()=>{const r=complete(stable(setup(FERT,{pastureCols:[4],resources:{wood:2,grain:1}}),[{row:1,col:1}]));assert.equal(offeredSow(r),false);assert.equal(res(r).wood,0);assert.equal(res(r).grain,1);return{newStableCount:1,extraSowCount:0,woodPaid:2,grain:1}})
  scenario('A073 N5 two stables inside already used pasture give no additional Sow',()=>{const s=setup(FERT,{pastureCols:[3,4],resources:{wood:4,grain:1}});const before=getUsedFarmyardTileKeys(s.getState().state.players[0]!).size;const r=complete(stable(s,[{row:2,col:3},{row:2,col:4}]));assert.equal(getUsedFarmyardTileKeys(r.state.players[0]!).size-before,0);assert.equal(offeredSow(r),false);assert.equal(res(r).wood,0);return{stableCount:2,newUsedSpaces:0,extraSowCount:0,woodPaid:4}})
  scenario('A073 N6 declining the granted Sow preserves both seeds',()=>{const s=setup(FERT,{pastureCols:[4],resources:{wood:4,grain:1,vegetable:1}});let r=stable(s);assert.equal(offeredSow(r),true);const skip=opts(r).find(o=>o.value==='__skip__');assert.ok(skip);r=complete(close(s,ok(s.resolveChoice(0,skip.value))));assert.equal(res(r).grain,1);assert.equal(res(r).vegetable,1);assert.equal(stack(r,1),0);return{declined:true,grain:1,vegetable:1,planted:0}})
  scenario('A073 N7 fencing two adjacent new spaces grants one additional Sow',()=>{const s=setup(FERT,{pastureCols:[4],resources:{wood:5,grain:1}});let r=fence(s);assert.equal(offeredSow(r),true);r=sow(s,r,[{row:0,col:1,crop:'grain'}]);assert.equal(res(r).wood,0);assert.equal(stack(r,1),3);return{newUsedSpaces:2,woodPaid:5,fencePieces:9,extraSowCount:1,grainStack:3}})
  scenario('A073 N8 fencing one adjacent new space gives no additional Sow',()=>{const r=complete(fence(setup(FERT,{pastureCols:[4],resources:{wood:3,grain:1}}),false));assert.equal(offeredSow(r),false);assert.equal(res(r).wood,0);assert.equal(res(r).grain,1);return{newUsedSpaces:1,woodPaid:3,fencePieces:7,extraSowCount:0,grain:1}})
  scenario('A073 N9 two actual wooden rooms grant one additional Sow after full payment',()=>{const s=setup(FERT,{pastureCols:[4],resources:{wood:10,reed:4,grain:1}});farm(s,'room');let r=ok(s.commitSelectionChoice(0,{rooms:[{row:1,col:1},{row:2,col:1}]}));assert.equal(r.state.players[0]!.rooms,4);assert.equal(res(r).wood,0);assert.equal(res(r).reed,0);assert.equal(offeredSow(r),true);r=sow(s,r,[{row:0,col:1,crop:'grain'}]);return{rooms:4,woodPaid:10,reedPaid:4,extraSowCount:1,grainStack:stack(r,1)}})
  scenario('A073 N10 separate one-space actions do not accumulate a two-space trigger',()=>{const s=setup(FERT,{pastureCols:[4],resources:{wood:5,grain:1}});complete(fence(s,false));turn(s,1,'grain-seeds');const r=complete(stable(s,[{row:1,col:1}]));assert.equal(offeredSow(r),false);assert.equal(res(r).grain,1);assert.equal(res(r).wood,0);return{separateActions:2,eachNewUsedSpaces:1,extraSowCount:0,grain:1}})
  scenario('A073 N11 opponent two-stable construction cannot grant owner Sow',()=>{const s=setup(FERT,{pastureCols:[4],resources:{grain:1},configure(state){state.players[1]!.resources.wood=4}});turn(s,0,'grain-seeds');const r=complete(stable(s,undefined,1));assert.equal(offeredSow(r),false);assert.equal(res(r).grain,2);assert.equal(res(r,1).wood,0);return{opponentStableCount:2,ownerExtraSowCount:0}})
  scenario('A073 N12 unplayed Fertilizers cannot grant Sow after construction',()=>{const r=complete(stable(setup(FERT,{played:false,pastureCols:[4],resources:{wood:4,grain:1}})));assert.equal(offeredSow(r),false);assert.equal(res(r).grain,1);return{inHand:true,extraSowCount:0,grain:1}})
  scenario('A073 N13 Double Turn Plow exposes its real two-field action granularity without a resolved rule oracle',()=>{const s=setup(FERT,{round:3,fields:0,pastureCols:[4],resources:{grain:2},configure(state){state.players[0]!.minorHand.push(PLOW)}});let r=purchase(s,enter(s),PLOW);for(let n=0;n<2;n++){for(let q=0;q<3&&r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice';q++){if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const choice=opts(r).find(o=>o.value!=='__skip__');assert.ok(choice,JSON.stringify(r.interaction));r=ok(s.resolveChoice(0,choice.value))}}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='plow',JSON.stringify(r.interaction));const tile=r.interaction.request.farm.selectableTiles[0];assert.ok(tile);r=ok(s.commitSelectionChoice(0,{tile}))}assert.equal(r.state.players[0]!.fields.length,2);assert.equal(res(r).grain,1);const extra=offeredSow(r);if(extra)r=ok(s.resolveChoice(0,opts(r).find(o=>o.value==='__skip__')!.value));complete(r);return{paidGrain:1,newFields:2,additionalSowObserved:extra,ruleUnresolved:true}})
  scenario('A073 N14 undo qualifying construction and Sow restores the real farm before one retry',()=>{const s=setup(FERT,{pastureCols:[4],resources:{wood:4,vegetable:1}});const before=undoRuleSnapshot(s.getState());let r=sow(s,stable(s),[{row:0,col:1,crop:'vegetable'}]);assert.equal(res(r).wood,0);assert.equal(stack(r,1),2);r=undo(s,before,()=>sow(s,stable(s),[{row:0,col:1,crop:'vegetable'}]));assert.equal(res(r).wood,0);assert.equal(res(r).vegetable,0);assert.equal(stack(r,1),2);return{fullScopeRestored:true,retryStableCount:2,retryVegetableStack:2,retryWood:0}})
  scenario('A073 N15 illegal stable targets reject before a legal qualifying construction',()=>{const s=setup(FERT,{pastureCols:[4],resources:{wood:4,vegetable:1}});farm(s,'stable');assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{stables:[{row:0,col:1},{row:0,col:2}]}));assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{stables:[{row:3,col:0}]}));let r=ok(s.commitSelectionChoice(0,{stables:[{row:1,col:1},{row:1,col:2}]}));assert.equal(offeredSow(r),true);r=sow(s,r,[{row:0,col:1,crop:'vegetable'}]);assert.equal(r.state.players[0]!.stableTiles.length,2);assert.equal(res(r).wood,0);return{illegalTargetsRejected:true,legalStableCount:2,woodPaid:4,vegetableStack:2}})
})
