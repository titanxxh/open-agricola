import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B120_Sweep'
import assert from 'node:assert/strict'
import * as audit27Sweep from './_helpers/audit/ae-negative-27-sweep'

const CARD_ID = 'B120_Sweep'

describe('B120_Sweep session', () => {
  const setup = (round: number) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players[1]!.workersAvailable = 2

    session.loadState(state)
    return session
  }

  it('gains 2 clay when using day-laborer in round 12 (fixed mapping)', () => {
    const session = setup(12)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    // Sweep adds 2 clay
    expect(after.resources.clay).toBe(before + 2)
  })

  it('gains 2 clay when using fishing in round 13 (fixed mapping)', () => {
    const session = setup(13)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 2)
  })

  it('does not trigger in round 1 (no above-space mapping)', () => {
    const session = setup(1)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before)
  })

  it('does not trigger for non-matching space in round 12', () => {
    const session = setup(12)
    const before = session.getState().state.players[0]!.resources.clay
    // In round 12 "above" = day-laborer, so using fishing must not trigger
    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before)
  })
})

describe('ae-negative-27-sweep', () => {
  const { sessions, save, ok, make, use } = audit27Sweep
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B120 N1 round twelve Day Laborer and round thirteen Fishing grant exactly two clay before the basic reward',()=>{for(const[round,id]of[[12,'day-laborer'],[13,'fishing']]as const){const s=make(round),c=make(round,false),r=use(s,id),control=use(c,id);assert.equal(r.state.players[0]!.resources.clay,2);assert.equal(r.state.players[0]!.resources.food,control.state.players[0]!.resources.food);assert.equal(r.state.players[1]!.resources.clay,0);save(`B120-N1-${round}`,{r,control})}})
  it('B120 N2 each of the first four rounds and a nonmatching basic space grant no clay',()=>{for(const round of[1,2,3,4,12,13]){const id=round===13?'day-laborer':'fishing',r=use(make(round),id);assert.equal(r.state.players[0]!.resources.clay,0);save(`B120-N2-${round}`,{id,r})}})
  it('B120 N3 actual opponent qualifying placement and owner card only in hand gain no clay bonus',()=>{const s=make(12),c=make(12,false);use(s,'grain-seeds');use(c,'grain-seeds');const r=use(s,'day-laborer',1),control=use(c,'day-laborer',1);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[1]!.resources.clay,control.state.players[1]!.resources.clay);const hand=use(make(12,false),'day-laborer');assert.equal(hand.state.players[0]!.resources.clay,0);save('B120-N3',{r,control,hand})})
  it('B120 N4 whole qualifying action undo restores clay food workers and occupancy before exactly one replay',()=>{const s=make(12),before=ok(s.getState()),r=use(s,'day-laborer'),undone=ok(s.undoAction());assert.deepEqual(undone.state.players[0]!.resources,before.state.players[0]!.resources);assert.deepEqual(undone.state.actionSpaces,before.state.actionSpaces);const retry=use(s,'day-laborer');assert.equal(retry.state.players[0]!.resources.clay,2);assert.equal(retry.state.players[0]!.resources.food,r.state.players[0]!.resources.food);save('B120-N4',{before,r,undone,retry})})
})
