import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { setFencesForTest, setPalisadesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'

import '../../shared/cards/B/B119_Lumberjack'
import assert from 'node:assert/strict'
import * as audit27Lumber from './_helpers/audit/ae-negative-27-lumber'

describe('B119 Lumberjack — session regression (palisades excluded)', () => {
  it('queues future wood meeples only for fences, not palisades', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    setFencesForTest(player, 3)
    setPalisadesForTest(player, 2)
    session.loadState(state)

    const workingState = session.getState().state
    const workingPlayer = workingState.players[0]!
    const effect = session.withCtx(() => getCardEffect('B119_Lumberjack'))!
    session.withCtx(() => effect.onBuy!(workingState, workingPlayer))

    // onBuy calls queueFutureMeeplesFlow → pushes request into pendingFutureMeeples.
    const pendingForCard = workingState.pendingFutureMeeples.filter(
      (m: { cardId?: string }) => m.cardId === 'B119_Lumberjack',
    )
    // 3 fence segments → count 3; 2 palisades ignored.
    expect(pendingForCard).toHaveLength(1)
    expect(pendingForCard[0]!.count).toBe(3)
  })
})

describe('ae-negative-27-lumber', () => {
  const { CARD, sessions, save, ok, finish, make, future, lesson, next } = audit27Lumber
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B119 N1 real first Lessons gains one immediate wood and schedules one wood per built fence clipped to remaining rounds',()=>{for(const[count,round]of[[0,8],[4,8],[7,8],[4,13],[4,14]]){const s=make(count,round),before=ok(s.getState()),a=lesson(s),entries=future(a.r);assert.equal(a.r.state.players[0]!.resources.wood,1);assert.equal(entries.length,Math.min(count,14-round));assert.deepEqual(entries.map(e=>e.round),Array.from({length:Math.min(count,14-round)},(_,i)=>round+i+1));assert.ok(entries.every(e=>e.resources?.wood===1));assert.deepEqual(a.r.state.players[0]!.fenceSegments,before.state.players[0]!.fenceSegments);assert.equal(a.r.state.players[1]!.resources.wood,0);save(`B119-N1-${count}-${round}`,{before,a,entries})}})
  it('B119 N2 natural next round receives exactly one scheduled wood and leaves the remaining three future rounds',()=>{const s=make(),a=lesson(s),r=next(s,9);assert.equal(r.state.players[0]!.resources.wood,2);assert.deepEqual(future(r).map(e=>e.round),[10,11,12]);assert.equal(r.state.players[0]!.fenceSegments.length,4);save('B119-N2',{a,r})})
  it('B119 N3 card in hand and unrelated real action never gain immediate wood or schedule any promised wood',()=>{const s=make(),r=finish(s,ok(s.takeAction(0,'grain-seeds')),false);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(future(r).length,0);assert.ok(r.state.players[0]!.occupationHand.includes(CARD));assert.equal(r.state.players[0]!.fenceSegments.length,4);save('B119-N3',r)})
  it('B119 N4 whole real Lessons undo removes immediate wood and schedule while preserving fences before exactly one replay',()=>{const s=make(),before=ok(s.getState()),a=lesson(s),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert.equal(future(undone).length,0);assert.ok(undone.state.players[0]!.occupationHand.includes(CARD));assert.deepEqual(undone.state.players[0]!.fenceSegments,before.state.players[0]!.fenceSegments);const retry=lesson(s);assert.equal(retry.r.state.players[0]!.resources.wood,1);assert.equal(future(retry.r).length,4);save('B119-N4',{before,a,undone,retry})})
})
