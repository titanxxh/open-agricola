export type FarmTilePosition = {
  row: number
  col: number
}

export type FarmField = {
  crop: 'grain' | 'vegetable' | null
  remaining: number
  row: number
  col: number
}

export type Pasture = {
  id: string
  size: number
  tiles: FarmTilePosition[]
  stables: number
  animalType: 'sheep' | 'boar' | 'cattle' | null
  animalCount: number
}

export type PlayerFarmState = {
  id: string
  name: string
  resources: {
    wood: number
    clay: number
    reed: number
    stone: number
    food: number
    grain: number
    vegetable: number
    sheep: number
    boar: number
    cattle: number
    begging: number
  }
  rooms: number
  houseType: 'wood' | 'clay' | 'stone'
  fields: FarmField[]
  roomTiles: FarmTilePosition[]
  stableTiles: FarmTilePosition[]
  fenceSegments: string[]
  fences: number
  pastures: Pasture[]
}

export type FenceValidationError = {
  code:
    | 'INVALID_EDGE'
    | 'NO_NEW_FENCES'
    | 'NOT_ENOUGH_WOOD'
    | 'MAX_FENCES_EXCEEDED'
    | 'FENCE_NOT_CONNECTED'
    | 'NO_ENCLOSED_AREA'
    | 'ENCLOSED_TILE_OCCUPIED'
  edges: string[]
  newEdges: string[]
}

export type FenceValidationResult<T extends PlayerFarmState = PlayerFarmState> =
  | { ok: true; player: T }
  | { ok: false; error: FenceValidationError }

export const FARM_ROWS = 3
export const FARM_COLS = 5
export const MAX_FENCES = 15

export const getAllTilePositions = (): FarmTilePosition[] => {
  const positions: FarmTilePosition[] = []
  for (let row = 0; row < FARM_ROWS; row += 1) {
    for (let col = 0; col < FARM_COLS; col += 1) {
      positions.push({ row, col })
    }
  }
  return positions
}

export const getAllEdgeIds = () => {
  const edges: string[] = []
  for (let row = 0; row <= FARM_ROWS; row += 1) {
    for (let col = 0; col < FARM_COLS; col += 1) {
      edges.push(`H-${row}-${col}`)
    }
  }
  for (let row = 0; row < FARM_ROWS; row += 1) {
    for (let col = 0; col <= FARM_COLS; col += 1) {
      edges.push(`V-${row}-${col}`)
    }
  }
  return edges
}

const positionKey = (pos: FarmTilePosition) => `${pos.row}-${pos.col}`

const createDefaultRoomTiles = (rooms: number) => {
  const positions: FarmTilePosition[] = []
  for (let col = 0; col < FARM_COLS; col += 1) {
    for (let row = FARM_ROWS - 1; row >= 0; row -= 1) {
      positions.push({ row, col })
    }
  }
  return positions.slice(0, Math.max(0, rooms))
}

