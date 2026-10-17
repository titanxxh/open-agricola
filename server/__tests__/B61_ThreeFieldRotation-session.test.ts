import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B061_ThreeFieldRotation'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import type { GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit21Harvest from './_helpers/audit/ae-negative-21-harvest'

const CARD_ID = 'B061_ThreeFieldRotation'

describe('B061_ThreeFieldRotation session', () => {
  it('gains 3 food when player has grain field, vegetable field, and empty field', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 2, stacks: [] },
    ]

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onStartHarvestFieldPhase!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 3 })
  })

  it('does NOT gain food if missing grain field', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 1, stacks: [] },
    ]

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onStartHarvestFieldPhase!(state, player))
    expect(flow).toBeUndefined()
  })

  it('does NOT gain food if missing vegetable field', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [] },
    ]

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onStartHarvestFieldPhase!(state, player))
    expect(flow).toBeUndefined()
  })

  it('does NOT gain food if missing empty field', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onStartHarvestFieldPhase!(state, player))
    expect(flow).toBeUndefined()
  })

})

describe('ae-negative-21-harvest', () => {
  const { ROTATION, OCCS, sessions, save, ok, setup, menu, buy, end, fields } = audit21Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B061 N1 actual free purchase needs three occupations gives no immediate food and whole undo removes card',()=>{const s=setup(ROTATION),{pending,r}=buy(s,ROTATION);assert.equal(r.state.players[0]!.resources.food,100);const undone=ok(s.undoAction());assert.ok(undone.state.players[0]!.minorHand.includes(ROTATION));assert.ok(!undone.state.players[0]!.minorPlayed.includes(ROTATION));const poor=setup(ROTATION,state=>state.players[0]!.occupationPlayed=OCCS.slice(0,2)),denied=menu(poor);assertRejectedUnchanged(poor,()=>poor.resolveChoice(0,ROTATION));const legal=ok(poor.resolveChoice(0,'B004_WoodPile'));assert.equal(legal.state.players[0]!.resources.food,100);save('B061-N1',{pending,r,undone,denied,legal})})
  it('B061 N2 natural field phase start grants three food only for simultaneous grain vegetable and initially empty fields',()=>{for(const kinds of[['grain','vegetable',null],['grain','vegetable'],['vegetable',null],['grain',null],[null]]as const){const configure=(state:GameState)=>fields(state,kinds.slice()),on=end(setup(ROTATION,configure,true)),off=end(setup(ROTATION,configure,false)),income=kinds.includes('grain' as never)&&kinds.includes('vegetable' as never)&&kinds.includes(null as never)?3:0;assert.equal(on.r.state.players[0]!.resources.food-off.r.state.players[0]!.resources.food,income);assert.equal(on.r.state.players[1]!.resources.food,off.r.state.players[1]!.resources.food);assert.equal(on.r.state.round,5);save(`B061-N2-${kinds.join('-')}`,{on,off,income})}})
  it('B061 N3 last crop creates empty field only after eligibility check while hand opponent and nonharvest remain excluded',()=>{const last=(state:GameState)=>fields(state,['grain','vegetable','grain'],0,1),on=end(setup(ROTATION,last,true)),off=end(setup(ROTATION,last,false));assert.equal(on.r.state.players[0]!.resources.food,off.r.state.players[0]!.resources.food);assert.ok(on.r.state.players[0]!.fields.every(f=>f.stacks.length===0));const kinds=(state:GameState)=>fields(state,['grain','vegetable',null]),a=end(setup(ROTATION,kinds,true,3)),b=end(setup(ROTATION,kinds,false,3));assert.equal(a.r.state.players[0]!.resources.food,b.r.state.players[0]!.resources.food);const other=(state:GameState)=>fields(state,['grain','vegetable',null],1),c=end(setup(ROTATION,other,true)),d=end(setup(ROTATION,other,false));assert.equal(c.r.state.players[0]!.resources.food,d.r.state.players[0]!.resources.food);save('B061-N3',{on,off,a,b,c,d})})
})
