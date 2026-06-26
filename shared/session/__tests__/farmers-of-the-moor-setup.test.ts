import { describe, expect, it } from 'vitest'
import { EngineStack } from '../../engine'
import { rehydrateState, serializeState, serializeStateForPlayer } from '../serialization'
import { createInitialState, getImplementedFarmersOfTheMoorMinorIds } from '../state-bootstrap'

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
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const second = createInitialState(321, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
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
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
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

  it('preserves public Farmers of the Moor state in player snapshots while masking hidden hands', () => {
    const state = createInitialState(321, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    state.players[0]!.resources.fuel = 2
    state.players[0]!.resources.horse = 1
    state.players[1]!.sickWorkerIds = ['2']

    const p1View = serializeStateForPlayer(state, 'p1', { engineStack: new EngineStack() })
    const spectatorView = serializeStateForPlayer(state, null, { engineStack: new EngineStack() })

    expect(p1View.enableFarmersOfTheMoor).toBe(true)
    expect(p1View.farmersOfTheMoor).toEqual(state.farmersOfTheMoor)
    expect(p1View.players[0]!.farmTerrain).toEqual(state.players[0]!.farmTerrain)
    expect(p1View.players[1]!.farmTerrain).toEqual(state.players[1]!.farmTerrain)
    expect(p1View.players[0]!.resources.fuel).toBe(2)
    expect(p1View.players[0]!.resources.horse).toBe(1)
    expect(p1View.players[1]!.sickWorkerIds).toEqual(['2'])
    expect(p1View.players[1]!.minorHand).toEqual(Array(state.players[1]!.minorHand.length).fill('?'))
    expect(spectatorView.players[0]!.minorHand).toEqual(Array(state.players[0]!.minorHand.length).fill('?'))
  })

  it('deals a full Farmers of the Moor minor hand when the implemented pool is sufficient', () => {
    const state = createInitialState(321, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })

    for (const player of state.players) {
      expect(player.occupationHand).toHaveLength(7)
      expect(player.minorHand).toHaveLength(7)
      expect(player.minorHand.filter((id) => id.startsWith('M'))).toHaveLength(4)
      expect(player.minorHand.filter((id) => !id.startsWith('M'))).toHaveLength(3)
    }
  })

  it('derives the Farmers of the Moor minor deal pool from all implemented FoM minors', () => {
    const pool = getImplementedFarmersOfTheMoorMinorIds(2)

    expect(pool.length).toBeGreaterThan(80)
    expect(pool).toEqual(expect.arrayContaining([
      'M018_RegisterOfCraftsmen',
      'M032_PeatHut',
      'M044_Swamp',
      'M055_ToolShed',
      'M082_Firewood',
      'M106_HorseButchery',
    ]))
  })

  it('keeps the incomplete-pool option compatible while the pool is sufficient', () => {
    const state = createInitialState(321, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })

    for (const player of state.players) {
      expect(player.occupationHand).toHaveLength(7)
      expect(player.minorHand).toHaveLength(7)
      expect(player.minorHand.filter((id) => id.startsWith('M'))).toHaveLength(4)
      expect(player.minorHand.filter((id) => !id.startsWith('M'))).toHaveLength(3)
    }
  })
})
