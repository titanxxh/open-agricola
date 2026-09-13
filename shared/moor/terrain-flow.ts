import type { ActionFlow, FarmTilePosition, PlayerState, Resource } from '../contract/types'
import {
  getFarmyardTilePositions,
  isWithinFarmyard,
  parsePositionKey,
  positionKey,
} from '../domain/farm'
import { getUsedFarmyardTileKeys } from '../domain/farmyard-usage'
import { getPlacementBlockedFarmyardSpaceKeys } from '../domain/farmyard-space-states'
import { registerSelectionEffect, registerSelectionValidator } from '../actions/helpers/selection-effect-registry'
import {
  coverVisibleTerrain,
  getVisibleFarmTerrain,
  getVisibleTerrainTiles,
  hasVisibleTerrainWithoutCovered,
  removeVisibleTerrain,
  replaceTerrainWithField,
} from './farm-terrain'
import type { FarmTerrainKind } from './types'

const TERRAIN_SELECTION_EFFECT = 'moor-terrain-flow'

type TerrainSelectionMode = 'place' | 'remove' | 'replace-kind' | 'replace-with-field' | 'cover'

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
): FarmTilePosition[] => getVisibleTerrainTiles(player, kind)

export const getUnusedTerrainTiles = (player: PlayerState): FarmTilePosition[] => {
  const used = getUsedFarmyardTileKeys(player)
  const blocked = getPlacementBlockedFarmyardSpaceKeys(player)
  return getFarmyardTilePositions(player).filter((tile) => {
    const key = positionKey(tile)
    return !used.has(key) && !blocked.has(key)
  })
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
  const selectableTiles = getTerrainTiles(player, 'forest').filter((tile) =>
    hasVisibleTerrainWithoutCovered(player, tile, 'forest'))
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

export const buildCoverTerrainFlow = (
  sourceCard: string,
  player: PlayerState,
  fromKind: FarmTerrainKind,
  toKind: FarmTerrainKind,
  maxSelections?: number,
): ActionFlow | undefined => {
  const selectableTiles = getTerrainTiles(player, fromKind).filter((tile) =>
    getVisibleFarmTerrain(player, tile)?.covered === undefined)
  if (selectableTiles.length === 0) return
  return buildTerrainSelectionLeaf({
    sourceCard,
    mode: 'cover',
    fromKind,
    toKind,
    selectableTiles,
    minSelections: 0,
    maxSelections: Math.min(maxSelections ?? selectableTiles.length, selectableTiles.length),
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
  return removeVisibleTerrain(player, tile, kind).ok
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
  if (!entry || entry.covered !== undefined) return false
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

registerSelectionValidator(TERRAIN_SELECTION_EFFECT, ({ player, positions, actionContext }) => {
  if (actionContext?.terrainMode !== 'replace-kind' || !isTerrainKind(actionContext.terrainFromKind)) return
  const kind = actionContext.terrainFromKind
  if (parsePositions(positions).some((tile) => !hasVisibleTerrainWithoutCovered(player, tile, kind))) {
    return 'invalid terrain selection'
  }
})

registerSelectionEffect(TERRAIN_SELECTION_EFFECT, ({ player, positions, sourceCard, actionContext }) => {
  const mode = actionContext?.terrainMode
  const kind = actionContext?.terrainKind
  const fromKind = actionContext?.terrainFromKind
  const toKind = actionContext?.terrainToKind
  if (typeof mode !== 'string') return
  const selected = parsePositions(positions)
  let changed = 0
  const used = mode === 'place' ? getUsedFarmyardTileKeys(player) : null
  const blocked = mode === 'place' ? getPlacementBlockedFarmyardSpaceKeys(player) : null

  for (const tile of selected) {
    if (mode === 'place' && isTerrainKind(kind)) {
      const key = positionKey(tile)
      if (!isWithinFarmyard(player, tile)) continue
      if (used?.has(key) || blocked?.has(key)) continue
      player.farmTerrain = [...(player.farmTerrain ?? []), { ...tile, kind }]
      used?.add(key)
      changed += 1
    } else if (mode === 'remove' && isTerrainKind(kind)) {
      if (removeTerrain(player, tile, kind)) changed += 1
    } else if (mode === 'replace-kind' && isTerrainKind(fromKind) && isTerrainKind(toKind)) {
      if (replaceTerrainKind(player, tile, fromKind, toKind)) changed += 1
    } else if (mode === 'replace-with-field' && isTerrainKind(fromKind)) {
      if (replaceTerrainWithField(player, tile, fromKind).ok) changed += 1
    } else if (mode === 'cover' && isTerrainKind(fromKind) && isTerrainKind(toKind)) {
      if (coverVisibleTerrain(player, tile, fromKind, toKind)) changed += 1
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
