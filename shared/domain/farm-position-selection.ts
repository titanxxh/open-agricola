import type { FarmPositionSelectionTarget, FarmTilePosition, PlayerState } from '../contract/types'
import { positionKey } from './farm'
import { getUsedFarmyardTileKeys } from './farmyard-usage-core'

export type FarmPositionSelectionRequest = {
  selectablePositions: FarmPositionSelectionTarget[]
  minSelections: number
  maxSelections?: number
  allowedSelectionCounts?: number[]
  validPositionGroups?: FarmTilePosition[][]
  hasConstraints: boolean
  blockedPositionKeys?: ReadonlySet<string>
}

type Failure = { ok: false; error: string }

export const parseFarmPositionKey = (key: string): FarmTilePosition | null => {
  const match = /^(-?\d+)-(-?\d+)$/.exec(key)
  if (!match) return null
  const row = Number(match[1])
  const col = Number(match[2])
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return { row, col }
}

const normalizePosition = (input: unknown): FarmPositionSelectionTarget | null => {
  const target = input as {
    row?: unknown
    col?: unknown
    sourceCard?: unknown
    groupKey?: unknown
    cardFieldSlot?: unknown
  } | null
  const row = Number(target?.row)
  const col = Number(target?.col)
  const cardFieldSlot = target?.cardFieldSlot
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null
  return {
    row,
    col,
    ...(typeof target?.sourceCard === 'string' ? { sourceCard: target.sourceCard } : {}),
    ...(typeof target?.groupKey === 'string' ? { groupKey: target.groupKey } : {}),
    ...(typeof cardFieldSlot === 'number' && Number.isInteger(cardFieldSlot) ? { cardFieldSlot } : {}),
  }
}

const normalizePositions = (input: unknown): FarmPositionSelectionTarget[] => {
  if (!Array.isArray(input)) return []
  return input.flatMap((position) => {
    const normalized = normalizePosition(position)
    return normalized ? [normalized] : []
  })
}

const normalizePositionGroups = (input: unknown): FarmTilePosition[][] | undefined => {
  if (!Array.isArray(input)) return undefined
  const groups = input.flatMap((group) => {
    const positions = normalizePositions(group)
    return positions.length > 0 ? [positions] : []
  })
  return groups.length > 0 ? groups : undefined
}

const normalizeAllowedSelectionCounts = (input: unknown): number[] | undefined => {
  if (!Array.isArray(input)) return undefined
  const counts = input.filter((count): count is number =>
    typeof count === 'number' && Number.isInteger(count),
  )
  return counts.length > 0 ? counts : undefined
}

const fieldPositionsForFilter = (
  player: PlayerState,
  filter: string | undefined,
): FarmTilePosition[] =>
  player.fields
    .filter((field) => {
      const top = field.stacks[field.stacks.length - 1]
      if (!filter) return true
      if (filter === 'has-vegetable') return top?.kind === 'vegetable' && top.remaining > 0
      if (filter === 'has-grain') return top?.kind === 'grain' && top.remaining > 0
      if (filter === 'has-crop') return !!top && top.remaining > 0
      if (filter === 'has-exactly-1-crop') return !!top && top.remaining === 1
      if (filter === 'has-2-plus-crops') return !!top && top.remaining >= 2
      if (filter === 'empty-plowed') return field.stacks.length === 0
      if (filter === 'empty') return field.stacks.length === 0
      return !!top && top.remaining > 0
    })
    .map((field) => ({ row: field.row, col: field.col }))

export const buildFarmPositionSelectionRequest = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): FarmPositionSelectionRequest => {
  const explicitSelectablePositions = Array.isArray(actionContext?.selectableTiles)
    ? normalizePositions(actionContext.selectableTiles)
    : null
  const selectablePositions = explicitSelectablePositions ??
    fieldPositionsForFilter(player, actionContext?.positionFilter as string | undefined)
  const minSelections =
    typeof actionContext?.minSelections === 'number' ? actionContext.minSelections : 1
  const maxSelections =
    typeof actionContext?.maxSelections === 'number' ? actionContext.maxSelections : undefined
  const allowedSelectionCounts = normalizeAllowedSelectionCounts(actionContext?.allowedSelectionCounts)
  const validPositionGroups = normalizePositionGroups(actionContext?.validPositionGroups)
  return {
    selectablePositions,
    minSelections,
    ...(maxSelections !== undefined ? { maxSelections } : {}),
    ...(allowedSelectionCounts ? { allowedSelectionCounts } : {}),
    ...(validPositionGroups ? { validPositionGroups } : {}),
    hasConstraints:
      actionContext?.minSelections !== undefined ||
      actionContext?.maxSelections !== undefined ||
      actionContext?.positionFilter !== undefined ||
      Array.isArray(actionContext?.selectableTiles),
    ...(actionContext?.terrainMode === 'place'
      ? { blockedPositionKeys: getUsedFarmyardTileKeys(player) }
      : {}),
  }
}

export const validateFarmPositionSelection = (input: {
  request: FarmPositionSelectionRequest
  positions: readonly (FarmTilePosition | string)[]
  validateEffect?: (positionStrings: string[]) => string | null | undefined
}): Failure | { ok: true; positionStrings: string[] } => {
  const { request } = input
  const positions: FarmTilePosition[] = []
  for (const position of input.positions) {
    const normalized = typeof position === 'string' ? parseFarmPositionKey(position) : position
    if (!normalized) return { ok: false, error: 'invalid selection position' }
    positions.push(normalized)
  }
  const selectedKeys = new Set<string>()
  for (const position of positions) {
    if (!Number.isInteger(position.row) || !Number.isInteger(position.col)) {
      return { ok: false, error: 'invalid selection position' }
    }
    const key = positionKey(position)
    if (selectedKeys.has(key)) return { ok: false, error: 'duplicate selection position' }
    selectedKeys.add(key)
    if (request.blockedPositionKeys?.has(key)) return { ok: false, error: 'invalid selection position' }
  }

  const selectableByKey = new Map(request.selectablePositions.map((position) => [positionKey(position), position]))
  for (const position of positions) {
    if (!selectableByKey.has(positionKey(position))) return { ok: false, error: 'invalid selection position' }
  }

  const selectedGroups = new Set<string>()
  const canonicalPositions: FarmTilePosition[] = []
  for (const position of positions) {
    const key = positionKey(position)
    const groupKey = selectableByKey.get(key)?.groupKey ?? key
    if (selectedGroups.has(groupKey)) continue
    selectedGroups.add(groupKey)
    canonicalPositions.push(position)
  }

  if (canonicalPositions.length < request.minSelections) {
    return { ok: false, error: 'not enough selection positions' }
  }
  if (request.maxSelections !== undefined && canonicalPositions.length > request.maxSelections) {
    return { ok: false, error: 'too many selection positions' }
  }

  if (
    request.allowedSelectionCounts &&
    !request.allowedSelectionCounts.includes(canonicalPositions.length)
  ) {
    return { ok: false, error: 'invalid selection count' }
  }

  if (request.validPositionGroups && request.validPositionGroups.length > 0) {
    const validGroups = request.validPositionGroups.map((group) =>
      group.map(positionKey).sort().join('|'),
    )
    const selectedGroup = canonicalPositions.map(positionKey).sort().join('|')
    if (!validGroups.includes(selectedGroup)) return { ok: false, error: 'invalid selection position' }
  }

  const positionStrings = canonicalPositions.map(positionKey)
  const effectError = input.validateEffect?.(positionStrings)
  if (effectError) return { ok: false, error: effectError }
  return { ok: true, positionStrings }
}
