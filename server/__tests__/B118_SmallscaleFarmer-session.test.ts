import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B118_SmallscaleFarmer'
import assert from 'node:assert/strict'
import * as audit27Endphase from './_helpers/audit/ae-negative-27-endphase'

const CARD_ID = 'B118_SmallscaleFarmer'

const setup = (roomCount = 2, inHand = false) => {
  const session = new GameSession(118, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player) => setWorkersAtHome(state, player, 2))
  const player = state.players[0]!
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources.wood = 0
  player.rooms = roomCount
  player.roomTiles = Array.from({ length: roomCount }, (_, col) => ({ row: 0, col }))
  session.loadState(state)
  return session
}

const finishRound = (session: GameSession) => {
  session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
  return session.performRoundEnd()
}

describe('B118 Small-scale Farmer parity', () => {
  it('B118 S1: playing Small-scale Farmer through Lessons keeps the occupation in play', () => {
    const response = setup(2, true).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B118 S2: exactly two house rooms grant one wood at the next round start', () => {
    const response = finishRound(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('B118 S3: three house rooms grant no wood at the next round start', () => {
    const response = finishRound(setup(3))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('B118 S4: two consecutive round starts each grant one wood', () => {
    const session = setup()

    expect(finishRound(session).ok).toBe(true)
    const response = finishRound(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })
})

describe('ae-negative-27-endphase', () => {
  const { SMALL, sessions, save, ok, finish, make, transition, lesson } = audit27Endphase
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B118 N1 natural next round grants one wood only for exactly two actual rooms',()=>{for(const rooms of[2,3,4]){const s=make(SMALL,true,0,2,1,rooms),c=make(SMALL,false,0,2,1,rooms),r=transition(s),control=transition(c);assert.equal(r.state.players[0]!.resources.wood,control.state.players[0]!.resources.wood+(rooms===2?1:0));assert.equal(r.state.players[0]!.roomTiles.length,rooms);save(`B118-N1-${rooms}`,{r,control})}})
  it('B118 N2 card only in hand with two rooms gains no round start wood',()=>{const s=make(SMALL,false),r=transition(s),c=transition(make(SMALL,false));assert.equal(r.state.players[0]!.resources.wood,c.state.players[0]!.resources.wood);assert.ok(r.state.players[0]!.occupationHand.includes(SMALL));save('B118-N2',{r,c})})
  it('B118 N3 real midround first Lessons and unrelated action never grant the next round wood early',()=>{const s=make(SMALL,false),a=lesson(s,SMALL);assert.equal(a.r.state.players[0]!.resources.wood,0);const other=make(SMALL),r=finish(other,ok(other.takeAction(0,'grain-seeds')),false);assert.equal(r.state.players[0]!.resources.wood,0);save('B118-N3',{a,r})})
  it('B118 N4 two consecutive natural round starts grant one wood each rather than repeating within a round',()=>{const s=make(SMALL),c=make(SMALL,false),r=transition(s),control=transition(c),after=transition(s,10),other=transition(c,10);assert.equal(r.state.players[0]!.resources.wood,control.state.players[0]!.resources.wood+1);assert.equal(after.state.players[0]!.resources.wood,other.state.players[0]!.resources.wood+2);save('B118-N4',{r,control,after,other})})
})
