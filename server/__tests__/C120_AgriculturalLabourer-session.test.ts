import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { setStoredResource } from '../../shared/cards/helpers/card-storage'
import { C120_AgriculturalLabourer_impl } from '../../shared/cards/C/C120_AgriculturalLabourer'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/C/C120_AgriculturalLabourer'
import assert from 'node:assert/strict'
import * as audit49Fields from './_helpers/audit/ae-negative-49-fields'

const CARD_ID = 'C120_AgriculturalLabourer'
const GAIN_LISTENER = C120_AgriculturalLabourer_impl.listeners.find((listener) => listener.id === 'C120-agricultural-labourer-after-gain')!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { grain: 2 },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'gain',
  ...overrides,
})

const directContext = (
  transactionEvents: CardListenerContext['transactionEvents'],
): { session: GameSession; context: CardListenerContext } => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.occupationPlayed.push(CARD_ID)
  setStoredResource(player, CARD_ID, 'clay', 8)
  return { session, context: {
    actionHooks: session.actionHooks,
    state,
    player,
    space: state.actionSpaces.find((space) => space.id === 'day-laborer')!,
    actionId: 'gain',
    phase: 'after',
    transactionEvents,
    actionEvents: transactionEvents,
    result: { type: 'ok', resourcesGained: { grain: 2 } },
  } as unknown as CardListenerContext }
}

describe('C120_AgriculturalLabourer session', () => {
  it('takes clay from the card for grain moved to the player even without result gains', () => {
    const { session, context: ctx } = directContext([moved()])
    ctx.result = { type: 'ok' }

    const result = session.withCtx(() => executeCardListener(GAIN_LISTENER, ctx))

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'take-from-card',
      params: { clay: 2 },
      sourceCard: CARD_ID,
    })
  })

  it('does not trigger for non-grain events even when result reports grain', () => {
    const { session, context: ctx } = directContext([moved({ resources: { wood: 2 } })])

    const result = session.withCtx(() => executeCardListener(GAIN_LISTENER, ctx))

    expect(result).toBeUndefined()
  })

  it('does not trigger without a current grain event', () => {
    const { session, context: ctx } = directContext([])

    const result = session.withCtx(() => executeCardListener(GAIN_LISTENER, ctx))

    expect(result).toBeUndefined()
  })

  it('takes clay from the card for grain gained through exchange events', () => {
    const { context: ctx } = directContext([])
    const player = ctx.player
    const event = {
      type: 'resource.exchanged',
      paid: { food: 1 },
      gained: { grain: 2 },
      paidFrom: { kind: 'player', playerId: player.id },
      paidTo: { kind: 'supply' },
      gainedFrom: { kind: 'supply' },
      gainedTo: { kind: 'player', playerId: player.id },
      exchangeSource: 'TestExchange',
      times: 1,
    } as any

    const { session: exchangeSession, context: exchangeContext } = directContext([event])
    const result = exchangeSession.withCtx(() => GAIN_LISTENER.handler(exchangeContext))

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'take-from-card',
      params: { clay: 2 },
      sourceCard: CARD_ID,
    })
  })
})

describe('ae-negative-49-fields', () => {
  const { LAB, GREEN, sessions, save, ok, make, choose, finish, lesson, progress, ready, action, field, stock } = audit49Fields
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C120 N1 actual purchase stores eight clay then a real grain arrival takes one and whole grain action undo restores it before one replay',()=>{const s=make(LAB,false),bought=lesson(s,LAB);assert.equal(stock(bought),8);assert.equal(bought.state.players[0]!.resources.clay,0);action(s,1,'day-laborer');const a=action(s,0,'grain-seeds');assert.equal(a.state.players[0]!.resources.grain,1);assert.equal(a.state.players[0]!.resources.clay,1);assert.equal(stock(a),7);const u=ok(s.undoAction());assert.equal(stock(u),8);assert.equal(u.state.players[0]!.resources.grain,0);assert.equal(u.state.players[0]!.resources.clay,0);const r=action(s,0,'grain-seeds');assert.equal(stock(r),7);assert.equal(r.state.players[0]!.resources.clay,1);save('C120-N1',{bought,a,u,r})})
  it('C120 N2 spending grain vegetables a hand card and actual opponent grain cannot take stored clay',()=>{const s=make(LAB,false,state=>{field(state);state.players[0]!.resources.grain=1}),bought=lesson(s,LAB);action(s,1,'day-laborer');ready(s);let pending=ok(s.takeAction(0,'grain-utilization'));if(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice')pending=choose(s,pending,o=>o.labelKey==='actions.sow.name');assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='farm-select'&&pending.interaction.request.farm.farmType==='sow');const sow=finish(s,ok(s.commitSelectionChoice(0,{crops:[{row:0,col:2,crop:'grain'}]})));assert.equal(sow.state.players[0]!.resources.clay,0);assert.equal(stock(sow),8);const t=make(LAB,false,state=>state.round=14),v=lesson(t,LAB);action(t,1,'day-laborer');const veg=action(t,0,'vegetable-seeds');assert.equal(veg.state.players[0]!.resources.clay,0);assert.equal(stock(veg),8);const q=make(LAB,false),a=lesson(q,LAB),opponent=action(q,1,'grain-seeds');assert.equal(opponent.state.players[0]!.resources.clay,0);assert.equal(stock(opponent),8);const h=make(LAB,false),hand=action(h,0,'grain-seeds');assert.equal(hand.state.players[0]!.resources.clay,0);assert.equal(stock(hand),0);save('C120-N2',{bought,pending,sow,v,veg,a,opponent,hand})})
  it('C120 N3 three distinct real grain harvests exhaust exactly eight stored clay and a later grain cannot create a ninth',()=>{const s=make(LAB,false,state=>field(state,3,'grain',3)),bought=lesson(s,LAB),rows=[];for(const[round,grain,clay,left]of[[8,3,3,5],[10,6,6,2],[12,9,8,0]] as const){const r=progress(s,round);assert.equal(r.state.players[0]!.resources.grain,grain);assert.equal(r.state.players[0]!.resources.clay,clay);assert.equal(stock(r),left);rows.push(r)}const later=action(s,0,'grain-seeds');assert.equal(later.state.players[0]!.resources.grain,10);assert.equal(later.state.players[0]!.resources.clay,8);assert.equal(stock(later),0);save('C120-N3',{bought,rows,later})})
  it('C120 N4 an actual Green Grocer next round food for grain trade receives exactly one clay and never duplicates it through downstream clay gain',()=>{const s=make(LAB,false,state=>state.players[0]!.occupationPlayed=[GREEN]),bought=lesson(s,LAB);const pending=progress(s,8,GREEN);let r=pending;if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='select-trigger')r=ok(s.resolveChoice(0,GREEN));r=choose(s,r,o=>o.value!=='__skip__');r=finish(s,r,false);assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.clay,1);assert.equal(stock(r),7);save('C120-N4',{bought,pending,r})})
})
