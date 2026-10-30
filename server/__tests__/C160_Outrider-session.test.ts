import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C160_Outrider'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit56Purchase from './_helpers/audit/ae-negative-56-purchase'


const CARD_ID = 'C160_Outrider'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

describe('C160_Outrider session', () => {
  it('gains 1 grain when placing on the most recently revealed space', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C160-outrider-before-place-farmer')!
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 5
    // roundActionOrder[state.round - 1] is the last revealed action id
    state.roundActionOrder[4] = 'cultivation'
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const cultivation = state.actionSpaces.find((s) => s.id === 'cultivation')
    if (!cultivation) return

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: cultivation,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ grain: 1 })
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('does not trigger when placing on a different action space', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C160-outrider-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 5
    state.roundActionOrder[4] = 'cultivation'
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
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

  it('does not trigger when roundActionOrder entry is null', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C160-outrider-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 5
    // leave roundActionOrder[4] as null (default)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
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

})

describe('ae-negative-56-purchase', () => {
  const { sessions, ok, save, make, finish, transition, legalRounds } = audit56Purchase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C160 N1 real latest round-one Sheep Market then naturally revealed round-two Fencing each give one grain before their action',()=>{const s=make('C160_Outrider',st=>{st.roundActionOrder=[...legalRounds];st.players[0]!.resources.wood=4;st.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=1},true,1),first=finish(s,ok(s.takeAction(0,'sheep-market')));assert.equal(first.state.players[0]!.resources.grain,1);assert.equal(first.state.players[0]!.resources.sheep,1);const two=transition(s,2),p=ok(s.takeAction(0,'fencing'));assert.equal(p.state.players[0]!.resources.grain,two.state.players[0]!.resources.grain+1);const r=finish(s,ok(s.commitSelectionChoice(0,{edges:['H-0-1','H-1-1','V-0-1','V-0-2'],palisadeEdges:[]})));assert.equal(r.state.players[0]!.fenceSegments.length,4);save('C160-N1',{first,two,p,r})})
  it('C160 N2 base action opponent most recent card and hand-only use cannot grant owner an extra grain',()=>{for(const mode of['base','opponent','hand']){const actor=mode==='opponent'?1:0,s=make('C160_Outrider',st=>{st.currentPlayerIndex=actor;st.roundActionOrder=[...legalRounds];st.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=1},mode!=='hand',1),r=finish(s,ok(s.takeAction(actor,mode==='base'?'grain-seeds':'sheep-market')));assert.equal(r.state.players[0]!.resources.grain,mode==='base'?1:0);save(`C160-N2-${mode}`,r)}})
})
