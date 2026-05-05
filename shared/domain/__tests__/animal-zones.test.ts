import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session.ts'
import { playerBoard } from '../index.ts'

describe('AnimalZones', () => {
  it('zones() returns at least the house zone on initial state', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    const zones = board.animals.zones()
    expect(zones.length).toBeGreaterThan(0)
    expect(zones.some((z) => z.zoneType === 'house')).toBe(true)
  })

  it('countAnimals returns 0 for sheep / boar / cattle on initial state', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.animals.countAnimals('sheep')).toBe(0)
    expect(board.animals.countAnimals('boar')).toBe(0)
    expect(board.animals.countAnimals('cattle')).toBe(0)
  })

  it('totalCapacity is at least 1 on bare farm (house holds one animal)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.animals.totalCapacity()).toBeGreaterThanOrEqual(1)
  })

  it('looseStableKeys is empty when player has no stables placed', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.animals.looseStableKeys()).toEqual([])
  })

  it('pastureCapacity returns 0 for an unknown zone id', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.animals.pastureCapacity('does-not-exist')).toBe(0)
  })

  it('enforceCapacity clamps over-supplied animals to pasture capacity', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]
    // Inject a single-tile pasture (capacity = size * 2 * 2^stables = 2)
    // and 5 sheep. enforceCapacity must clamp the sheep total to what
    // fits across all zones (pasture=2 + house=1 = 3).
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    player.resources.sheep = 5
    player.resources.boar = 0
    player.resources.cattle = 0

    const board = playerBoard(state, 0)
    board.animals.enforceCapacity()

    // Pasture (cap 2) + house (cap 1) = 3 sheep retained.
    expect(player.resources.sheep).toBe(3)
    const pasture = player.pastures[0]
    expect(pasture.animalType).toBe('sheep')
    expect(pasture.animalCount).toBe(2)
    expect(player.houseAnimalType).toBe('sheep')
    expect(player.houseAnimalCount).toBe(1)
  })
})
