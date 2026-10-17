import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { B023_FinalScenario } from '../../shared/cards/B/B023_FinalScenario'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { setWorkersAtHome } from '../../shared/domain/player'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit19Placement from './_helpers/audit/ae-negative-19-placement'

describe('B023_FinalScenario prerequisite', () => {
  it('blocks when round == 14', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 14
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, B023_FinalScenario, state.round, state))).toBe(false)
  })

  it('allows when round <= 13', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 13
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, B023_FinalScenario, state.round, state))).toBe(true)
  })

  it('sets exclusiveUse on the round 14 action space and gates non-owner placement', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 13
    const owner = state.players[0]!
    const other = state.players[1]!
    owner.resources.clay = owner.rooms + 5
    owner.resources.reed = 5
    owner.minorHand = ['B023_FinalScenario']
    session.loadState(state)

    session.devPlayCard(0, 'B023_FinalScenario')
    const afterBuy = session.getState().state
    const round14Id = afterBuy.roundActionOrder[13]!
    const space = afterBuy.actionSpaces.find((entry) => entry.id === round14Id)!

    expect(space.exclusiveUse).toEqual({
      playerId: owner.id,
      sourceCardId: 'B023_FinalScenario',
      untilRound: 14,
    })
    expect(session.getActionAvailability(0)[round14Id]).toBe(true)
    expect(session.getActionAvailability(1)[round14Id]).toBe(false)
    afterBuy.currentPlayerIndex = 1
    session.loadState(afterBuy)
    const blocked = session.takeAction(1, round14Id)
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toBe('space unavailable')
    afterBuy.currentPlayerIndex = 0
    session.loadState(afterBuy)
    const ownerAction = session.takeAction(0, round14Id)
    expect(ownerAction.ok).toBe(true)
    expect(afterBuy.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'action.revealed',
        actionId: round14Id,
        roundSlot: 14,
        sourceCardId: 'B023_FinalScenario',
      }),
      expect.objectContaining({
        type: 'action.exclusiveUseSet',
        actionId: round14Id,
        playerId: owner.id,
        untilRound: 14,
      }),
    ]))
    expect(other.id).not.toBe(owner.id)
  })

  it('clears exclusiveUse at round 14 start and emits clear event', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 13
    state.players[0]!.minorHand = ['B023_FinalScenario']
    session.loadState(state)
    session.devPlayCard(0, 'B023_FinalScenario')
    const ready = session.getState().state
    ready.players.forEach((player) => setWorkersAtHome(ready, player, 0))
    session.loadState(ready)
    const resp = session.performRoundEnd()
    const round14Id = resp.state.roundActionOrder[13]!
    const space = resp.state.actionSpaces.find((entry) => entry.id === round14Id)!
    expect(space.exclusiveUse).toBeUndefined()
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'action.exclusiveUseCleared', actionId: round14Id }),
    ]))
    const revealEvents = resp.state.events.filter((event) =>
      event.type === 'action.revealed' &&
      event.actionId === round14Id &&
      event.roundSlot === 14)
    expect(revealEvents).toHaveLength(1)
  })
})

describe('ae-negative-19-placement', () => {
  const { FINAL, sessions, save, ok, setup, ready, turn, finish, menu, buy, reach } = audit19Placement
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B023 N1 real round thirteen purchase reveals actual hidden round fourteen card exclusively and rejects opponent use',()=>{const s=setup(FINAL,13),last=s.state.roundActionOrder[13]!,before=s.getState();assert.equal(s.getActionAvailability(0)[last],false);const{pending,r}=buy(s,FINAL),space=r.state.actionSpaces.find(a=>a.id===last)!;assert.ok(r.state.events.some(e=>e.type==='action.revealed'&&e.actionId===last&&e.roundSlot===14));assert.deepEqual(space.exclusiveUse,{playerId:r.state.players[0]!.id,sourceCardId:FINAL,untilRound:14});assert.equal(s.getActionAvailability(1)[last],false);ready(s);assertRejectedUnchanged(s,()=>s.takeAction(1,last));const other=turn(s,1,'grain-seeds'),owner=finish(s,turn(s,0,last));assert.ok(owner.state.actionSpaces.find(a=>a.id===last)!.takenBy.some(w=>w.playerId===owner.state.players[0]!.id));save('B023-N1',{before,pending,r,other,owner})})
  it('B023 N2 natural round fourteen removes exclusivity so either player can use the revealed action',()=>{const s=setup(FINAL,13),last=s.state.roundActionOrder[13]!;buy(s,FINAL);const r=reach(s,14);assert.equal(r.state.actionSpaces.find(a=>a.id===last)!.exclusiveUse,undefined);assert.equal(s.getActionAvailability(0)[last],true);assert.equal(s.getActionAvailability(1)[last],true);assert.ok(r.state.events.some(e=>e.type==='action.exclusiveUseCleared'&&e.actionId===last));save('B023-N2',r)})
  it('B023 N3 round fourteen cannot purchase and card in hand never reveals or unlocks future action',()=>{const late=setup(FINAL,14),denied=menu(late);assertRejectedUnchanged(late,()=>late.resolveChoice(0,FINAL));const legal=ok(late.resolveChoice(0,'A030_BakingSheet'));const hand=setup(FINAL,13),last=hand.state.roundActionOrder[13]!;assert.equal(hand.getActionAvailability(0)[last],false);assert.equal(hand.getActionAvailability(1)[last],false);const control=turn(hand,0,'grain-seeds');assert.ok(!control.state.events.some(e=>e.type==='action.revealed'&&e.actionId===last));save('B023-N3',{denied,legal,control})})
  it('B023 N4 whole actual purchase undo hides only revealed future action and retry restores exact exclusivity',()=>{const s=setup(FINAL,13),last=s.state.roundActionOrder[13]!,r=buy(s,FINAL).r,undone=ok(s.undoAction());assert.equal(s.getActionAvailability(0)[last],false);assert.equal(undone.state.actionSpaces.find(a=>a.id===last)!.exclusiveUse,undefined);assert.ok(undone.state.players[0]!.minorHand.includes(FINAL));const retry=buy(s,FINAL).r;assert.equal(retry.state.actionSpaces.find(a=>a.id===last)!.exclusiveUse?.playerId,retry.state.players[0]!.id);save('B023-N4',{r,undone,retry})})
})
