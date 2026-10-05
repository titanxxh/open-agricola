import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { buildAnimalReorgRequest } from '../animal-reorg'
import { prefillAnimalZones, type AnimalZone } from '../animal-zones'

const setup = () => {
  const session = new GameSession(961, undefined, { playerCount: 2 })
  return { state: session.state, player: session.state.players[0]! }
}
const zone = (id: string, capacity: number, overrides: Partial<AnimalZone> = {}): AnimalZone => ({
  id, zoneType: 'pasture', capacity, animalType: null, animalCount: 0, ...overrides,
})

describe('fixed-layout animal prefill', () => {
  it('finds a complete placement that a first-fit allocation would miss, without mutation', () => {
    const { state, player } = setup()
    Object.assign(player.resources, { sheep: 2, boar: 2, cattle: 1 })
    const current = [
      zone('p', 2),
      zone('h', 1, { zoneType: 'house', animalType: 'cattle', animalCount: 1 }),
      zone('c', 2, { zoneType: 'card', allowedAnimalType: 'sheep' }),
    ]
    const before = JSON.stringify({ state, current })
    const next = prefillAnimalZones(state, player, current)
    expect(next[0]).toMatchObject({ animalType: 'boar', animalCount: 2 })
    expect(next[1]).toMatchObject({ animalType: 'cattle', animalCount: 1 })
    expect(next[2]).toMatchObject({ animalType: 'sheep', animalCount: 2 })
    expect(JSON.stringify({ state, current })).toBe(before)
    expect(prefillAnimalZones(state, player, current)).toEqual(next)
  })

  it('maximizes additions even when an earlier species cannot fit', () => {
    const { state, player } = setup()
    Object.assign(player.resources, { sheep: 1, boar: 4 })
    const next = prefillAnimalZones(state, player, [
      zone('p', 4, { animalType: 'sheep', animalCount: 1 }),
      zone('pig-only', 3, { zoneType: 'card', allowedAnimalType: 'boar' }),
    ])
    expect(next[0]).toMatchObject({ animalType: 'sheep', animalCount: 1 })
    expect(next[1]).toMatchObject({ animalType: 'boar', animalCount: 3 })
  })

  it('respects overlapping required-empty groups', () => {
    const { state, player } = setup()
    player.resources.boar = 3
    const next = prefillAnimalZones(state, player, [
      zone('a', 1, { requiredEmptyZoneGroupIds: ['ab'] }),
      zone('b', 1, { requiredEmptyZoneGroupIds: ['ab', 'bc'] }),
      zone('c', 1, { requiredEmptyZoneGroupIds: ['bc'] }),
    ])
    expect(next.map((z) => z.animalCount)).toEqual([1, 0, 1])
  })

  it('never opens more than the exclusive card-zone limit', () => {
    const { state, player } = setup()
    player.resources.boar = 3
    const next = prefillAnimalZones(state, player, [
      zone('a', 2, { zoneType: 'card', cardId: '__test', exclusiveCardZoneLimit: 1 }),
      zone('b', 2, { zoneType: 'card', cardId: '__test', exclusiveCardZoneLimit: 1 }),
    ])
    expect(next.map((z) => z.animalCount)).toEqual([2, 0])
  })

  it('honors a card-wide exclusive constraint on another candidate zone', () => {
    const { state, player } = setup()
    player.resources.boar = 2
    const current = [
      zone('a', 0, { zoneType: 'card', cardId: '__test', exclusiveCardZoneLimit: 0 }),
      zone('b', 2, { zoneType: 'card', cardId: '__test' }),
    ]
    expect(prefillAnimalZones(state, player, current)).toEqual(current)
  })

  it('keeps exclusive limits separate for different owners of the same card', () => {
    const { state, player } = setup()
    player.resources.boar = 2
    const next = prefillAnimalZones(state, player, [
      zone('a', 1, { zoneType: 'card', cardId: '__test', ownerPlayerId: 'p1', exclusiveCardZoneLimit: 1 }),
      zone('b', 1, { zoneType: 'card', cardId: '__test', ownerPlayerId: 'p2', exclusiveCardZoneLimit: 1 }),
    ])
    expect(next.map((z) => z.animalCount)).toEqual([1, 1])
  })

  it('leaves an invalid old layout untouched rather than clipping or moving it', () => {
    const { state, player } = setup()
    player.resources.sheep = 3
    const current = [zone('p', 2, { animalType: 'sheep', animalCount: 3 }), zone('h', 1, { zoneType: 'house' })]
    expect(prefillAnimalZones(state, player, current)).toEqual(current)
  })

  it('bounds huge unplaceable stock by remaining capacity', () => {
    const { state, player } = setup()
    Object.assign(player.resources, { sheep: 1_000_000, boar: 1_000_000 })
    const next = prefillAnimalZones(state, player, [zone('p', 4)])
    expect(next[0]).toMatchObject({ animalType: 'sheep', animalCount: 4 })
  })

  it('gates horse prefill by the variant', () => {
    const { state, player } = setup()
    player.resources.horse = 1
    expect(prefillAnimalZones(state, player, [zone('p', 1)])[0]!.animalCount).toBe(0)
    state.enableFarmersOfTheMoor = true
    expect(prefillAnimalZones(state, player, [zone('p', 1)])[0]).toMatchObject({ animalType: 'horse', animalCount: 1 })
  })

  it('provides an explicit original-layout request for deliberate manual flows', () => {
    const { state, player } = setup()
    player.resources.sheep = 1
    expect(buildAnimalReorgRequest(state, player, false)).toMatchObject({
      prefill: false, zones: [expect.objectContaining({ id: 'house', animalCount: 0 })],
    })
    expect(buildAnimalReorgRequest(state, player).zones[0]).toMatchObject({ id: 'house', animalType: 'sheep', animalCount: 1 })
    expect(player.houseAnimalCount).toBe(0)
  })
})
