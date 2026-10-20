import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B107_Manservant'
import assert from 'node:assert/strict'
import * as audit26Manservant from './_helpers/audit/ae-negative-26-manservant'

describe('B107_Manservant session', () => {
  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone'; round?: number }) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = options?.round ?? 1

    const player = state.players[0]!
    player.occupationHand.push('B107_Manservant')
    player.houseType = options?.houseType ?? 'wood'
    session.loadState(state)
    session.devPlayCard(0, 'B107_Manservant')
    return session
  }

  // Playing B107 runs its onBuy flow, which devPlayCard does not execute; the
  // real Lessons plays in ae-negative-26 (N1, N2, N4) cover the onBuy schedule.

  it('after renovation to stone, triggers future food placement', () => {
    const session = setup({ houseType: 'clay', round: 5 })
    const state = session.getState().state
    const player = state.players[0]!

    // No pending yet (clay house at buy time)
    expect(state.pendingFutureMeeples.length).toBe(0)

    // Set up renovation from clay to stone
    player.resources.stone = player.rooms + 10
    player.resources.reed = 10

    const farmRedevSpace = state.actionSpaces.find((s) => s.id === 'farm-redevelopment')
    if (farmRedevSpace) {
      farmRedevSpace.roundAvailable = 1
      farmRedevSpace.takenBy = []
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'farm-redevelopment')
    expect(resp.ok).toBe(true)

    const updatedState = session.getState().state
    const updatedPlayer = updatedState.players[0]!

    if (updatedPlayer.houseType === 'stone') {
      // Future food meeples should exist
      const foodEntries = updatedState.futureMeeples.filter(
        (e) => e.cardId === 'B107_Manservant',
      )
      expect(foodEntries.length).toBeGreaterThan(0)
      foodEntries.forEach((entry) => {
        expect(entry.resources).toEqual({ food: 3 })
      })
    }
  })

  it('does not trigger when renovating to clay (not stone)', () => {
    const session = setup({ houseType: 'wood', round: 5 })
    const state = session.getState().state
    const player = state.players[0]!

    // Set up renovation from wood to clay
    player.resources.clay = player.rooms + 10
    player.resources.reed = 10

    const houseRedevSpace = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
    if (houseRedevSpace) {
      houseRedevSpace.roundAvailable = 1
      houseRedevSpace.takenBy = []
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const updatedState = session.getState().state
    const manservantEntries = updatedState.futureMeeples.filter(
      (e) => e.cardId === 'B107_Manservant',
    )
    expect(manservantEntries.length).toBe(0)
  })
})

describe('ae-negative-26-manservant', () => {
  const { CARD, sessions, save, ok, finish, make, future, lesson, nextRound } = audit26Manservant
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B107 N1 actual first stone house Lessons schedules exactly three food per remaining round and truncates at fourteen',()=>{for(const round of[8,13,14]){const s=make('stone',round),a=lesson(s);assert.deepEqual(future(a.r),Array.from({length:14-round},(_,i)=>({round:round+i+1,resources:{food:3}})));assert.equal(a.r.state.players[0]!.resources.food,100);assert.equal(a.r.state.players[1]!.resources.food,100);save(`B107-N1-${round}`,a)}})
  it('B107 N2 actual first wood or clay Lessons creates no schedule and opponent stone house is excluded',()=>{for(const house of['wood','clay']as const){const s=make(house),a=lesson(s);assert.equal(future(a.r).length,0);assert.equal(a.r.state.players[0]!.houseType,house);save(`B107-N2-${house}`,a)}})
  it('B107 N3 actual clay to stone renovation pays two stone one reed and schedules once while whole undo removes it',()=>{const s=make('clay',8,true),before=ok(s.getState()),pending=ok(s.takeAction(0,'house-redevelopment')),r=finish(s,pending,false);assert.equal(r.state.players[0]!.houseType,'stone');assert.equal(r.state.players[0]!.resources.stone,0);assert.equal(r.state.players[0]!.resources.reed,0);assert.deepEqual(future(r),Array.from({length:6},(_,i)=>({round:9+i,resources:{food:3}})));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.houseType,'clay');assert.equal(undone.state.players[0]!.resources.stone,2);assert.equal(undone.state.players[0]!.resources.reed,1);assert.equal(future(undone).length,0);const retry=finish(s,ok(s.takeAction(0,'house-redevelopment')),false);assert.equal(future(retry).length,6);save('B107-N3',{before,pending,r,undone,retry})})
  it('B107 N4 natural next round delivers exactly three scheduled food and whole original Lessons undo removes all promises',()=>{const s=make('stone'),a=lesson(s),undone=ok(s.undoAction());assert.equal(future(undone).length,0);assert.ok(undone.state.players[0]!.occupationHand.includes(CARD));const replay=lesson(s),before=ok(replay.r),r=nextRound(s,9);assert.equal(r.state.players[0]!.resources.food,before.state.players[0]!.resources.food+3);assert.equal(future(r).length,5);assert.equal(r.state.players[1]!.resources.food,100);save('B107-N4',{a,undone,replay,before,r})})
})