export function normalizePlayerFarm<T extends PlayerFarmState>(player: T): T {
  const desiredRooms = player.rooms ?? 2
  const roomTiles =
    player.roomTiles && player.roomTiles.length > 0
      ? [...player.roomTiles]
      : createDefaultRoomTiles(desiredRooms)
  if (roomTiles.length < desiredRooms) {
    const used = new Set(roomTiles.map(positionKey))
    getAllTilePositions().forEach((pos) => {
      if (roomTiles.length >= desiredRooms) return
      const key = positionKey(pos)
      if (used.has(key)) return
      roomTiles.push(pos)
      used.add(key)
    })
  }
  if (roomTiles.length > desiredRooms) {
    roomTiles.length = desiredRooms
  }
  const used = new Set(roomTiles.map(positionKey))
  const allPositions = getAllTilePositions()
  const nextEmpty = () =>
    allPositions.find((pos) => !used.has(positionKey(pos)))
  const normalizedFields = (player.fields ?? []).flatMap((field) => {
    const row = Number.isFinite(field.row) ? field.row : -1
    const col = Number.isFinite(field.col) ? field.col : -1
    const validRow = row >= 0 && row < FARM_ROWS
    const validCol = col >= 0 && col < FARM_COLS
    const key = `${row}-${col}`
    if (validRow && validCol && !used.has(key)) {
      used.add(key)
      return [{ ...field, row, col }]
    }
    const next = nextEmpty()
    if (!next) return []
    used.add(positionKey(next))
    return [{ ...field, row: next.row, col: next.col }]
  })
  const usedTiles = new Set(roomTiles.map(positionKey))
  normalizedFields.forEach((field) =>
    usedTiles.add(positionKey({ row: field.row, col: field.col })),
  )
  const stableTiles = (player.stableTiles ?? []).filter((tile) => {
    const key = positionKey(tile)
    if (usedTiles.has(key)) return false
    usedTiles.add(key)
    return true
  })
  return {
    ...player,
    roomTiles,
    fields: normalizedFields,
    fenceSegments: player.fenceSegments ?? [],
    pastures: player.pastures ?? [],
    stableTiles,
  }
}

const parseEdgeId = (edgeId: string) => {
  const match = edgeId.match(/^(H|V)-(\d+)-(\d+)$/)
  if (!match) return null
  const row = Number(match[2])
  const col = Number(match[3])
  if (match[1] === 'H') {
    if (row < 0 || row > FARM_ROWS || col < 0 || col >= FARM_COLS) return null
  } else {
    if (row < 0 || row >= FARM_ROWS || col < 0 || col > FARM_COLS) return null
  }
  return { type: match[1] as 'H' | 'V', row, col }
}

const getEdgeVertices = (edgeId: string): FarmTilePosition[] => {
  const parsed = parseEdgeId(edgeId)
  if (!parsed) return []
  const { type, row, col } = parsed
  if (type === 'H') {
    return [
      { row, col },
      { row, col: col + 1 },
    ]
  }
  return [
    { row, col },
    { row: row + 1, col },
  ]
}

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

const getPastureCapacity = (pasture: Pasture) =>
  pasture.size * 2 * Math.pow(2, pasture.stables ?? 0)

const enforceAnimalCapacity = (player: PlayerFarmState) => {
  const totals = {
    sheep: player.resources?.sheep ?? 0,
    boar: player.resources?.boar ?? 0,
    cattle: player.resources?.cattle ?? 0,
  }
  player.pastures = (player.pastures ?? []).map((pasture) => {
    const capacity = getPastureCapacity(pasture)
    if (pasture.animalType) {
      const remaining = totals[pasture.animalType] ?? 0
      const count = Math.min(remaining, capacity)
      totals[pasture.animalType] = remaining - count
      return {
        ...pasture,
        animalCount: count,
        animalType: count > 0 ? pasture.animalType : null,
      }
    }
    return { ...pasture, animalCount: 0, animalType: null }
  })
  const fillPasture = (pasture: Pasture, animalType: Pasture['animalType']) => {
    if (!animalType) return pasture
    const capacity = getPastureCapacity(pasture)
    const remaining = totals[animalType] ?? 0
    if (remaining <= 0) return pasture
    const count = Math.min(remaining, capacity)
    totals[animalType] = remaining - count
    return {
      ...pasture,
      animalType,
      animalCount: count,
    }
  }
  player.pastures = player.pastures.map((pasture) => {
    if (pasture.animalType) return pasture
    let next = fillPasture(pasture, 'sheep')
    if (next.animalType) return next
    next = fillPasture(pasture, 'boar')
    if (next.animalType) return next
    return fillPasture(pasture, 'cattle')
  })
  player.resources.sheep = player.pastures
    .filter((pasture) => pasture.animalType === 'sheep')
    .reduce((sum, pasture) => sum + pasture.animalCount, 0)
  player.resources.boar = player.pastures
    .filter((pasture) => pasture.animalType === 'boar')
    .reduce((sum, pasture) => sum + pasture.animalCount, 0)
  player.resources.cattle = player.pastures
    .filter((pasture) => pasture.animalType === 'cattle')
    .reduce((sum, pasture) => sum + pasture.animalCount, 0)
}

