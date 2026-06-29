import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import type { Resource } from '../../shared/contract/types'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { countUnusedFarmyardSpaces } from '../../shared/domain/farmyard-usage'

const PLACEHOLDER = '__test_placeholder__'
const HOME_WOOD = 'M034_HomeWood'
const HORSE_TROUGH = 'M035_HorseTrough'

const baseResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  horse: 0,
  fuel: 0,
  begging: 0,
})

const findSpecialCardFor = (
  session: GameSession,
  actionId: string,
) => session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
  card.actions.includes(actionId as never),
)!

const setup = (playedCards: string[]) => {
  const session = new GameSession(407, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 6
  state.roundPhase = 'work'
  for (const player of state.players) {
    player.resources = baseResources()
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.rooms = 2
    player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 0, col: 1, kind: 'forest' },
      { row: 1, col: 0, kind: 'moor' },
    ]
    player.farmyardSpaceStates = []
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const player = state.players[0]!
  player.resources.food = 1
  player.minorPlayed = playedCards
  session.loadState(state)
  return { session, player: session.state.players[0]! }
}

describe('M034/M035 Farmers of the Moor animal zones', () => {
  it('M034 adds one non-sheep animal zone on each visible forest space', () => {
    const { session } = setup([HOME_WOOD])
    const card = findSpecialCardFor(session, 'horse-market')

    const resp = session.takeSpecialAction(0, card.id, 'horse-market')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    if (resp.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorg')

    const homeWoodZones = resp.interaction.request.zones.filter((zone) =>
      zone.cardId === HOME_WOOD
    )
    expect(homeWoodZones).toHaveLength(2)
    expect(homeWoodZones).toEqual(expect.arrayContaining([
      expect.objectContaining({
        zoneType: 'card',
        cardId: HOME_WOOD,
        capacity: 1,
        allowedAnimalTypes: ['boar', 'cattle', 'horse'],
        farmPosition: { row: 0, col: 0 },
      }),
      expect.objectContaining({
        zoneType: 'card',
        cardId: HOME_WOOD,
        capacity: 1,
        allowedAnimalTypes: ['boar', 'cattle', 'horse'],
        farmPosition: { row: 0, col: 1 },
      }),
    ]))

    const placed = session.resolveChoice(0, 'confirm', {
      zones: [
        {
          id: homeWoodZones[0]!.id,
          zoneType: 'card',
          cardId: HOME_WOOD,
          animalType: 'horse',
          animalCount: 1,
        },
      ],
    })

    expect(placed.ok).toBe(true)
    expect(placed.state.players[0]!.resources.horse).toBe(1)
  })

  it('M034 rejects sheep submitted to a forest-backed card zone', () => {
    const { session } = setup([HOME_WOOD])
    const sheepMarket = session.state.actionSpaces.find((space) => space.id === 'sheep-market')
    expect(sheepMarket).toBeDefined()
    sheepMarket!.resources.sheep = 1
    session.loadState(session.state)

    const resp = session.takeAction(0, 'sheep-market')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    if (resp.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorg')
    const homeWoodZone = resp.interaction.request.zones.find((zone) =>
      zone.cardId === HOME_WOOD
    )
    expect(homeWoodZone).toBeDefined()

    const placed = session.resolveChoice(0, 'confirm', {
      zones: [
        {
          id: homeWoodZone!.id,
          zoneType: 'card',
          cardId: HOME_WOOD,
          animalType: 'sheep',
          animalCount: 1,
        },
      ],
    })

    expect(placed.ok).toBe(true)
    expect(placed.state.players[0]!.resources.sheep).toBe(0)
    expect(placed.state.events).toContainEqual(expect.objectContaining({
      type: 'farm.animalDiscarded',
      animals: { sheep: 1 },
      reason: 'noRoom',
    }))
  })

  it('M034 drops animals from a card zone after the backing forest disappears', () => {
    const { session } = setup([HOME_WOOD])
    const card = findSpecialCardFor(session, 'horse-market')
    let resp = session.takeSpecialAction(0, card.id, 'horse-market')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    if (resp.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorg')
    const removedForestZone = resp.interaction.request.zones.find((zone) =>
      zone.cardId === HOME_WOOD && zone.farmPosition?.row === 0 && zone.farmPosition.col === 0
    )
    expect(removedForestZone).toBeDefined()

    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        {
          id: removedForestZone!.id,
          zoneType: 'card',
          cardId: HOME_WOOD,
          animalType: 'horse',
          animalCount: 1,
        },
      ],
    })
    expect(resp.state.players[0]!.resources.horse).toBe(1)

    const state = resp.state
    const player = state.players[0]!
    player.farmTerrain = player.farmTerrain?.filter((tile) =>
      !(tile.row === 0 && tile.col === 0)
    )
    player.resources.food = 0
    const pigMarket = state.actionSpaces.find((space) => space.id === 'pig-market')
    expect(pigMarket).toBeDefined()
    pigMarket!.resources.boar = 1
    state.currentPlayerIndex = 0
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    session.loadState(state)

    const pending = session.takeAction(0, 'pig-market')

    expect(pending.ok).toBe(true)
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(pending.interaction.request.kind).toBe('animal-reorg')
    if (pending.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorg')
    expect(pending.interaction.request.zones).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: removedForestZone!.id }),
    ]))

    const placed = session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      ],
    })

    expect(placed.ok).toBe(true)
    expect(placed.state.players[0]!.resources.boar).toBe(1)
    expect(placed.state.players[0]!.resources.horse).toBe(0)
    expect(placed.state.events).toContainEqual(expect.objectContaining({
      type: 'farm.animalDiscarded',
      animals: { horse: 1 },
      reason: 'noRoom',
    }))
  })

  it('M034 stale zone storage does not satisfy pending animal checks after the forest disappears', () => {
    const { session } = setup([HOME_WOOD])
    const card = findSpecialCardFor(session, 'horse-market')
    let resp = session.takeSpecialAction(0, card.id, 'horse-market')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    if (resp.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorg')
    const forestZone = resp.interaction.request.zones.find((zone) =>
      zone.cardId === HOME_WOOD && zone.farmPosition?.row === 0 && zone.farmPosition.col === 0
    )
    expect(forestZone).toBeDefined()

    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        {
          id: forestZone!.id,
          zoneType: 'card',
          cardId: HOME_WOOD,
          animalType: 'horse',
          animalCount: 1,
        },
      ],
    })
    const state = resp.state
    const player = state.players[0]!
    player.farmTerrain = player.farmTerrain?.filter((tile) =>
      !(tile.row === 0 && tile.col === 0)
    )
    session.loadState(state)

    expect(session.hasPendingAnimalsCheck(session.state.players[0]!)).toBe(true)
  })

  it('M034 visible zone storage is not double-counted when another animal is gained', () => {
    const { session } = setup([HOME_WOOD])
    const card = findSpecialCardFor(session, 'horse-market')
    let resp = session.takeSpecialAction(0, card.id, 'horse-market')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    if (resp.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorg')
    const forestZone = resp.interaction.request.zones.find((zone) =>
      zone.cardId === HOME_WOOD
    )
    expect(forestZone).toBeDefined()

    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        {
          id: forestZone!.id,
          zoneType: 'card',
          cardId: HOME_WOOD,
          animalType: 'horse',
          animalCount: 1,
        },
      ],
    })
    const state = resp.state
    state.players[0]!.resources.boar = 1
    session.loadState(state)

    expect(session.hasPendingAnimalsCheck(session.state.players[0]!)).toBe(true)
  })

  it('M035 creates horse capacity only on unused spaces adjacent to the house and keeps the space unused', () => {
    const { session, player } = setup([HORSE_TROUGH])
    player.fields = [{ row: 1, col: 3, stacks: [] }]
    player.stableTiles = [{ row: 1, col: 4 }]
    player.resources.food = 1
    session.loadState(session.state)
    const unusedBefore = countUnusedFarmyardSpaces(session.state.players[0]!)
    const card = findSpecialCardFor(session, 'horse-market')

    const resp = session.takeSpecialAction(0, card.id, 'horse-market')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    if (resp.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorg')
    const horseTroughZones = resp.interaction.request.zones.filter((zone) =>
      zone.cardId === HORSE_TROUGH
    )
    expect(horseTroughZones).toEqual([
      expect.objectContaining({
        zoneType: 'card',
        cardId: HORSE_TROUGH,
        capacity: 2,
        allowedAnimalType: 'horse',
        farmPosition: { row: 2, col: 2 },
        countsFarmyardSpaceAsUnused: true,
      }),
    ])

    const placed = session.resolveChoice(0, 'confirm', {
      zones: [
        {
          id: horseTroughZones[0]!.id,
          zoneType: 'card',
          cardId: HORSE_TROUGH,
          animalType: 'horse',
          animalCount: 1,
        },
      ],
    })

    expect(placed.ok).toBe(true)
    expect(placed.state.players[0]!.resources.horse).toBe(1)
    expect(countUnusedFarmyardSpaces(placed.state.players[0]!)).toBe(unusedBefore)
  })
})
