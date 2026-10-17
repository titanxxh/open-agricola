import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B123_RoofBallaster'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit27Ballaster from './_helpers/audit/ae-negative-27-ballaster'

const CARD_ID = 'B123_RoofBallaster'
const FILLER = '__test_placeholder__'

const setup = ({ rooms = 2, food = 1 }: { rooms?: number; food?: number } = {}) => {
  const session = new GameSession(5423 + rooms, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  state.players[0]!.occupationHand = [CARD_ID]
  state.players[0]!.rooms = rooms
  state.players[0]!.resources.food = food
  state.players[0]!.resources.stone = 0
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  return response
}

const acceptExchange = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('B123 Roof Ballaster parity', () => {
  for (const [scenario, rooms] of [['S1', 2], ['S2', 4]] as const) {
    it(`B123 ${scenario}: paying one food on play gains one stone for each of ${rooms} rooms`, () => {
      const session = setup({ rooms })

      const response = acceptExchange(session, play(session))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.food).toBe(0)
      expect(response.state.players[0]!.resources.stone).toBe(rooms)
    })
  }

  it('B123 S3: declining the on-play exchange keeps the food and gains no stone', () => {
    const session = setup({ rooms: 4 })
    const played = play(session)
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(played.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, stone: 0 })
  })

  it('B123 S4: without food Roof Ballaster is still played but grants no stone', () => {
    const session = setup({ rooms: 4, food: 0 })
    let response = play(session)
    if (response.interaction.stateId === 'wait' &&
      response.interaction.request.options?.some((option) => option.value === '__skip__')) {
      const options = response.interaction.request.options ?? []
      expect(options.every((option) => option.value === '__skip__')).toBe(true)
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 0 })
  })
})

describe('ae-negative-27-ballaster', () => {
  const { CARD, sessions, save, ok, ready, finish, make, lesson } = audit27Ballaster
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B123 N1 actual first Lessons optional one food total grants one stone per two three or five real rooms',()=>{for(const rooms of[2,3,5]){const s=make(rooms),a=lesson(s);assert.equal(a.r.state.players[0]!.resources.food,0);assert.equal(a.r.state.players[0]!.resources.stone,rooms);assert.equal(a.r.state.players[1]!.resources.stone,0);assert.equal(a.r.state.players[0]!.rooms,rooms);save(`B123-N1-${rooms}`,a)}})
  it('B123 N2 second occupation pays ordinary one food before one additional food buys room count stone',()=>{const s=make(3,2,false),a=lesson(s);assert.equal(a.r.state.players[0]!.resources.food,0);assert.equal(a.r.state.players[0]!.resources.stone,3);assert.equal(a.r.state.players[0]!.occupationPlayed.length,2);save('B123-N2',a)})
  it('B123 N3 optional decline zero remaining food hand only and opponent action cannot grant stone',()=>{for(const mode of['decline','food']){const s=make(2,mode==='food'?0:1),a=lesson(s,false);assert.equal(a.r.state.players[0]!.resources.food,mode==='food'?0:1);assert.equal(a.r.state.players[0]!.resources.stone,0);save(`B123-N3-${mode}`,a)}const s=make(),first=finish(s,ok(s.takeAction(0,'grain-seeds')),false);ready(s);const second=finish(s,ok(s.takeAction(1,'clay-pit')),false);assert.equal(second.state.players[0]!.resources.stone,0);assert.ok(second.state.players[0]!.occupationHand.includes(CARD));save('B123-N3-hand',{first,second})})
  it('B123 N4 unknown optional choice rejects before exact acceptance and whole Lessons undo restores food stone rooms and hand',()=>{const s=make(3),pending=ok(s.takeAction(0,'lessons')),chosen=ok(s.resolveChoice(0,CARD));assert.ok(chosen.interaction.stateId==='wait'&&chosen.interaction.request.kind==='choice');const error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'unknown-ballaster-choice')),r=finish(s,chosen,true),undone=ok(s.undoAction());assert.equal(r.state.players[0]!.resources.stone,3);assert.equal(undone.state.players[0]!.resources.stone,0);assert.equal(undone.state.players[0]!.resources.food,1);assert.equal(undone.state.players[0]!.rooms,3);assert.ok(undone.state.players[0]!.occupationHand.includes(CARD));const retry=lesson(s);assert.equal(retry.r.state.players[0]!.resources.stone,3);save('B123-N4',{pending,chosen,error,r,undone,retry})})
})
