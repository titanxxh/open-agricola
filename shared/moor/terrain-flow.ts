import type { ActionFlow, FarmTilePosition, PlayerState, Resource } from '../contract/types'
import { getAllTilePositions, getUsedFarmyardTileKeys, parsePositionKey, positionKey } from '../domain/farm'
import { registerSelectionEffect } from '../actions/helpers/selection-effect-registry'
import { replaceTerrainWithField } from './farm-terrain'
import type { FarmTerrainKind } from './types'

const TERRAIN_SELECTION_EFFECT = 'moor-terrain-flow'

type TerrainSelectionMode = 'place' | 'remove' | 'replace-kind' | 'replace-with-field'

type BuildTerrainSelectionLeafOptions = {
  sourceCard: string
  mode: TerrainSelectionMode
  kind?: FarmTerrainKind
  fromKind?: FarmTerrainKind
  toKind?: FarmTerrainKind
  selectableTiles: FarmTilePosition[]
  minSelections?: number
  maxSelections?: number
  allowedSelectionCounts?: number[]
  optional?: boolean
  gainPerSelection?: Partial<Resource>
  bonusVpPerSelection?: number
}

const isTerrainKind = (value: unknown): value is FarmTerrainKind =>
  value === 'forest' || value === 'moor'

const parsePositions = (positions: string[]): FarmTilePosition[] =>
  positions.flatMap((position) => {
    const parsed = parsePositionKey(position)
    return parsed ? [parsed] : []
  })

export const getTerrainTiles = (
  player: Pick<PlayerState, 'farmTerrain'>,
  kind?: FarmTerrainKind,
): FarmTilePosition[] =>
  (player.farmTerrain ?? [])
    .filter((tile) => kind === undefined || tile.kind === kind)
    .map(({ row, col }) => ({ row, col }))

export const getUnusedTerrainTiles = (player: PlayerState): FarmTilePosition[] => {
  const used = getUsedFarmyardTileKeys(player)
  return getAllTilePositions().filter((tile) => !used.has(positionKey(tile)))
}

const hasAdjacentField = (player: PlayerState, tile: FarmTilePosition): boolean => {
  if ((player.fields ?? []).length === 0) return true
  const fields = new Set((player.fields ?? []).map((field) => positionKey(field)))
  return [
    { row: tile.row - 1, col: tile.col },
    { row: tile.row + 1, col: tile.col },
    { row: tile.row, col: tile.col - 1 },
    { row: tile.row, col: tile.col + 1 },
  ].some((neighbor) => fields.has(positionKey(neighbor)))
}

export const getMoorToFieldTiles = (player: PlayerState): FarmTilePosition[] =>
  getTerrainTiles(player, 'moor').filter((tile) => hasAdjacentField(player, tile))

export const buildPlaceTerrainFlow = (
  sourceCard: string,
  player: PlayerState,
  kind: FarmTerrainKind,
  optional = false,
): ActionFlow | undefined => {
  const selectableTiles = getUnusedTerrainTiles(player)
  if (selectableTiles.length === 0) return
  return buildTerrainSelectionLeaf({
    sourceCard,
    mode: 'place',
    kind,
    selectableTiles,
    maxSelections: 1,
    optional,
  })
}

export const buildMoorToFieldFlow = (
  sourceCard: string,
  player: PlayerState,
  optional = false,
): ActionFlow | undefined => {
  const selectableTiles = getMoorToFieldTiles(player)
  if (selectableTiles.length === 0) return
  return buildTerrainSelectionLeaf({
    sourceCard,
    mode: 'replace-with-field',
    fromKind: 'moor',
    selectableTiles,
    maxSelections: 1,
    optional,
  })
}

export const buildForestToMoorFlow = (
  sourceCard: string,
  player: PlayerState,
  maxSelections: number,
): ActionFlow | undefined => {
  const selectableTiles = getTerrainTiles(player, 'forest')
  if (selectableTiles.length === 0) return
  return buildTerrainSelectionLeaf({
    sourceCard,
    mode: 'replace-kind',
    fromKind: 'forest',
    toKind: 'moor',
    selectableTiles,
    minSelections: 0,
    maxSelections: Math.min(maxSelections, selectableTiles.length),
  })
}

export const buildRemoveTerrainFlow = (
  sourceCard: string,
  player: PlayerState,
  kind: FarmTerrainKind,
  options: {
    gainPerSelection?: Partial<Resource>
    bonusVpPerSelection?: number
  } = {},
): ActionFlow | undefined => {
  const selectableTiles = getTerrainTiles(player, kind)
  if (selectableTiles.length === 0) return
  return buildTerrainSelectionLeaf({
    sourceCard,
    mode: 'remove',
    kind,
    selectableTiles,
    minSelections: 0,
    maxSelections: selectableTiles.length,
    ...options,
  })
}

