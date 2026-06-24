import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../contract/types'
import { replaceTerrainWithField } from '../../moor/farm-terrain'
import { countUnusedFarmyardSpaces } from '../farm'
import { Farmyard } from '../farmyard'
import { makeBlankPlayer } from './helpers'

const singleTileFence = ({ row, col }: { row: number; col: number }) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const terrainTiles = [
  { row: 0, col: 0, kind: 'forest' as const },
  { row: 0, col: 1, kind: 'forest' as const },
  { row: 0, col: 2, kind: 'forest' as const },
  { row: 1, col: 2, kind: 'forest' as const },
  { row: 1, col: 3, kind: 'forest' as const },
  { row: 2, col: 2, kind: 'moor' as const },
  { row: 2, col: 3, kind: 'moor' as const },
  { row: 1, col: 4, kind: 'moor' as const },
]

const makeMoorPlayer = (): PlayerState => ({
  ...makeBlankPlayer({ resources: { wood: 20 } }),
  farmTerrain: terrainTiles.map((tile) => ({ ...tile })),
}) as unknown as PlayerState

const makeFarmyard = (player: PlayerState) =>
  new Farmyard(player, { players: [player] } as unknown as GameState)

describe('Farmers of the Moor farm terrain', () => {
  it('counts forest and moor tiles as used farmyard spaces', () => {
    const player = makeMoorPlayer()

    expect(countUnusedFarmyardSpaces(player)).toBe(5)
  })

  it('blocks ordinary room, plow, stable, and pasture placement on terrain', () => {
    const player = makeMoorPlayer()
    const terrain = player.farmTerrain!.find((tile) => tile.kind === 'forest')!
    const farmyard = makeFarmyard(player)

    const plow = farmyard.canPlow(terrain)
    expect(plow.ok).toBe(false)
    if (!plow.ok) expect(plow.error.code).toBe('OCCUPIED')

    const room = farmyard.canBuildRoom(terrain)
    expect(room).toEqual({ ok: false, code: 'OCCUPIED' })

    const stable = farmyard.canBuildStable(terrain)
    expect(stable).toEqual({ ok: false, code: 'OCCUPIED' })

    const fence = farmyard.canBuildFence({
      edges: singleTileFence(terrain),
      freeFences: 4,
      options: { skipPayment: true },
    })
    expect(fence.ok).toBe(false)
    if (!fence.ok) expect(fence.error.code).toBe('ENCLOSED_TILE_OCCUPIED')
  })

  it('replaces forest with a field without using ordinary plow legality', () => {
    const player = makeMoorPlayer()
    const terrain = player.farmTerrain!.find((tile) => tile.kind === 'forest')!

    const ordinaryPlow = makeFarmyard(player).canPlow(terrain)
    expect(ordinaryPlow.ok).toBe(false)

    const replaced = replaceTerrainWithField(player, terrain, 'forest')
    expect(replaced.ok).toBe(true)
    expect(player.farmTerrain!.some((tile) => tile.row === terrain.row && tile.col === terrain.col)).toBe(false)
    expect(player.fields.some((field) => field.row === terrain.row && field.col === terrain.col)).toBe(true)
  })
})
