import { describe, expect, it } from 'vitest'
import { EngineStack } from '../../engine'
import { rehydrateState, serializeState } from '../serialization'
import { createInitialState } from '../state-bootstrap'

const countTerrain = (
  terrain: NonNullable<ReturnType<typeof createInitialState>['players'][number]['farmTerrain']>,
) => terrain.reduce(
  (counts, tile) => {
    counts[tile.kind] += 1
    return counts
  },
  { forest: 0, moor: 0 },
)

describe('Farmers of the Moor setup', () => {
  it('deals deterministic start cards and terrain when enabled', () => {
    const first = createInitialState(321, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const second = createInitialState(321, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })

    expect(first.enableFarmersOfTheMoor).toBe(true)
    expect(first.farmersOfTheMoor?.complexity).toBe('iii')
    expect(first.farmersOfTheMoor?.startCardByPlayerId).toEqual(
      second.farmersOfTheMoor?.startCardByPlayerId,
    )
    expect(new Set(Object.values(first.farmersOfTheMoor!.startCardByPlayerId)).size).toBe(2)

    for (const player of first.players) {
      expect(player.resources.fuel).toBe(0)
      expect(player.resources.horse).toBe(0)
      expect(player.sickWorkerIds).toEqual([])
      expect(player.farmTerrain).toHaveLength(8)
      expect(countTerrain(player.farmTerrain!)).toEqual({ forest: 5, moor: 3 })

      const roomKeys = new Set(player.roomTiles.map((tile) => `${tile.row}-${tile.col}`))
      for (const tile of player.farmTerrain!) {
        expect(roomKeys.has(`${tile.row}-${tile.col}`)).toBe(false)
      }
    }
  })

  it('leaves disabled games without Farmers of the Moor terrain state', () => {
    const state = createInitialState(321, { playerCount: 2 })

    expect(state.enableFarmersOfTheMoor).toBe(false)
    expect(state.farmersOfTheMoor).toBeNull()
    expect(state.players[0]!.farmTerrain).toBeUndefined()
    expect(state.players[0]!.sickWorkerIds).toBeUndefined()
    expect(state.players[0]!.resources.fuel).toBeUndefined()
    expect(state.players[0]!.resources.horse).toBeUndefined()
  })

  it('preserves Farmers of the Moor state through public snapshot rehydration', () => {
    const state = createInitialState(321, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const serialized = serializeState(state, { engineStack: new EngineStack() })

    expect(serialized.enableFarmersOfTheMoor).toBe(true)
    expect(serialized.farmersOfTheMoor).toEqual(state.farmersOfTheMoor)
    expect(serialized.players[0]!.farmTerrain).toEqual(state.players[0]!.farmTerrain)

    const restored = rehydrateState(JSON.parse(JSON.stringify(serialized))).state
    expect(restored.enableFarmersOfTheMoor).toBe(true)
    expect(restored.farmersOfTheMoor).toEqual(state.farmersOfTheMoor)
    expect(restored.players[0]!.farmTerrain).toEqual(state.players[0]!.farmTerrain)
  })
})
