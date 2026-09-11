import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C100_Butler'

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
