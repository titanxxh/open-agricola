import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/B/B054_Tumbrel'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit20Sow from './_helpers/audit/ae-negative-20-sow'

const CARD_ID = 'B054_Tumbrel'

describe('B054_Tumbrel session', () => {
  it('onBuy returns a gain-2-food flow', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBuy!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('sow listener fires and gains food per stable', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]

    const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    session.loadState(state)

    // Find the Tumbrel sow listener
    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (reg) => reg.id === 'B54-tumbrel-after-sow',
    )
    expect(listener).toBeDefined()

    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'sow',
      phase: 'after',
      result: { type: 'ok' },
    }

    const result = session.withCtx(() => executeCardListener(listener!, context))
    expect(result).toBeDefined()
    expect(result!.flow).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('sow listener does not fire with 0 stables', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = []

    const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    session.loadState(state)

    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (reg) => reg.id === 'B54-tumbrel-after-sow',
    )
    expect(listener).toBeDefined()

    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'sow',
      phase: 'after',
      result: { type: 'ok' },
    }

    const result = session.withCtx(() => executeCardListener(listener!, context))
    expect(result).toBeUndefined()
  })


  it('sow listener counts the B85 FarmHand stable (card-facing count)', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = [{ row: 2, col: 0 }]
    player.occupationPlayed.push('B085_FarmHand')
    player.cardStates = {
      B085_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
    }

    const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    session.loadState(state)

    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (reg) => reg.id === 'B54-tumbrel-after-sow',
    )!

    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'sow',
      phase: 'after',
      result: { type: 'ok' },
    }

    const result = session.withCtx(() => executeCardListener(listener, context))
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('sow listener gains 3 food with 3 stables', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }]

    const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    session.loadState(state)

    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (reg) => reg.id === 'B54-tumbrel-after-sow',
    )
    expect(listener).toBeDefined()

    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'sow',
      phase: 'after',
      result: { type: 'ok' },
    }

    const result = session.withCtx(() => executeCardListener(listener!, context))
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(3)
  })
})

describe('ae-negative-20-sow', () => {
  const { CARD, FORESTER, sessions, save, ok, finish, turn, make, menu, buy, sow } = audit20Sow
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B054 N1 real wood purchase immediately grants exactly two food and undo restores both before one retry',()=>{const s=make(2,false),{pending,r}=buy(s);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,102);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,1);assert.equal(undone.state.players[0]!.resources.food,100);const retry=buy(s).r;assert.equal(retry.state.players[0]!.resources.food,102);save('B054-N1',{pending,r,undone,retry});const poor=make(2,false,state=>state.players[0]!.resources.wood=0),denied=menu(poor);assertRejectedUnchanged(poor,()=>poor.resolveChoice(0,CARD));const legal=ok(poor.resolveChoice(0,'B004_WoodPile'));assert.equal(legal.state.players[0]!.resources.food,100);save('B054-N1-poor',{denied,legal})})
  it('B054 N2 real unconditional Sow pays one food per zero through four physical stables including fenced stable',()=>{for(const n of[0,1,2,3,4]){const s=make(n,true,state=>{if(n){const p=state.players[0]!;p.pastures=[{id:'stable',tiles:[{row:0,col:1}],animalType:null,animalCount:0}];p.fenceSegments=['H-0-1','H-1-1','V-0-1','V-0-2'].map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}))}}),pending=sow(s,turn(s,0,'grain-utilization')),r=finish(s,ok(s.commitSelectionChoice(0,{crops:[{row:1,col:1,crop:'grain'}]})));assert.equal(r.state.players[0]!.resources.food,100+n);assert.equal(r.state.players[0]!.resources.grain,1);assert.deepEqual(r.state.players[0]!.fields.find(f=>f.row===1&&f.col===1)!.stacks,[{kind:'grain',remaining:3}]);assert.equal(r.state.players[1]!.resources.food,100);save(`B054-N2-${n}`,{pending,r})}})
  it('B054 N3 official Chief Forester restricted one field Sow and hand or opponent Sow cannot award owner food',()=>{const s=make(2,true,state=>state.players[0]!.occupationPlayed=[FORESTER]),pending=sow(s,turn(s,0,'forest')),r=finish(s,ok(s.commitSelectionChoice(0,{crops:[{row:1,col:1,crop:'grain'}]})));save('B054-N3-restricted',{pending,r,expectedFood:100,observedFood:r.state.players[0]!.resources.food});assertRuleOutcome(r.state.players[0]!.resources.food,100);assert.equal(r.state.players[0]!.resources.grain,1);assert.ok(r.state.players[0]!.resources.wood>0);const h=make(2,false),hp=sow(h,turn(h,0,'grain-utilization')),hand=finish(h,ok(h.commitSelectionChoice(0,{crops:[{row:1,col:1,crop:'grain'}]})));assert.equal(hand.state.players[0]!.resources.food,100);const other=make(2,true,state=>{state.players[1]!.fields=[{row:0,col:1,stacks:[]}];state.players[1]!.resources.grain=1});turn(other,0,'day-laborer');const op=sow(other,turn(other,1,'grain-utilization')),o=finish(other,ok(other.commitSelectionChoice(1,{crops:[{row:0,col:1,crop:'grain'}]})));assert.equal(o.state.players[0]!.resources.food,102);save('B054-N3',{pending,r,hp,hand,op,o})})
  it('B054 N4 invalid field actor and whole Sow undo restore seed stack and food before one valid replay',()=>{const s=make(3),pending=sow(s,turn(s,0,'grain-utilization'));assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{crops:[{row:99,col:99,crop:'grain'}]}));assertRejectedUnchanged(s,()=>s.commitSelectionChoice(1,{crops:[{row:1,col:1,crop:'grain'}]}));const r=finish(s,ok(s.commitSelectionChoice(0,{crops:[{row:1,col:1,crop:'grain'}]}))),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,100);assert.equal(undone.state.players[0]!.resources.grain,2);assert.deepEqual(undone.state.players[0]!.fields.find(f=>f.row===1&&f.col===1)!.stacks,[]);sow(s,turn(s,0,'grain-utilization'));const retry=finish(s,ok(s.commitSelectionChoice(0,{crops:[{row:1,col:1,crop:'grain'}]})));assert.equal(retry.state.players[0]!.resources.food,103);save('B054-N4',{pending,r,undone,retry})})
})
