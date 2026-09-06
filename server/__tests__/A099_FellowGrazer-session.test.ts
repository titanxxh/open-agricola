import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { PlayerState } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A099_FellowGrazer'

const CARD_ID = 'A099_FellowGrazer'
const FILLER = '__test_placeholder__'

const pasture = (id: string, row: number, size: number): PlayerState['pastures'][number] => ({
  id,
  size,
  tiles: Array.from({ length: size }, (_, col) => ({ row, col })),
  stables: 0,
  animalType: null,
  animalCount: 0,
})

const setup = ({ played = true, pastureSizes = [] as number[] } = {}) => {
  const session = new GameSession(5099, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = 0
  owner.pastures = pastureSizes.map((size, index) => pasture(`p${index + 1}`, index, size))
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const bonusScore = (session: GameSession) =>
  session.getState().scores[0]!.categories
    .find((category) => category.key === 'cardBonusVp')
    ?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0

describe('A099 Fellow Grazer parity', () => {
  it('A099 S1: Fellow Grazer is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A099 S2: no pasture scores no Fellow Grazer bonus', () => {
    expect(bonusScore(setup())).toBe(0)
  })

  it('A099 S3: a two-space pasture is below the scoring threshold', () => {
    expect(bonusScore(setup({ pastureSizes: [2] }))).toBe(0)
  })

  it('A099 S4: one three-space pasture scores two bonus points', () => {
    expect(bonusScore(setup({ pastureSizes: [3] }))).toBe(2)
  })

  it('A099 S5: two qualifying pastures score four bonus points', () => {
    expect(bonusScore(setup({ pastureSizes: [3, 3] }))).toBe(4)
  })
})
