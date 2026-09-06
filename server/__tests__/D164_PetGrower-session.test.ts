import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { AnimalType } from '../../shared/contract/types'

import '../../shared/cards/D/D164_PetGrower'
import '../../shared/cards/A/A099_FellowGrazer'

const CARD_ID = 'D164_PetGrower'
const OTHER_OCCUPATION = 'A099_FellowGrazer'
const FILLER = '__test_placeholder__'

const MARKET_IDS = {
  sheep: 'sheep-market',
  boar: 'pig-market',
  cattle: 'cattle-market',
} as const

type MarketAnimal = keyof typeof MARKET_IDS
type ZoneAssignment = {
  id: string
  zoneType: 'pasture' | 'house' | 'card'
  animalType: AnimalType | null
  animalCount: number
  cardId?: string
}

const setup = ({
  played = true, marketAnimal = 'sheep' as MarketAnimal, marketCount = 1,
  houseAnimal = null as AnimalType | null, pastureAnimal = null as AnimalType | null,
  actor = 0,
} = {}) => {
  const session = new GameSession(6164, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
  })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.pastures = [
      {
        id: `pasture-${index}-a`, size: 1, tiles: [{ row: 0, col: 1 }], stables: 0,
        animalType: null, animalCount: 0,
      },
      {
        id: `pasture-${index}-b`, size: 1, tiles: [{ row: 0, col: 2 }], stables: 0,
        animalType: null, animalCount: 0,
      },
    ]
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [OTHER_OCCUPATION] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (houseAnimal) {
    owner.resources[houseAnimal] = 1
    owner.houseAnimalType = houseAnimal
    owner.houseAnimalCount = 1
  }
  if (pastureAnimal) {
    owner.resources[pastureAnimal] += 1
    owner.pastures[0]!.animalType = pastureAnimal
    owner.pastures[0]!.animalCount = 1
  }
  const market = state.actionSpaces.find((space) => space.id === MARKET_IDS[marketAnimal])!
  market.resources[marketAnimal] = marketCount
  session.loadState(state)
  return session
}

const resolveAnimalReorg = (
  session: GameSession,
  response: SessionResponse,
  zones: ZoneAssignment[],
) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'animal-reorg' },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const resolved = session.resolveChoice(
    response.interaction.playerIndex,
    'confirm',
    zones as unknown as Record<string, unknown>,
  )
  expect(resolved.ok, resolved.error).toBe(true)
  return resolved
}

const takeMarket = (
  session: GameSession,
  marketAnimal: MarketAnimal,
  firstZones: ZoneAssignment[],
  bonusZones?: ZoneAssignment[],
) => {
  let response = session.takeAction(0, MARKET_IDS[marketAnimal])
  expect(response.ok, response.error).toBe(true)
  response = resolveAnimalReorg(session, response, firstZones)
  if (bonusZones) response = resolveAnimalReorg(session, response, bonusZones)
  return response
}

describe('D164 Pet Grower parity', () => {
  it('D164 S1: Pet Grower can be played as the first occupation in a four-player game', () => {
    const session = setup({ played: false })
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId === 'wait') {
        response = session.resolveChoice(response.interaction.playerIndex, CARD_ID)
      }
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D164 S2: Sheep Market grants one additional sheep when the collected sheep stays outside the house', () => {
    const response = takeMarket(
      setup(),
      'sheep',
      [{ id: 'pasture-0-a', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 }],
      [{ id: 'pasture-0-a', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }],
    )

    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      animalType: 'sheep', animalCount: 2,
    })
  })

  it('D164 S3: Pig Market grants one additional sheep when the collected boar stays outside the house', () => {
    const response = takeMarket(
      setup({ marketAnimal: 'boar' }),
      'boar',
      [{ id: 'pasture-0-a', zoneType: 'pasture', animalType: 'boar', animalCount: 1 }],
      [
        { id: 'pasture-0-a', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
        { id: 'pasture-0-b', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
      ],
    )

    expect(response.state.players[0]!.resources).toMatchObject({ boar: 1, sheep: 1 })
  })

  it('D164 S4: Cattle Market grants one additional sheep when the collected cattle stays outside the house', () => {
    const response = takeMarket(
      setup({ marketAnimal: 'cattle' }),
      'cattle',
      [{ id: 'pasture-0-a', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 }],
      [
        { id: 'pasture-0-a', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
        { id: 'pasture-0-b', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
      ],
    )

    expect(response.state.players[0]!.resources).toMatchObject({ cattle: 1, sheep: 1 })
  })

  it('D164 S5: putting the collected sheep in the house prevents the bonus sheep', () => {
    const response = takeMarket(
      setup(),
      'sheep',
      [{ id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 }],
    )

    expect(response.state.players[0]!).toMatchObject({
      resources: { sheep: 1 }, houseAnimalType: 'sheep', houseAnimalCount: 1,
    })
  })

  it('D164 S6: an animal already in the house prevents the bonus sheep', () => {
    const response = takeMarket(
      setup({ houseAnimal: 'sheep', marketAnimal: 'boar' }),
      'boar',
      [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
        { id: 'pasture-0-a', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
      ],
    )

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
  })

  it('D164 S7: an animal in a pasture does not prevent the bonus sheep', () => {
    const response = takeMarket(
      setup({ pastureAnimal: 'boar' }),
      'sheep',
      [
        { id: 'pasture-0-a', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
        { id: 'pasture-0-b', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
      ],
      [
        { id: 'pasture-0-a', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
        { id: 'pasture-0-b', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 },
      ],
    )

    expect(response.state.players[0]!.resources).toMatchObject({ boar: 1, sheep: 2 })
  })

  it('D164 S8: a non-animal accumulation space grants no sheep', () => {
    const session = setup()
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, wood: 3 })
  })

  it('D164 S9: an empty animal accumulation space still grants one sheep', () => {
    const session = setup({ marketCount: 0 })
    let response = session.takeAction(0, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    response = resolveAnimalReorg(session, response, [
      { id: 'pasture-0-a', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
    ])

    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })
})
