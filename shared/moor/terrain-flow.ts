import type { ActionFlow, ChoiceEffectPreview, FarmTerrainOperationMode, FarmTilePosition, PlayerState, Resource } from '../contract/types'
import {
  parsePositionKey,
  positionKey,
} from '../domain/farm'
import { commitFarmOperation } from '../domain/farm-operations'
import { getUnusedFarmyardTilePositions } from '../domain/farmyard-usage-core'
import { registerSelectionEffect, registerSelectionValidator } from '../actions/helpers/selection-effect-registry'
import {
  getVisibleFarmTerrain,
  getVisibleTerrainTiles,
  hasVisibleTerrainWithoutCovered,
  planTerrainOperation,
  terrainOperationEvent,
  type TerrainOperation,
} from './farm-terrain'
import type { FarmTerrainKind } from './types'

const TERRAIN_SELECTION_EFFECT = 'moor-terrain-flow'

type TerrainSelectionMode = FarmTerrainOperationMode

type BuildTerrainSelectionLeafOptions = {
  sourceCard: string
  mode: TerrainSelectionMode
  kind?: FarmTerrainKind
  fromKind?: FarmTerrainKind
  toKind?: FarmTerrainKind
  minSelections?: number
  maxSelections?: number
  allowedSelectionCounts?: number[]
  optional?: boolean
  gainPerSelection?: Partial<Resource>
  bonusVpPerSelection?: number
} & (
  | { selectableTiles: FarmTilePosition[] }
  | { mode: 'place'; kind: FarmTerrainKind; liveTerrainPlacement: true }
)

const isTerrainKind = (value: unknown): value is FarmTerrainKind =>
  value === 'forest' || value === 'moor'

export const describeTerrainSelection = (context?: Record<string, unknown>): ChoiceEffectPreview | undefined => {
  if (context?.selectionEffect !== TERRAIN_SELECTION_EFFECT) return
  const mode = context.terrainMode
  if (mode !== 'place' && mode !== 'remove' && mode !== 'replace-kind' && mode !== 'replace-with-field' && mode !== 'cover') return
  const from = context.terrainFromKind ?? context.terrainKind
  const to = mode === 'replace-with-field' ? 'field' : context.terrainToKind ?? (mode === 'place' ? context.terrainKind : undefined)
  const gainPerSelection: Partial<Resource> = {}
  const raw = context.gainPerSelection
  if (raw && typeof raw === 'object') for (const key of ['wood', 'clay', 'reed', 'stone', 'grain', 'vegetable', 'food', 'fuel', 'sheep', 'boar', 'cattle', 'horse'] as const) {
    const value = Reflect.get(raw, key)
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) gainPerSelection[key] = value
  }
  return { kind: 'terrainOperation', operation: mode,
    ...(isTerrainKind(from) ? { from } : {}), ...(isTerrainKind(to) || to === 'field' ? { to } : {}),
    minSelections: typeof context.minSelections === 'number' ? context.minSelections : 1,
    maxSelections: typeof context.maxSelections === 'number' ? context.maxSelections : 1,
    ...(Object.keys(gainPerSelection).length ? { gainPerSelection } : {}),
    ...(typeof context.bonusVpPerSelection === 'number' ? { bonusVpPerSelection: context.bonusVpPerSelection } : {}),
  }
}

const parsePositions = (positions: string[]): FarmTilePosition[] =>
  positions.flatMap((position) => {
    const parsed = parsePositionKey(position)
    return parsed ? [parsed] : []
  })

export const getTerrainTiles = (
  player: Pick<PlayerState, 'farmTerrain'>,
  kind?: FarmTerrainKind,
): FarmTilePosition[] => getVisibleTerrainTiles(player, kind)

export const getUnusedTerrainTiles = getUnusedFarmyardTilePositions

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

export const buildLivePlaceTerrainFlow = (sourceCard: string, kind: FarmTerrainKind): ActionFlow =>
  buildTerrainSelectionLeaf({ sourceCard, mode: 'place', kind, liveTerrainPlacement: true, maxSelections: 1 })

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

const terrainRequest = (positions: string[], actionContext?: Record<string, unknown>, sourceCard?: string): TerrainOperation | undefined => {
  const selected = parsePositions(positions)
  if (selected.length !== positions.length) return
  const mode = actionContext?.terrainMode
  const kind = actionContext?.terrainKind
  const fromKind = actionContext?.terrainFromKind
  const toKind = actionContext?.terrainToKind
  const base = { positions: selected, sourceCardId: sourceCard }
  if ((mode === 'place' || mode === 'remove') && isTerrainKind(kind)) return { ...base, mode, kind }
  if ((mode === 'replace-kind' || mode === 'cover') && isTerrainKind(fromKind) && isTerrainKind(toKind)) return { ...base, mode, fromKind, toKind }
  if (mode === 'replace-with-field' && isTerrainKind(fromKind)) return { ...base, mode, fromKind }
}

registerSelectionValidator(TERRAIN_SELECTION_EFFECT, ({ player, positions, actionContext, sourceCard }) => {
  const request = terrainRequest(positions, actionContext, sourceCard)
  if (!request || !planTerrainOperation(player, request).ok) return 'invalid terrain selection'
})

registerSelectionEffect(TERRAIN_SELECTION_EFFECT, ({ player, positions, sourceCard, actionContext, eventSink, recordFarmOperation }) => {
  const request = terrainRequest(positions, actionContext, sourceCard)
  if (!request) return
  const plan = planTerrainOperation(player, request)
  if (!plan.ok || plan.operation.changes.length === 0) return
  const receipt = commitFarmOperation(player, plan.operation, eventSink)
  if (receipt.kind !== 'terrain') throw new Error('Expected committed terrain operation')
  recordFarmOperation?.(receipt)
  eventSink?.emit(terrainOperationEvent(receipt))
  const changed = receipt.terrainChanges.length

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
): Extract<ActionFlow, { type: 'leaf' }> => ({
  type: 'leaf',
  actionId: 'selection',
  sourceCard: options.sourceCard,
  optional: options.optional,
  actionContext: {
    selectionKind: 'farm-position',
    selectionEffect: TERRAIN_SELECTION_EFFECT,
    minSelections: options.minSelections ?? (options.optional ? 0 : 1),
    maxSelections: options.maxSelections ?? ('selectableTiles' in options ? options.selectableTiles.length : 1),
    ...('selectableTiles' in options
      ? { selectableTiles: options.selectableTiles }
      : { liveTerrainPlacement: true }),
    terrainMode: options.mode,
    ...(options.kind ? { terrainKind: options.kind } : {}),
    ...(options.fromKind ? { terrainFromKind: options.fromKind } : {}),
    ...(options.toKind ? { terrainToKind: options.toKind } : {}),
    ...(options.allowedSelectionCounts ? { allowedSelectionCounts: options.allowedSelectionCounts } : {}),
    ...(options.gainPerSelection ? { gainPerSelection: options.gainPerSelection } : {}),
    ...(options.bonusVpPerSelection ? { bonusVpPerSelection: options.bonusVpPerSelection } : {}),
  },
})
