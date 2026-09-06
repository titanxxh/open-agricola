import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A012_DrinkingTrough'

const CARD_ID = 'A012_DrinkingTrough'
const FILLER = '__test_placeholder__'

const setup = ({
  size = 1,
  stables = 0,
  boar = 0,
  played = true,
  clay = 0,
} = {}) => {
  const session = new GameSession(5012, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.clay = clay
  player.resources.boar = boar
  player.pastures = played ? [{
    id: 'p1',
    size,
    stables,
    tiles: Array.from({ length: size }, (_, col) => ({ row: 0, col })),
    animalType: boar > 0 ? 'boar' : null,
    animalCount: boar,
  }] : []
  player.stableTiles = stables > 0 ? [{ row: 0, col: 0 }] : []
  const pigMarket = state.actionSpaces.find((space) => space.id === 'pig-market')
  if (pigMarket) pigMarket.resources.boar = 1
  session.loadState(state)
  return session
}

const playDrinkingTrough = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const addPig = (session: GameSession, total: number) => {
  const response = session.takeAction(0, 'pig-market')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  return session.resolveChoice(0, 'confirm', [
    { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: total },
  ] as unknown as Record<string, unknown>)
}

describe('A012 Drinking Trough parity', () => {
  it('A012 S1: Drinking Trough costs one clay to play', () => {
    const response = playDrinkingTrough(setup({ played: false, clay: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('A012 S2: a size-one pasture without a stable holds four animals', () => {
    const response = addPig(setup({ boar: 3 }), 4)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(4)
  })

  it('A012 S3: a size-one pasture with a stable holds six animals', () => {
    const response = addPig(setup({ stables: 1, boar: 5 }), 6)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(6)
  })

  it('A012 S4: a size-two pasture gains exactly two capacity and holds six animals', () => {
    const response = addPig(setup({ size: 2, boar: 5 }), 6)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(6)
  })
})
