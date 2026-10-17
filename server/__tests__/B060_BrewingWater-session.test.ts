import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import assert from 'node:assert/strict'
import * as audit21Brewing from './_helpers/audit/ae-negative-21-brewing'

const CARD_ID = 'B060_BrewingWater'

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.players[0]!.minorPlayed.push(CARD_ID)
  state.players[0]!.resources.grain = 1
  state.actionSpaces.find((space) => space.id === 'fishing')!.takenBy = []
  session.loadState(state)
  return session
}

const futureEntries = (session: GameSession) =>
  session.getState().state.futureMeeples.filter((entry) => entry.cardId === CARD_ID)

describe('B060 Brewing Water session', () => {
  it('does not queue future food when the optional payment is skipped', () => {
    const session = setup()
    let resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.pendingFutureMeeples).toEqual([])
    expect(futureEntries(session)).toEqual([])
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.pendingFutureMeeples).toEqual([])
    expect(futureEntries(session)).toEqual([])
  })

  it('queues six rounds of food only after the payment is accepted', () => {
    const session = setup()
    let resp = session.takeAction(0, 'fishing')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
      const payment = resp.interaction.request.options?.[0]
      expect(payment).toBeDefined()
      resp = session.resolveChoice(0, payment!.value)
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(futureEntries(session)).toHaveLength(6)
    expect(futureEntries(session).map((entry) => entry.round)).toEqual([5, 6, 7, 8, 9, 10])
  })
})

describe('ae-negative-21-brewing', () => {
  const { CARD, sessions, save, ok, setup, ready, finish, buy, schedule, reach, use, ownerUse } = audit21Brewing
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B060 N1 actual free purchase creates no queue and Fishing pays exactly one grain for six future food',()=>{const s=setup(CARD,5,state=>state.players[0]!.resources.grain=1),{pending,r}=buy(s,CARD);assert.equal(schedule(r,CARD).length,0);assert.equal(r.state.players[0]!.resources.grain,1);const before=ownerUse(s,'fishing');assert.equal(before.r.state.players[0]!.resources.grain,0);assert.deepEqual(schedule(before.r,CARD),[6,7,8,9,10,11].map(round=>({round,resources:{food:1}})));save('B060-N1',{pending,purchase:r,first:before})})
  it('B060 N2 decline missing grain hand opponent and unrelated action never charge grain or schedule food',()=>{for(const mode of['decline','missing','hand','opponent','reed']){const s=setup(CARD,5,state=>state.players[0]!.resources.grain=mode==='missing'?0:1);buy(s,mode==='hand'?'B004_WoodPile':CARD);let before:SessionResponse,r:SessionResponse;if(mode==='opponent'){before=ready(s);r=finish(s,ok(s.takeAction(1,'fishing')))}else{use(s,1,'day-laborer');before=ready(s);r=finish(s,ok(s.takeAction(0,mode==='reed'?'reed-bank':'fishing')),mode!=='decline')}assert.equal(schedule(r,CARD).length,0);assert.equal(r.state.players[0]!.resources.grain,before.state.players[0]!.resources.grain);save(`B060-N2-${mode}`,{before,r})}})
  it('B060 N3 late optional payment retains only actual future targets without granting current round food',()=>{for(const round of[12,13,14]){const s=setup(CARD,round,state=>state.players[0]!.resources.grain=1);buy(s,CARD);const{before,r}=ownerUse(s,'fishing');assert.deepEqual(schedule(r,CARD).map(e=>e.round),[1,2,3,4,5,6].map(n=>round+n).filter(n=>n<=14));assert.equal(r.state.players[0]!.resources.grain,0);save(`B060-N3-${round}`,{before,r})}})
  it('B060 N4 natural next two rounds deliver food only to owner with matching Fishing and filler controls',()=>{const s=setup(CARD,5,state=>state.players[0]!.resources.grain=1),c=setup(CARD,5,state=>state.players[0]!.resources.grain=1);buy(s,CARD);buy(c,'B004_WoodPile');const first=ownerUse(s,'fishing'),control=ownerUse(c,'fishing');assert.equal(first.r.state.players[0]!.resources.food,control.r.state.players[0]!.resources.food);const six=reach(s,6),csix=reach(c,6),seven=reach(s,7),cseven=reach(c,7);assert.equal(six.state.players[0]!.resources.food,csix.state.players[0]!.resources.food+1);assert.equal(seven.state.players[0]!.resources.food,cseven.state.players[0]!.resources.food+2);assert.equal(seven.state.players[1]!.resources.food,cseven.state.players[1]!.resources.food);assert.deepEqual(schedule(seven,CARD).map(e=>e.round),[8,9,10,11]);save('B060-N4',{first,control,six,csix,seven,cseven})})
  it('B060 N5 whole Fishing undo restores paid grain collected pile and empty queue before single replay',()=>{const s=setup(CARD,5,state=>state.players[0]!.resources.grain=1);buy(s,CARD);const{before,r}=ownerUse(s,'fishing'),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.grain,1);assert.equal(undone.state.players[0]!.resources.food,before.state.players[0]!.resources.food);assert.equal(schedule(undone,CARD).length,0);assert.deepEqual(undone.state.actionSpaces.find(a=>a.id==='fishing')!.resources,before.state.actionSpaces.find(a=>a.id==='fishing')!.resources);const retry=use(s,0,'fishing').r;assert.equal(retry.state.players[0]!.resources.grain,0);assert.equal(schedule(retry,CARD).length,6);save('B060-N5',{before,r,undone,retry})})
})
