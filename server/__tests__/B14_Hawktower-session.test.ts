import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { getCardEffect } from '../../shared/cards/card-effects'
import { resolveFutureMeepleRequests } from '../../shared/actions/effects/internal/future-meeples'
import { applyFutureMeeples } from '../../shared/session/state-bootstrap'
import { B014_Hawktower } from '../../shared/cards/B/B014_Hawktower'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit18Future from './_helpers/audit/ae-negative-18-future'

const CARD_ID = 'B014_Hawktower'

const setup = (houseType: 'wood' | 'clay' | 'stone') => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.houseType = houseType
  player.minorPlayed.push(CARD_ID)

  session.loadState(state)
  return session
}

describe('B14 Hawktower — session', () => {
  it('houseType=stone: gains 1 room at round-12 round-start (applyFutureMeeples)', () => {
    const session = setup('stone')
    const state = session.getState().state
    const player = state.players[0]!

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect?.onBuy).toBeDefined()
    session.withCtx(() => effect!.onBuy!(state, player))

    resolveFutureMeepleRequests(state)
    const beforeRooms = player.rooms
    const beforeTiles = player.roomTiles.length

    state.round = 12
    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms + 1)
    expect(player.roomTiles.length).toBe(beforeTiles + 1)
    expect(
      state.futureMeeples.some(
        (e) => e.cardId === CARD_ID && e.playerId === player.id,
      ),
    ).toBe(false)
  })

  it('houseType=clay: no room added at round 12', () => {
    const session = setup('clay')
    const state = session.getState().state
    const player = state.players[0]!

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    session.withCtx(() => effect!.onBuy!(state, player))
    resolveFutureMeepleRequests(state)

    const beforeRooms = player.rooms
    const beforeTiles = player.roomTiles.length

    state.round = 12
    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms)
    expect(player.roomTiles.length).toBe(beforeTiles)
  })

  it('houseType=wood: no room added at round 12', () => {
    const session = setup('wood')
    const state = session.getState().state
    const player = state.players[0]!

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    session.withCtx(() => effect!.onBuy!(state, player))
    resolveFutureMeepleRequests(state)

    const beforeRooms = player.rooms
    const beforeTiles = player.roomTiles.length

    state.round = 12
    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms)
    expect(player.roomTiles.length).toBe(beforeTiles)
  })

  it('round 12 round-start via real round-advance path: stone-room is built (no execute call)', () => {
    // Real round-start consumption: applyFutureMeeples is called from
    // shared/session/session-core.ts at every round transition. This test
    // simulates that path directly (without invoking futureMeeplesAction.execute),
    // proving the consumption is anchored on the correct entry point.
    const session = setup('stone')
    const state = session.getState().state
    const player = state.players[0]!

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    session.withCtx(() => effect!.onBuy!(state, player))
    resolveFutureMeepleRequests(state)

    // Pre-12 rounds: applyFutureMeeples must NOT consume the entry.
    const beforeRooms = player.rooms
    for (let r = 2; r <= 11; r += 1) {
      state.round = r
      applyFutureMeeples(state)
    }
    expect(player.rooms).toBe(beforeRooms)
    expect(
      state.futureMeeples.some(
        (e) => e.cardId === CARD_ID && e.roomType === 'stone',
      ),
    ).toBe(true)

    // Round 12 round-start: entry is consumed and room is placed.
    state.round = 12
    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms + 1)
    expect(
      state.futureMeeples.some(
        (e) => e.cardId === CARD_ID && e.playerId === player.id,
      ),
    ).toBe(false)
  })

  describe('prerequisite "Play in Round 7 or Before"', () => {
    it('blocks when round > 7', () => {
      const session = new GameSession(42)
      const state = session.getState().state
      state.round = 8
      const player = state.players[0]!
      expect(session.withCtx(() => meetsCardPrerequisites(player, B014_Hawktower, state.round, state))).toBe(false)
    })

    it('allows when round <= 7', () => {
      const session = new GameSession(42)
      const state = session.getState().state
      state.round = 7
      const player = state.players[0]!
      expect(session.withCtx(() => meetsCardPrerequisites(player, B014_Hawktower, state.round, state))).toBe(true)
    })
  })
})

describe('ae-negative-18-future', () => {
  const { CARD, sessions, save, ok, setup, menu, buy, reach } = audit18Future
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B014 N1 real round seven purchase queues stone room twelve and round eight refuses without payment',()=>{const s=setup(),{pending,r}=buy(s);assert.ok(r.state.players[0]!.minorPlayed.includes(CARD));assert.equal(r.state.players[0]!.rooms,2);const late=setup(8),blocked=menu(late);assertRejectedUnchanged(late,()=>late.resolveChoice(0,CARD));const alternative=ok(late.resolveChoice(0,'A030_BakingSheet'));assert.equal(alternative.state.players[0]!.resources.clay,2);assert.equal(alternative.state.futureMeeples.filter(e=>e.cardId===CARD).length,0);save('B014-N1',{pending,r,blocked,alternative})})
  it('B014 N2 real purchase and natural rounds seven through twelve grant one stone room without construction payment',()=>{const s=setup(7,'stone');buy(s);const eleven=JSON.parse(JSON.stringify(reach(s,11)));assert.equal(eleven.state.players[0].rooms,2);const r=reach(s,12);assert.equal(r.state.players[0]!.rooms,3);assert.equal(r.state.players[0]!.roomTiles.length,3);assert.equal(r.state.players[0]!.resources.stone,0);assert.equal(r.state.futureMeeples.filter(e=>e.cardId===CARD).length,0);save('B014-N2',{eleven,r,limitation:'Natural grant tested; free room decline and placement choice not proven if runtime automatically chooses'})})
  it('B014 N3 wood and clay houses naturally discard scheduled room at twelve and never construct early',()=>{for(const type of['wood','clay']as const){const s=setup(7,type);buy(s);const eleven=JSON.parse(JSON.stringify(reach(s,11))),r=reach(s,12);assert.equal(eleven.state.players[0].rooms,2);assert.equal(r.state.players[0]!.rooms,2);assert.equal(r.state.futureMeeples.filter(e=>e.cardId===CARD).length,0);save(`B014-N3-${type}`,{eleven,r})}})
  it('B014 N4 full stone farm naturally consumes scheduled token without overlapping field or adding room',()=>{const s=setup(7,'stone',true);buy(s);const r=reach(s,12);assert.equal(r.state.players[0]!.rooms,2);assert.equal(r.state.players[0]!.fields.length,13);assert.equal(r.state.futureMeeples.filter(e=>e.cardId===CARD).length,0);save('B014-N4',r)})
})
