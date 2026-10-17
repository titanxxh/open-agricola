import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/A/A145_Ropemaker'
import assert from 'node:assert/strict'
import * as audit16Phases from './_helpers/audit/ae-negative-16-phases'

const CARD_ID = 'A145_Ropemaker'

const setup = ({ round, inHand = false }: { round: number; inHand?: boolean }) => {
  const session = new GameSession(145, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, inHand && player === state.players[0] ? 2 : 0)
    player.resources.food = 8
  })
  const owner = state.players[0]!
  owner.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  owner.occupationPlayed = inHand ? [] : [CARD_ID]
  owner.resources.reed = 0
  if (!inHand) state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

describe('A145 Ropemaker parity', () => {
  it('A145 S1: playing Ropemaker in a four-player game keeps the occupation in play', () => {
    const response = playOccupation(setup({ round: 1, inHand: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A145 S2: the end of a harvest grants one reed', () => {
    const response = autoAdvanceRoundEnd(setup({ round: 4 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })

  it('A145 S3: a non-harvest round end grants no reed', () => {
    const response = autoAdvanceRoundEnd(setup({ round: 3 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(4)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  it('A145 S4: two harvests grant two reed cumulatively', () => {
    const session = setup({ round: 4 })
    let response = autoAdvanceRoundEnd(session)
    const state = response.state
    state.round = 7
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      player.resources.food = 8
      markAllWorkersUsed(state, player)
    })
    session.loadState(state)

    response = autoAdvanceRoundEnd(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(2)
  })
})

describe('ae-negative-16-phases', () => {
  const { ROPE, sessions, save, setup, end, ROPE_SIX } = audit16Phases
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A145 N1 first natural harvest adds one reed only after feeding while ordinary return home adds none',()=>{const harvest=end(setup(ROPE,4),ROPE_SIX).r;assert.equal(harvest.state.round,5);assert.equal(harvest.state.players[0]!.resources.reed,1);const ordinary=end(setup(ROPE,3),ROPE_SIX).r;assert.equal(ordinary.state.round,4);assert.equal(ordinary.state.players[0]!.resources.reed,0);save('A145-N1',{harvest,ordinary})})
  it('A145 N2 repeated natural harvest grants once each and hand cannot grant reed',()=>{const s=setup(ROPE,7);const first=end(s,ROPE_SIX).r;assert.equal(first.state.players[0]!.resources.reed,1);assert.equal(s.getState().state.players[0]!.resources.reed,1);const hand=end(setup(ROPE,4,undefined,false),ROPE_SIX).r;assert.equal(hand.state.players[0]!.resources.reed,0);save('A145-N2',{first,hand})})
})
