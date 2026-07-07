import type { FarmTilePosition } from '../contract/types'
import type { FarmyardGeometrySource } from './farmyard-geometry'
import { getFarmyardTilePositions, positionKey } from './farmyard-geometry'

const edgeBetweenTiles = (from: FarmTilePosition, to: FarmTilePosition) => {
  if (from.row === to.row) {
    const row = from.row
    if (to.col === from.col + 1) return `V-${row}-${to.col}`
    if (to.col === from.col - 1) return `V-${row}-${from.col}`
  }
  if (from.col === to.col) {
    const col = from.col
    if (to.row === from.row + 1) return `H-${to.row}-${col}`
    if (to.row === from.row - 1) return `H-${from.row}-${col}`
  }
  return null
}

export const computeFencedRegions = (
  edgeSet: Set<string>,
  player?: FarmyardGeometrySource,
) => {
  const farmTiles = getFarmyardTilePositions(player)
  const farmTileKeys = new Set(farmTiles.map(positionKey))
  const visited = new Set<string>()
  const regions: { tiles: FarmTilePosition[]; fenced: boolean }[] = []
  const directions = [
    {
      dr: -1,
      dc: 0,
      edge: (row: number, col: number) => `H-${row}-${col}`,
    },
    {
      dr: 1,
      dc: 0,
      edge: (row: number, col: number) => `H-${row + 1}-${col}`,
    },
    {
      dr: 0,
      dc: -1,
      edge: (row: number, col: number) => `V-${row}-${col}`,
    },
    {
      dr: 0,
      dc: 1,
      edge: (row: number, col: number) => `V-${row}-${col + 1}`,
    },
  ]
  for (const tile of farmTiles) {
    const tileKey = positionKey(tile)
    if (visited.has(tileKey)) continue
    const queue: FarmTilePosition[] = [tile]
    visited.add(tileKey)
    const tiles: FarmTilePosition[] = []
    let fenced = true
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      tiles.push(current)
      directions.forEach((dir) => {
        const next = {
          row: current.row + dir.dr,
          col: current.col + dir.dc,
        }
        const nextKey = positionKey(next)
        if (!farmTileKeys.has(nextKey)) {
          if (!edgeSet.has(dir.edge(current.row, current.col))) {
            fenced = false
          }
          return
        }
        const edgeId = edgeBetweenTiles(current, next)
        if (edgeId && edgeSet.has(edgeId)) return
        if (!visited.has(nextKey)) {
          visited.add(nextKey)
          queue.push(next)
        }
      })
    }
    regions.push({ tiles, fenced })
  }
  return regions
}
