import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C079_StoneCart'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit42Future from './_helpers/audit/ae-negative-42-future'

const CARD_ID = 'C079_StoneCart'
const FILLER = '__test_placeholder__'

const setup = ({ wood = 2, occupations = 2, round = 5 } = {}) => {
  const session = new GameSession(5079, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `STUB_OCC_${index}`)
  player.resources = {
    ...player.resources, wood, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
  }
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.stone ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.stone ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('C079 Stone Cart parity', () => {
  it('C079 S1: two occupations and two wood play Stone Cart and schedule stone on remaining even rounds', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response)).toEqual([6, 8, 10, 12, 14])
  })

  it('C079 S2: one occupation keeps Stone Cart unavailable without spending wood', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(futureRounds(response)).toEqual([])
  })

  it('C079 S3: a round-eleven play schedules stone only on rounds twelve and fourteen', () => {
    const response = play(setup({ round: 11 }))

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response)).toEqual([12, 14])
  })

  it('C079 S4: scheduled Stone Cart stone is received at the next even round start', () => {
    const session = setup()
    play(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(futureRounds(response)).toEqual([8, 10, 12, 14])
  })
})

describe('ae-negative-42-future', () => {
  const { sessions, ok, save, setup, finish, select, play, complete, occupations, future } = audit42Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C079 N1 actual wood and occupations purchase queues future even stone and natural six delivers once',()=>{const s=setup('C079_StoneCart',st=>{occupations(st,2);st.players[0]!.resources.wood=2},false,5),bought=play(s,'C079_StoneCart');assert.equal(bought.state.players[0]!.resources.wood,0);assert.equal(bought.state.players[0]!.resources.stone,0);assert.deepEqual(future(bought,'C079_StoneCart'),[6,8,10,12,14].map(round=>({round,resources:{stone:1}})));const r=complete(s,['clay-pit','grain-seeds','fishing']);assert.equal(r.state.round,6);assert.equal(r.state.players[0]!.resources.stone,1);save('C079-N1',{bought,r})})
  it('C079 N2 current even and last round are excluded while undo restores cost and future supply',()=>{for(const round of [6,14]){const s=setup('C079_StoneCart',st=>{occupations(st,2);st.players[0]!.resources.wood=2},false,round),r=play(s,'C079_StoneCart');assert.deepEqual(future(r,'C079_StoneCart'),(round===6?[8,10,12,14]:[]).map(round=>({round,resources:{stone:1}})));const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,2);assert.deepEqual(future(u,'C079_StoneCart'),[]);save(`C079-N2-${round}`,{r,u})}})
  it('C079 N3 missing occupation denies purchase before legal alternative and no stone is queued',()=>{const s=setup('C079_StoneCart',st=>{occupations(st,1);st.players[0]!.resources.wood=2;st.players[0]!.minorHand.push('A057_MilkingParlor','E080_RockGarden')},false,5),p=select(s,ok(s.takeAction(0,'meeting-place')),o=>o.value.startsWith('action-improvement-')),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'C079_StoneCart')),r=finish(s,select(s,p,o=>o.value==='A057_MilkingParlor'));assert.deepEqual(future(r,'C079_StoneCart'),[]);assert.equal(r.state.players[0]!.resources.stone,0);save('C079-N3',{p,bad,r})})
})