const removeTerrain = (
  player: PlayerState,
  tile: FarmTilePosition,
  kind: FarmTerrainKind,
): boolean => {
  const key = positionKey(tile)
  const index = (player.farmTerrain ?? []).findIndex((entry) =>
    positionKey(entry) === key && entry.kind === kind)
  if (index < 0) return false
  player.farmTerrain = player.farmTerrain!.filter((_, idx) => idx !== index)
  return true
}

const replaceTerrainKind = (
  player: PlayerState,
  tile: FarmTilePosition,
  fromKind: FarmTerrainKind,
  toKind: FarmTerrainKind,
): boolean => {
  const key = positionKey(tile)
  const entry = (player.farmTerrain ?? []).find((candidate) =>
    positionKey(candidate) === key && candidate.kind === fromKind)
  if (!entry) return false
  entry.kind = toKind
  return true
}

const addGain = (base: Partial<Resource>, next: Partial<Resource>, count: number): Partial<Resource> => {
  const out = { ...base }
  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== 'number' || value <= 0) continue
    const resource = key as keyof Resource
    out[resource] = (out[resource] ?? 0) + value * count
  }
  return out
}

const repeat = (count: number, factory: () => ActionFlow): ActionFlow[] =>
  Array.from({ length: Math.max(0, count) }, factory)

registerSelectionEffect(TERRAIN_SELECTION_EFFECT, ({ player, positions, sourceCard, actionContext }) => {
  const mode = actionContext?.terrainMode
  const kind = actionContext?.terrainKind
  const fromKind = actionContext?.terrainFromKind
  const toKind = actionContext?.terrainToKind
  if (typeof mode !== 'string') return
  const selected = parsePositions(positions)
  let changed = 0
  const used = mode === 'place' ? getUsedFarmyardTileKeys(player) : null

  for (const tile of selected) {
    if (mode === 'place' && isTerrainKind(kind)) {
      if (used?.has(positionKey(tile))) continue
      player.farmTerrain = [...(player.farmTerrain ?? []), { ...tile, kind }]
      used?.add(positionKey(tile))
      changed += 1
    } else if (mode === 'remove' && isTerrainKind(kind)) {
      if (removeTerrain(player, tile, kind)) changed += 1
    } else if (mode === 'replace-kind' && isTerrainKind(fromKind) && isTerrainKind(toKind)) {
      if (replaceTerrainKind(player, tile, fromKind, toKind)) changed += 1
    } else if (mode === 'replace-with-field' && isTerrainKind(fromKind)) {
      if (replaceTerrainWithField(player, tile, fromKind).ok) changed += 1
    }
  }

  const children: ActionFlow[] = []
  const gain = addGain({}, (actionContext?.gainPerSelection ?? {}) as Partial<Resource>, changed)
  if (Object.keys(gain).length > 0) {
    children.push({ type: 'leaf', actionId: 'gain', sourceCard, params: gain })
  }
  children.push(...repeat(Number(actionContext?.bonusVpPerSelection ?? 0) * changed, () => ({
    type: 'leaf' as const,
    actionId: 'bonus-vp',
    sourceCard,
  })))
  if (children.length === 0) return
  return children.length === 1 ? children[0] : { type: 'seq', children }
})

export const buildTerrainSelectionLeaf = (
  options: BuildTerrainSelectionLeafOptions,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'selection',
  sourceCard: options.sourceCard,
  optional: options.optional,
  actionContext: {
    selectionKind: 'farm-position',
    selectionEffect: TERRAIN_SELECTION_EFFECT,
    minSelections: options.minSelections ?? (options.optional ? 0 : 1),
    maxSelections: options.maxSelections ?? options.selectableTiles.length,
    selectableTiles: options.selectableTiles,
    terrainMode: options.mode,
    ...(options.kind ? { terrainKind: options.kind } : {}),
    ...(options.fromKind ? { terrainFromKind: options.fromKind } : {}),
    ...(options.toKind ? { terrainToKind: options.toKind } : {}),
    ...(options.allowedSelectionCounts ? { allowedSelectionCounts: options.allowedSelectionCounts } : {}),
    ...(options.gainPerSelection ? { gainPerSelection: options.gainPerSelection } : {}),
    ...(options.bonusVpPerSelection ? { bonusVpPerSelection: options.bonusVpPerSelection } : {}),
  },
})
