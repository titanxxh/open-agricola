import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { computeScores } from '../../shared/domain/scoring'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C030_HalfTimberedHouse'
import '../../shared/cards/D/D034_LuxuriousHostel'

const CARD_ID = 'C030_HalfTimberedHouse'
const HOSTEL_ID = 'D034_LuxuriousHostel'
const FILLER = '__test_placeholder__'

type SetupOptions = {
  played?: boolean
  wood?: number
  clay?: number
  reed?: number
  stone?: number
  houseType?: 'wood' | 'clay' | 'stone'
  rooms?: number
  luxuriousHostel?: boolean
}

const setup = ({
  played = false, wood = 1, clay = 1, reed = 1, stone = 2,
  houseType = 'stone', rooms = 3, luxuriousHostel = false,
}: SetupOptions = {}) => {
  const session = new GameSession(5030, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  if (luxuriousHostel) player.minorPlayed.push(HOSTEL_ID)
  player.resources = { ...player.resources, wood, clay, reed, stone }
  player.houseType = houseType
  player.rooms = rooms
  player.roomTiles = Array.from({ length: rooms }, (_, col) => ({ row: 0, col }))
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

const bonusScore = (response: SessionResponse, cardId: string) => {
  const player = response.state.players[0]!
  const score = computeScores(response.state).find((summary) => summary.playerId === player.id)!
  const category = score.categories.find((entry) => entry.key === 'cardBonusVp')
  return category?.entries.find((entry) => 'cardId' in entry && entry.cardId === cardId)?.score ?? 0
}

describe('C030 Half-Timbered House parity', () => {
  it('C030 S1: paying one wood, clay, reed, and two stone plays Half-Timbered House', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
  })

  it('C030 S2: lacking one required stone keeps Half-Timbered House unavailable', () => {
    const response = enterMinor(setup({ stone: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, reed: 1, stone: 1 })
  })

  it('C030 S3: a three-room stone house scores three bonus points', () => {
    const response = setup({ played: true }).getState()

    expect(bonusScore(response, CARD_ID)).toBe(3)
  })

  it('C030 S4: a non-stone house scores no Half-Timbered House bonus', () => {
    const response = setup({ played: true, houseType: 'clay' }).getState()

    expect(bonusScore(response, CARD_ID)).toBe(0)
  })

  it('C030 S5: only the higher stone-house bonus scores when Luxurious Hostel is worth four', () => {
    const response = setup({ played: true, rooms: 3, luxuriousHostel: true }).getState()

    expect(bonusScore(response, CARD_ID)).toBe(0)
    expect(bonusScore(response, HOSTEL_ID)).toBe(4)
  })

  it('C030 S6: Half-Timbered House wins the stone-house bonus when five rooms beat Hostel', () => {
    const response = setup({ played: true, rooms: 5, luxuriousHostel: true }).getState()

    expect(bonusScore(response, CARD_ID)).toBe(5)
    expect(bonusScore(response, HOSTEL_ID)).toBe(0)
  })

  it('C030 S7: tied four-point stone-house bonuses count only Half-Timbered House', () => {
    const response = setup({ played: true, rooms: 4, luxuriousHostel: true }).getState()

    expect(bonusScore(response, CARD_ID)).toBe(4)
    expect(bonusScore(response, HOSTEL_ID)).toBe(0)
  })
})
