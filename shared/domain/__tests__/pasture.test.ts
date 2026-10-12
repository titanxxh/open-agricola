import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../session/state-bootstrap'
import { getFencedStableCount, getPastureCapacity, getPastureSize, getPastureStableCount, getPastureViews } from '../pasture'

const setup = () => {
  const state = createInitialState(42, { playerCount: 2, ordinaryCardDeckSeed: 42 })
  const player = state.players[0]!
  player.stableTiles = []
  player.pastures = [{
    id: 'sheep-pasture', tiles: [{ row: 0, col: 4 }],
    animalType: 'sheep', animalCount: 2,
  }]
  return player
}

describe('pasture queries derive geometry and stable counts from facts', () => {
  it('counts only stables inside the pasture, immediately reflecting construction and return', () => {
    const player = setup()
    const pasture = player.pastures[0]!
    expect(getPastureSize(pasture)).toBe(1)
    expect(getPastureCapacity(player, pasture)).toBe(2)

    player.stableTiles.push({ row: 0, col: 3 })
    expect(getPastureStableCount(player, pasture)).toBe(0)
    expect(getFencedStableCount(player)).toBe(0)

    player.stableTiles.push({ row: 0, col: 4 })
    expect(getPastureStableCount(player, pasture)).toBe(1)
    expect(getPastureCapacity(player, pasture)).toBe(4)
    expect(getFencedStableCount(player)).toBe(1)

    player.stableTiles.pop()
    expect(getPastureCapacity(player, pasture)).toBe(2)
    expect(getFencedStableCount(player)).toBe(0)
    expect(pasture).toEqual({ id: 'sheep-pasture', tiles: [{ row: 0, col: 4 }], animalType: 'sheep', animalCount: 2 })
  })

  it('computes area from the current tiles and exposes read-only views without writing derived fields', () => {
    const player = setup()
    const pasture = player.pastures[0]!
    pasture.tiles.push({ row: 1, col: 4 })
    player.stableTiles = [{ row: 0, col: 4 }, { row: 1, col: 4 }]
    const before = JSON.stringify(player)

    expect(getPastureViews(player)).toEqual([{
      id: 'sheep-pasture', tiles: [{ row: 0, col: 4 }, { row: 1, col: 4 }],
      animalType: 'sheep', animalCount: 2, size: 2, stables: 2, capacity: 16, hasWell: false,
    }])
    expect(getPastureSize(pasture)).toBe(2)
    expect(getPastureCapacity(player, pasture)).toBe(16)
    expect(JSON.stringify(player)).toBe(before)
    expect(pasture).not.toHaveProperty('size')
    expect(pasture).not.toHaveProperty('stables')
  })
})
