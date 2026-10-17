import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { setWorkersAtHome } from '../../shared/domain/player'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit16Build from './_helpers/audit/ae-negative-16-build'

const CARD_ID = 'A143_Stonecutter'

// Touch the import so the listener side-effect remains referenced.
void A143_Stonecutter

describe('A143_Stonecutter session', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 2,
      stone: 2,
      food: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    // Placeholder ids in BOTH players' hands: random minors dealt by
    // `new GameSession()` are non-deterministic across runs, which makes
    // `improvement-any` option counts flaky. Placeholder ids resolve to
    // undefined in `getMinorImprovement` and get filtered out of buyable
    // options, so only Major improvements remain as candidates.
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)
    return session
  }

  it('reduces Major improvement stone cost by 1', () => {
    const session = setup()
    // ADR 0004 amendment: the printed {reed:2, stone:2} row is strictly
    // dominated by the A143-discounted {reed:2, stone:1} row and pruned;
    // the purchase auto-resolves on the discounted payment.
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    expect(after.resources.reed).toBe(0)
    expect(after.resources.stone).toBe(1)

    const entry = resp.state.log.find((row) => row.key === 'log.playImprovement')
    expect(entry?.params?.bonusSources).toEqual([CARD_ID])
  })
})

describe('ae-negative-16-build', () => {
  const { CUTTER, sessions, save, ok, setup, turn, drive, buy } = audit16Build
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A143 N1 actual major purchases reduce stone by one while zero stone Fireplace cannot grant stone',()=>{for(const[major,res]of[['Major_Joinery',{wood:2,stone:1}],['Major_Pottery',{clay:2,stone:1}],['Major_Basket',{reed:2,stone:1}],['Major_Well',{wood:1,stone:2}],['Major_Fireplace1',{clay:2,stone:0}]] as const){const s=setup(CUTTER,state=>Object.assign(state.players[0]!.resources,res));const r=buy(s,major);assert.ok(r.state.players[0]!.improvements.includes(major));assert.equal(r.state.players[0]!.resources.stone,0);save(`A143-N1-${major}`,r)}})
  it('A143 N2 one and two actual stone rooms cost four stone and two reed per room',()=>{for(const count of[1,2]){const s=setup(CUTTER,state=>{state.players[0]!.houseType='stone';Object.assign(state.players[0]!.resources,{stone:4*count,reed:2*count})});let r=turn(s,0,'farm-expansion');while(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.labelKey==='actions.construct.name');assert.ok(o);r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select');r=ok(s.commitSelectionChoice(0,{rooms:[{row:1,col:1},{row:2,col:1}].slice(0,count)}));r=drive(s,r,null);assert.equal(r.state.players[0]!.rooms,2+count);assert.equal(r.state.players[0]!.resources.stone,0);assert.equal(r.state.players[0]!.resources.reed,0);save(`A143-N2-${count}`,r)}})
  it('A143 N3 renovation discounts one stone total and ordinary clay room cannot grant stone',()=>{const s=setup(CUTTER,state=>{state.players[0]!.houseType='clay';Object.assign(state.players[0]!.resources,{stone:1,reed:1})});const r=drive(s,turn(s,0,'house-redevelopment'),null);assert.equal(r.state.players[0]!.houseType,'stone');assert.equal(r.state.players[0]!.resources.stone,0);assert.equal(r.state.players[0]!.resources.reed,0);const cs=setup(CUTTER,state=>{state.players[0]!.houseType='clay';Object.assign(state.players[0]!.resources,{clay:5,reed:2})});const clay=drive(cs,turn(cs,0,'farm-expansion'));assert.equal(clay.state.players[0]!.resources.stone,0);assert.equal(clay.state.players[0]!.resources.clay,0);save('A143-N3',{r,clay})})
  it('A143 N4 hand insufficient other material and illegal room payload cannot exploit discount',()=>{const hs=setup(CUTTER,state=>Object.assign(state.players[0]!.resources,{wood:2,stone:1}),false);assertRejectedUnchanged(hs,()=>hs.takeAction(0,'major-improvement'));const poor=setup(CUTTER,state=>Object.assign(state.players[0]!.resources,{wood:1,stone:1}));assertRejectedUnchanged(poor,()=>poor.takeAction(0,'major-improvement'));const s=setup(CUTTER,state=>{state.players[0]!.houseType='stone';Object.assign(state.players[0]!.resources,{stone:4,reed:2})});let r=turn(s,0,'farm-expansion');if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.labelKey==='actions.construct.name');assert.ok(o);r=ok(s.resolveChoice(0,o.value))}assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{rooms:[{row:99,col:99}]}));const built=drive(s,r);assert.equal(built.state.players[0]!.rooms,3);save('A143-N4',{r,built})})
  it('A143 N5 whole actual purchase undo restores discounted stone before one retry',()=>{const s=setup(CUTTER,state=>Object.assign(state.players[0]!.resources,{wood:2,stone:1}));const first=buy(s,'Major_Joinery');const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.stone,1);assert.equal(undone.state.players[0]!.resources.wood,2);assert.ok(!undone.state.players[0]!.improvements.includes('Major_Joinery'));const retry=buy(s,'Major_Joinery');assert.equal(retry.state.players[0]!.resources.stone,0);save('A143-N5',{first,undone,retry})})
})