export const validateFenceSelection = <T extends PlayerFarmState>(
  player: T,
  edges: string[],
  extraWood = 0,
): FenceValidationResult<T> => {
  const extraCost = Number.isFinite(extraWood) ? Math.max(0, extraWood) : 0
  const normalized = normalizePlayerFarm(player)
  const parsedEdges = edges.map((edge) => parseEdgeId(edge))
  if (parsedEdges.some((edge) => edge === null)) {
    return {
      ok: false,
      error: { code: 'INVALID_EDGE', edges, newEdges: [] },
    }
  }
  const existingEdges = new Set(normalized.fenceSegments ?? [])
  const newEdges = edges.filter((edge) => !existingEdges.has(edge))
  if (newEdges.length === 0) {
    return {
      ok: false,
      error: { code: 'NO_NEW_FENCES', edges, newEdges },
    }
  }
  if ((normalized.resources?.wood ?? 0) < newEdges.length + extraCost) {
    return {
      ok: false,
      error: { code: 'NOT_ENOUGH_WOOD', edges, newEdges },
    }
  }
  if (existingEdges.size + newEdges.length > MAX_FENCES) {
    return {
      ok: false,
      error: { code: 'MAX_FENCES_EXCEEDED', edges, newEdges },
    }
  }
  if (existingEdges.size > 0) {
    const existingVertices = new Set(
      Array.from(existingEdges).flatMap((edge) =>
        getEdgeVertices(edge).map(positionKey),
      ),
    )
    const connects = newEdges.some((edge) =>
      getEdgeVertices(edge).some((vertex) =>
        existingVertices.has(positionKey(vertex)),
      ),
    )
    if (!connects) {
      return {
        ok: false,
        error: { code: 'FENCE_NOT_CONNECTED', edges, newEdges },
      }
    }
  }
  const edgeSet = new Set([...existingEdges, ...newEdges])
  const regions = computeFencedRegions(edgeSet)
  const fencedRegions = regions.filter((region) => region.fenced)
  if (fencedRegions.length === 0) {
    return {
      ok: false,
      error: { code: 'NO_ENCLOSED_AREA', edges, newEdges },
    }
  }
  const roomSet = new Set(normalized.roomTiles.map(positionKey))
  const fieldSet = new Set(
    normalized.fields.map((field) =>
      positionKey({ row: field.row, col: field.col }),
    ),
  )
  const occupiedRegion = fencedRegions.find((region) =>
    region.tiles.some(
      (tile) =>
        roomSet.has(positionKey(tile)) || fieldSet.has(positionKey(tile)),
    ),
  )
  if (occupiedRegion) {
    return {
      ok: false,
      error: { code: 'ENCLOSED_TILE_OCCUPIED', edges, newEdges },
    }
  }
  const stableSet = new Set(
    normalized.stableTiles.map((tile) => positionKey(tile)),
  )
  const pastures: Pasture[] = fencedRegions.map((region, index) => ({
    id: `pasture-${index + 1}`,
    size: region.tiles.length,
    tiles: region.tiles,
    stables: region.tiles.filter((tile) =>
      stableSet.has(positionKey(tile)),
    ).length,
    animalType: null,
    animalCount: 0,
  }))
  const updated: PlayerFarmState = {
    ...normalized,
    resources: {
      ...normalized.resources,
      wood: (normalized.resources?.wood ?? 0) - newEdges.length - extraCost,
    },
    fenceSegments: Array.from(edgeSet),
    fences: edgeSet.size,
    pastures,
  }
  enforceAnimalCapacity(updated)
  return { ok: true, player: updated as T }
}
