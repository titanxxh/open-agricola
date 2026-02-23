import { FARM_COLS, FARM_ROWS } from '../game/farm'
import type { FarmTilePosition } from '../game/types'

export const edgeBetweenTiles = (from: FarmTilePosition, to: FarmTilePosition) => {
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

export const computeFencedRegions = (edgeSet: Set<string>) => {
  const visited = Array.from({ length: FARM_ROWS }, () =>
    Array.from({ length: FARM_COLS }, () => false),
  )
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
  for (let row = 0; row < FARM_ROWS; row += 1) {
    for (let col = 0; col < FARM_COLS; col += 1) {
      if (visited[row][col]) continue
      const queue: FarmTilePosition[] = [{ row, col }]
      visited[row][col] = true
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
          if (
            next.row < 0 ||
            next.row >= FARM_ROWS ||
            next.col < 0 ||
            next.col >= FARM_COLS
          ) {
            if (!edgeSet.has(dir.edge(current.row, current.col))) {
              fenced = false
            }
            return
          }
          const edgeId = edgeBetweenTiles(current, next)
          if (edgeId && edgeSet.has(edgeId)) return
          if (!visited[next.row][next.col]) {
            visited[next.row][next.col] = true
            queue.push(next)
          }
        })
      }
      regions.push({ tiles, fenced })
    }
  }
  return regions
}
