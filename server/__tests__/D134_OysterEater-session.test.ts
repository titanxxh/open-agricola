import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D134_OysterEater'
import type { SessionResponse } from '../../shared/session/session-core'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import * as audit52Actions from './_helpers/audit/ae-negative-52-actions'

describe('D134_OysterEater session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = createWorkSession({ seed: 134, options: { playerCount: 4 } })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = currentPlayerIndex
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }

    const owner = state.players[0]!
    owner.occupationPlayed.push('D134_OysterEater')

    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishingSpace) throw new Error('fishing space missing')
    fishingSpace.resources.food = 1

    session.loadState(state)
    return session
  }

  const drainPending = (session: GameSession, resp: SessionResponse) => {
    let safety = 25
    while (
      safety-- > 0 &&
      (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch' ||
        resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player')
    ) {
      resp =
        resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch'
          ? confirmPlayerSwitch(session)
          : confirmNextPlayer(session)
    }
    return resp
  }

  it('D134 S1 grants one bonus VP to the owner when an opponent fishes', () => {
    const session = setup(1)

    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.cardStates?.D134_OysterEater?.counters?.bonusVp).toBe(1)
  })

  it('D134 S2 grants one bonus VP to the owner when the owner fishes', () => {
    const session = setup(0)

    let resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.cardStates?.D134_OysterEater?.counters?.bonusVp).toBe(1)
  })

  it('records a skipNextPlacement flag after fishing trigger (before owner turn)', () => {
    const session = setup(1)

    const resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)
    // The flag is written by the increment-extra-data SE in the listener
    // chain, which runs before the engine yields control. Inspect state
    // immediately, without confirming the next-player transition (which
    // would consume the flag via onBeforePlayerTurn — see
    // D134_OysterEater-skip-deferred-session.test.ts).
    const after = session.getState().state
    const extra = after.players[0]!.cardStates?.D134_OysterEater?.extraData
    expect(extra?.skipNextPlacement).toBe(1)
  })

  it('D134 S3 does not trigger on non-Fishing actions', () => {
    const session = setup(1)

    let resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    const counter = after.players[0]!.cardStates?.D134_OysterEater?.counters?.bonusVp
    expect(counter ?? 0).toBe(0)
  })
})

describe('ae-negative-52-actions', () => {
  const { sessions, save, ok, finish, ready, action, lesson, progress, OYSTER, oyster, vp } = audit52Actions
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D134 N1 actual purchase has no early VP and owner Fishing skips one turn without spending the remaining adult which places later',()=>{const bought=lesson(oyster(false),OYSTER);assert.equal(vp(bought),0);const s=oyster(),fish=action(s,0,'fishing');assert.equal(vp(fish),1);action(s,1,'grain-seeds');action(s,2,'reed-bank');const skipped=ready(s);assert.equal(skipped.state.currentPlayerIndex,1);assert.equal(skipped.state.players[0]!.workers.filter(w=>w.isActive).length,2);action(s,1,'clay-pit');action(s,2,'forest');const before=ready(s);assert.equal(before.state.currentPlayerIndex,0);const late=action(s,0,'day-laborer');assert.equal(vp(late),1);assert.equal(late.state.actionSpaces.find(a=>a.id==='day-laborer')!.takenBy[0]!.playerId,late.state.players[0]!.id);save('D134-N1',{bought,fish,skipped,before,late})})
  it('D134 N2 actual opponent Fishing rewards its owner and whole Fishing undo removes the pending skip before exactly one replay',()=>{const s=oyster(),first=action(s,0,'grain-seeds');ready(s);const fish=finish(s,ok(s.takeAction(1,'fishing')));assert.equal(vp(fish),1);const u=ok(s.undoAction());assert.equal(vp(u),0);assert.equal(u.state.players[0]!.cardStates[OYSTER]?.extraData?.skipNextPlacement??0,0);const replay=action(s,1,'fishing');action(s,2,'reed-bank');const skipped=ready(s);assert.equal(skipped.state.currentPlayerIndex,1);action(s,1,'clay-pit');action(s,2,'forest');const late=action(s,0,'day-laborer');assert.equal(vp(late),1);save('D134-N2',{first,fish,u,replay,skipped,late})})
  it('D134 N3 unrelated actions and a held card do not score or skip and the next natural preparation never carries a Fishing skip',()=>{const s=oyster(),other=action(s,0,'grain-seeds');assert.equal(vp(other),0);const t=oyster(false),hand=action(t,0,'fishing');assert.equal(vp(hand),0);const q=oyster(),fish=action(q,0,'fishing'),six=progress(q,6);assert.equal(vp(six),1);assert.equal(six.state.players[0]!.cardStates[OYSTER]?.extraData?.skipNextPlacement,0);assert.equal(six.state.currentPlayerIndex,0);const legal=action(q,0,'grain-seeds');assert.equal(vp(legal),1);save('D134-N3',{other,hand,fish,six,legal})})
})
