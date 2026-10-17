import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import type { ActionFlow, ActionSpace, GameState } from '../../shared/contract/types'
import '../../shared/cards/C/C154_TwinResearcher'
import assert from 'node:assert/strict'
import * as audit55Phase from './_helpers/audit/ae-negative-55-phase'


const CARD_ID = 'C154_TwinResearcher'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

const setResource = (space: ActionSpace, key: string, value: number) => {
  space.resources[key] = value
}

const ensureAccumulationSpace = (state: GameState, id: string, resource: string, amount: number) => {
  let space = state.actionSpaces.find((entry) => entry.id === id)
  if (!space) {
    space = { id, type: 'accumulation', nameKey: `actions.${id}.name`, resources: {}, gainPerRound: {}, takenBy: [] } as ActionSpace
    state.actionSpaces.push(space)
  }
  space.resources[resource] = amount
  return space
}

describe('C154_TwinResearcher session', () => {
  it('offers pay-gain (1 food -> 1 score) when forest and grove have equal wood', () => {


    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const listener = findListener(session, 'C154-twin-researcher-before-place-farmer')!
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const grove = state.actionSpaces.find((s) => s.id === 'grove')!
    setResource(forest, 'wood', 3)
    setResource(grove, 'wood', 3)
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    // Expect a pay-gain flow (sequence with pay-resources then bonus-vp)
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    const childActionIds = flow.children.map((c: ActionFlow) => c.actionId)
    expect(childActionIds).toContain('pay')
    expect(childActionIds).toContain('bonus-vp')
  })

  it('does not trigger when counts differ', () => {

    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const listener = findListener(session, 'C154-twin-researcher-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const grove = state.actionSpaces.find((s) => s.id === 'grove')!
    setResource(forest, 'wood', 3)
    setResource(grove, 'wood', 5)
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('triggers on clay-pit when it matches hollow-4', () => {

    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const listener = findListener(session, 'C154-twin-researcher-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3

    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const hollow4 = state.actionSpaces.find((s) => s.id === 'hollow-4')
    if (!clayPit || !hollow4) return
    setResource(clayPit, 'clay', 2)
    setResource(hollow4, 'clay', 2)
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: clayPit,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
  })

  it('does not trigger on non-pair spaces', () => {

    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const listener = findListener(session, 'C154-twin-researcher-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('does not trigger when player has no food', () => {

    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const listener = findListener(session, 'C154-twin-researcher-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 0

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const grove = state.actionSpaces.find((s) => s.id === 'grove')!
    setResource(forest, 'wood', 3)
    setResource(grove, 'wood', 3)
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('triggers on hollow when it matches clay-pit', () => {

    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const listener = findListener(session, 'C154-twin-researcher-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3

    ensureAccumulationSpace(state, 'clay-pit', 'clay', 2)
    const hollow = ensureAccumulationSpace(state, 'hollow', 'clay', 2)

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: hollow,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
  })

  it('triggers on copse-add when it matches forest or grove', () => {

    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const listener = findListener(session, 'C154-twin-researcher-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3

    const forest = ensureAccumulationSpace(state, 'forest', 'wood', 4)
    const grove = ensureAccumulationSpace(state, 'grove', 'wood', 5)
    const copseAdd = ensureAccumulationSpace(state, 'copse-add', 'wood', 4)

    let result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: copseAdd,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()

    setResource(forest, 'wood', 5)
    setResource(grove, 'wood', 4)
    result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: copseAdd,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
  })
})

describe('ae-negative-55-phase', () => {
  const { sessions, ok, save, make, finish, score } = audit55Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C154 N1 equal wood clay food and stone piles before collection permit exactly one paid point with both physical clay directions',()=>{for(const[space,mate,key]of[['forest','grove','wood'],['clay-pit','hollow-4','clay'],['fishing','traveling-players','food'],['western-quarry','eastern-quarry','stone'],['hollow-4','clay-pit','clay']]as const){const s=make('C154_TwinResearcher',st=>{st.actionSpaces.find(a=>a.id===space)!.resources[key]=2;st.actionSpaces.find(a=>a.id===mate)!.resources[key]=2;},true,14),r=finish(s,ok(s.takeAction(0,space)),true);assert.equal(r.state.players[0]!.resources.food,space==='fishing'?101:99);assert.equal(r.state.actionSpaces.find(a=>a.id===mate)!.resources[key],2);assert.equal(r.state.actionSpaces.find(a=>a.id===space)!.resources[key],0);assert.equal(score(r,'C154_TwinResearcher'),1);save(`C154-N1-${space}`,r)}})
  it('C154 N2 unequal piles optional decline no food opponent and card-only-in-hand never purchase a point',()=>{for(const mode of['unequal','decline','food','opponent','hand']){const actor=mode==='opponent'?1:0,s=make('C154_TwinResearcher',st=>{st.currentPlayerIndex=actor;st.players[0]!.resources.food=mode==='food'?0:100;st.actionSpaces.find(a=>a.id==='forest')!.resources.wood=2;st.actionSpaces.find(a=>a.id==='grove')!.resources.wood=mode==='unequal'?3:2;st.actionSpaces.find(a=>a.id==='copse')!.resources.wood=1;},mode!=='hand',14),r=finish(s,ok(s.takeAction(actor,'forest')),mode!=='decline');assert.equal(score(r,'C154_TwinResearcher'),0);assert.equal(r.state.players[0]!.resources.food,mode==='food'?0:100);assert.equal(r.state.actionSpaces.find(a=>a.id==='grove')!.resources.wood,mode==='unequal'?3:2);save(`C154-N2-${mode}`,r)}})
})
