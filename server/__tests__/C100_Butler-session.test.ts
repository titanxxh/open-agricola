import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C100_Butler'
import assert from 'node:assert/strict'
import * as audit46Scoring from './_helpers/audit/ae-negative-46-scoring'

const CARD_ID = 'C100_Butler'
const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = (round: number) => {
  const session = new GameSession(7100 + round, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.gameOver = round > 14
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 5, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID]
  owner.rooms = 3
  owner.roomTiles = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
  ]
  session.loadState(state)
  return session
}

const playButler = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons-3')
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)
    && response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const butlerBonus = (response: SessionResponse) => response.scores[0]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries
  .find((entry) => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0

describe('C100 Butler timing and scoring', () => {
  it.each([1, 11])('records an on-time round %i play and awards four points', (round) => {
    const response = playButler(setup(round))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'playedRound')).toBe(round)
    expect(butlerBonus(response)).toBe(4)
  })

  it.each([12, 13, 14])('allows a late round %i play without the four-point reward', (round) => {
    const response = playButler(setup(round))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'playedRound')).toBe(round)
    expect(butlerBonus(response)).toBe(0)
  })

  it('preserves the recorded play round through snapshot restore and repeated scoring', () => {
    const session = setup(11)
    const played = playButler(session)
    const snapshot = serializeSessionSnapshot(played.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    const restoredScores = restored.getState().scores

    expect(readCardExtraData<number>(restored.state.players[0]!, CARD_ID, 'playedRound')).toBe(11)
    expect(butlerBonus(restored.getState())).toBe(4)
    expect(restoredScores).toEqual(played.scores)
    expect(restored.getState().scores).toEqual(restoredScores)
    expect(restored.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('rejects play after the game has ended', () => {
    const session = setup(15)
    const before = JSON.stringify(session.getState().state.players[0])

    const response = session.takeAction(0, 'lessons')

    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state.players[0])).toBe(before)
    expect(response.state.players[0]!.occupationHand).toContain(CARD_ID)
  })
})

describe('ae-negative-46-scoring', () => {
  const { BUTLER, sessions, save, ok, make, finish, lesson, bonus, rooms, ownerReady } = audit46Scoring
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C100 N1 actual round eleven Butler purchase requires strictly more real rooms than family while round twelve is too late',()=>{for(const[round,count,expected]of[[11,2,0],[11,3,4],[12,3,0]] as const){const s=make(BUTLER,false,state=>{state.round=round;rooms(state,count)}),r=lesson(s,BUTLER);assert.equal(bonus(r,BUTLER),expected);assert.equal(r.state.players[0]!.cardStates[BUTLER]?.extraData?.playedRound,round);assert.equal(bonus(r,BUTLER,1),0);save(`C100-N1-${round}-${count}`,r)}})
  it('C100 N2 real later family growth removes the eligible four points without changing the recorded purchase round',()=>{const s=make(BUTLER,false,state=>{state.round=11;rooms(state,3)}),bought=lesson(s,BUTLER);ownerReady(s);const grown=finish(s,ok(s.takeAction(0,'wish-children')));assert.equal(bonus(bought,BUTLER),4);assert.equal(bonus(grown,BUTLER),0);assert.equal(grown.state.players[0]!.workers.filter(w=>w.isActive).length,3);assert.equal(grown.state.players[0]!.cardStates[BUTLER]?.extraData?.playedRound,11);save('C100-N2',{bought,grown})})
  it('C100 N3 holding Butler and whole real Lessons undo yield zero before exactly one legal replay',()=>{const s=make(BUTLER,false,state=>{state.round=11;rooms(state,3)}),hand=ok(s.getState());assert.equal(bonus(hand,BUTLER),0);const a=lesson(s,BUTLER),u=ok(s.undoAction());assert.equal(bonus(u,BUTLER),0);assert.ok(u.state.players[0]!.occupationHand.includes(BUTLER));const r=lesson(s,BUTLER);assert.equal(bonus(r,BUTLER),4);save('C100-N3',{hand,a,u,r})})
})
