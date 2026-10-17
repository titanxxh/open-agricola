import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { AnimalType } from '../../shared/contract/types'

import '../../shared/cards/D/D164_PetGrower'
import '../../shared/cards/A/A099_FellowGrazer'
import assert from 'node:assert/strict'
import * as audit57Livestock from './_helpers/audit/ae-negative-57-livestock'

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
    player.houseAnimals = {};
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
    owner.houseAnimals = Object.fromEntries(owner.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, houseAnimal]));
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
      [{ id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 }],
    )

    expect(response.state.players[0]!).toMatchObject({
      resources: { sheep: 1 }, houseAnimals: { '1-0': 'sheep' },
    })
  })

  it('D164 S6: an animal already in the house prevents the bonus sheep', () => {
    const response = takeMarket(
      setup({ houseAnimal: 'sheep', marketAnimal: 'boar' }),
      'boar',
      [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
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

  it('D164 S9: an empty animal accumulation space is unavailable and grants no sheep', () => {
    const session = setup({ marketCount: 0 })
    const response = session.takeAction(0, 'sheep-market')
    expect(response.ok).toBe(false)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.takenBy).toEqual([])
  })
})

describe('ae-negative-57-livestock', () => {
  const { sessions, animals, ok, save, make, pasture, finish, count, collect } = audit57Livestock
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D164 N1 actual Sheep Pig and Cattle Market with animals housed outside the house each grant exactly one additional sheep', () => {
    for (const [space, animal] of [['sheep-market', 'sheep'], ['pig-market', 'boar'], ['cattle-market', 'cattle']] as const) {
      const session = make('D164_PetGrower', state => { pasture(state.players[0]!, null, 0, true); state.actionSpaces.find(candidate => candidate.id === space)!.resources[animal] = 1 }, true, 14), response = collect(session, 0, space)
      assert.equal(response.state.players[0]!.resources.sheep, animal === 'sheep' ? 2 : 1)
      assert.equal(response.state.players[0]!.resources[animal], animal === 'sheep' ? 2 : 1)
      save(`D164-N1-${animal}`, response)
    }
  })
  it('D164 N2 using a market then housing its single animal as the house pet suppresses the extra sheep', () => {
    for (const [space, animal] of [['sheep-market', 'sheep'], ['pig-market', 'boar'], ['cattle-market', 'cattle']] as const) {
      const session = make('D164_PetGrower', state => { pasture(state.players[0]!); state.actionSpaces.find(candidate => candidate.id === space)!.resources[animal] = 1 }, true, 14), response = collect(session, 0, space, true)
      assert.deepEqual(count(response), animals.map(candidate => candidate === animal ? 1 : 0))
      assert.equal(Object.values(response.state.players[0]!.houseAnimals).includes(animal), true)
      save(`D164-N2-${animal}`, response)
    }
  })
  it('D164 N3 hand card opponent animal collection and unrelated owner placement never grant owner sheep', () => {
    for (const mode of ['hand', 'opponent', 'unrelated']) {
      const actor = mode === 'opponent' ? 1 : 0
      const session = make('D164_PetGrower', state => { state.currentPlayerIndex = actor; pasture(state.players[actor]!); state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1 }, mode !== 'hand', 14)
      const response = mode === 'unrelated' ? finish(session, ok(session.takeAction(0, 'grain-seeds'))) : collect(session, actor, 'pig-market')
      assert.equal(response.state.players[0]!.resources.sheep, 0)
      save(`D164-N3-${mode}`, response)
    }
  })
})
