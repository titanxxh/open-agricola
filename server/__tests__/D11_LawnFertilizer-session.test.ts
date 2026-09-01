import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A012_DrinkingTrough'
import '../../shared/cards/D/D011_LawnFertilizer'

const CARD_ID = 'D011_LawnFertilizer'

const setup = ({
  size,
  stables = 0,
  boar,
  drinkingTrough = false,
  lawnFertilizer = true,
}: {
  size: number
  stables?: number
  boar: number
  drinkingTrough?: boolean
  lawnFertilizer?: boolean
}) => {
  const session = new GameSession(11, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = [
    ...(lawnFertilizer ? [CARD_ID] : []),
    ...(drinkingTrough ? ['A012_DrinkingTrough'] : []),
  ]
  player.resources.boar = boar
  player.pastures = [{
    id: 'p1',
    size,
    stables,
    tiles: Array.from({ length: size }, (_, col) => ({ row: 0, col })),
    animalType: 'boar',
    animalCount: boar,
  }]
  player.stableTiles = stables > 0 ? [{ row: 0, col: 0 }] : []
  const pigMarket = state.actionSpaces.find((space) => space.id === 'pig-market')
  if (!pigMarket) throw new Error('pig market missing')
  pigMarket.resources.boar = 1
  session.loadState(state)
  return session
}

const takePigMarket = (session: GameSession) => {
  const response = session.takeAction(0, 'pig-market')
  expect(response.ok).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  return response
}

describe('D011_LawnFertilizer session', () => {
  it('D011 S1 Lawn Fertilizer lets a size-one pasture hold three animals', () => {
    const session = setup({ size: 1, boar: 2 })
    takePigMarket(session)

    const response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 3 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(3)
  })

  it('D011 S2 Lawn Fertilizer lets a stable size-one pasture hold six animals', () => {
    const session = setup({ size: 1, stables: 1, boar: 5 })
    takePigMarket(session)

    const response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 6 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(6)
  })

  it('D011 S3 Lawn Fertilizer leaves a size-two pasture at four and safely rejects a fifth', () => {
    const session = setup({ size: 2, boar: 4 })
    takePigMarket(session)

    let response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 5 },
    ] as unknown as Record<string, unknown>)
    expect(response.ok).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('animal-reorg')
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(4)

    response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 4 },
      { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(4)
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
  })

  it('D011 S4 Drinking Trough raises a Lawn Fertilizer size-one pasture to five', () => {
    const session = setup({ size: 1, boar: 4, drinkingTrough: true })
    takePigMarket(session)

    const response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 5 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(5)
  })

  it('without D011 a size-one pasture still holds only two animals', () => {
    const session = setup({ size: 1, boar: 2, lawnFertilizer: false })
    takePigMarket(session)

    let response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 3 },
    ] as unknown as Record<string, unknown>)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('animal-reorg')
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(2)

    response = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 2 },
      { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
  })
})
