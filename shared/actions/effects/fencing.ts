import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionMutationContext,
  ActionSpace,
  Bonus,
  ComplexCost,
  FenceSegment,
  FenceSegmentType,
  GameState,
  PaymentResourceMap,
  PlayerState,
  Resource,
  Trade,
} from '../../contract/types'
// PaymentSolver namespace (S3 Task 7b): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// fencing.ts only uses typed-flat helpers (shim scope), so no PaymentSolver
// call sites exist here yet.
import {
  canAffordTypedFlatCost,
  resolveTypedFlatPaymentSelection,
} from '../payment/internal/typed-flat'
import { buildInternalPayChild } from '../helpers/pay-child'
import { getAllEdgeIds, playerBoard, normalizePlayerFarm } from '../../domain'
import { FARM_COLS, FARM_ROWS, isBorderEdge } from '../../domain/farm'
import type {
  FenceCostPolicy,
  FencePastureBounds,
  FenceSegmentBounds,
  FenceSourcePolicy,
  FenceValidationOptions,
} from '../../domain/farmyard'
import {
  borrowedFenceDonorCapTotal,
  isBorrowedFenceSourcePolicy,
} from '../../domain/farmyard'
import {
  MAX_ORDINARY_FENCE_PIECES,
  getOwnOrdinaryFenceCount,
} from '../../domain/fence-segments'
import {
  getOwnOrdinaryFenceBuildLimit,
  getOwnOrdinaryFenceReserveCount,
  addConsumedSupplyTokenCount,
} from '../../domain/supply-tokens'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import { collectFarmChoiceCostAdjustments } from '../../cards/card-listeners'
import { playerCanBuildPalisades } from '../../cards/helpers/card-type'
import {
  consumePendingFenceBonus,
  readPendingFenceBonus,
} from '../../cards/helpers/pending-fence-bonus'
import { isThroughTheSeasonsSeason } from '../../seasons/rules'

export const maxFences = MAX_ORDINARY_FENCE_PIECES
export const maxPastureCells = 15
export const stableWoodCost = 2
export const minimumFenceSegments = 4

export type FenceActionPolicy = {
  allowedSegmentTypes?: FenceSegmentType[]
  sourcePolicy?: FenceSourcePolicy
  segmentBounds?: FenceSegmentBounds
  newPastureBounds?: FencePastureBounds
  costPolicy?: FenceCostPolicy
  paymentBudget?: PaymentResourceMap
  pastureBounds?: FenceValidationOptions['pastureBounds']
  cancelPolicy?: 'allowCancel' | 'forbidCancel'
  preserveAnimalTotals?: boolean
  promptHintKey?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFenceSegmentType = (value: unknown): value is FenceSegmentType =>
  value === 'fence' || value === 'palisade'

const readBorrowedDonorCaps = (value: unknown): Record<string, number> | undefined => {
  if (!isRecord(value)) return undefined
  const result: Record<string, number> = {}
  for (const [donorId, cap] of Object.entries(value)) {
    if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 0) continue
    result[donorId] = cap
  }
  return result
}

const readFenceSourcePolicy = (value: unknown): FenceSourcePolicy | undefined => {
  if (value === 'ownOnly') return 'ownOnly'
  if (!isRecord(value) || value.kind !== 'borrowed') return undefined
  const donorCaps = readBorrowedDonorCaps(value.donorCaps)
  if (!donorCaps) return undefined
  return { kind: 'borrowed', donorCaps }
}

const readPaymentBudget = (value: unknown): PaymentResourceMap | undefined => {
  if (!isRecord(value)) return undefined
  const result: PaymentResourceMap = {}
  for (const [key, amount] of Object.entries(value)) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) continue
    result[key as keyof PaymentResourceMap] = amount
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export function readFenceActionPolicy(
  actionContext: Record<string, unknown> | undefined,
): FenceActionPolicy {
  if (!actionContext) return {}
  if (!isRecord(actionContext.fencePolicy)) return {}
  const source = actionContext.fencePolicy
  const allowedSegmentTypes = Array.isArray(source.allowedSegmentTypes)
    ? source.allowedSegmentTypes.filter(isFenceSegmentType)
    : undefined
  return {
    allowedSegmentTypes:
      allowedSegmentTypes && allowedSegmentTypes.length > 0
        ? allowedSegmentTypes
        : undefined,
    sourcePolicy: readFenceSourcePolicy(source.sourcePolicy),
    segmentBounds: isRecord(source.segmentBounds)
      ? (source.segmentBounds as FenceSegmentBounds)
      : undefined,
    newPastureBounds: isRecord(source.newPastureBounds)
      ? (source.newPastureBounds as FencePastureBounds)
      : undefined,
    costPolicy: isRecord(source.costPolicy)
      ? (source.costPolicy as FenceCostPolicy)
      : undefined,
    paymentBudget: readPaymentBudget(source.paymentBudget),
    pastureBounds: isRecord(source.pastureBounds)
      ? (source.pastureBounds as FenceValidationOptions['pastureBounds'])
      : undefined,
    cancelPolicy:
      source.cancelPolicy === 'allowCancel' ||
      source.cancelPolicy === 'forbidCancel'
        ? source.cancelPolicy
        : undefined,
    preserveAnimalTotals:
      typeof source.preserveAnimalTotals === 'boolean'
        ? source.preserveAnimalTotals
        : undefined,
    promptHintKey:
      typeof source.promptHintKey === 'string'
        ? source.promptHintKey
        : undefined,
  }
}

const hasFenceActionPolicy = (policy: FenceActionPolicy): boolean =>
  policy.allowedSegmentTypes !== undefined ||
  policy.sourcePolicy !== undefined ||
  policy.segmentBounds !== undefined ||
  policy.newPastureBounds !== undefined ||
  policy.costPolicy !== undefined ||
  policy.paymentBudget !== undefined ||
  policy.pastureBounds !== undefined ||
  policy.cancelPolicy !== undefined ||
  policy.preserveAnimalTotals !== undefined

const hasCanStartPolicy = (policy: FenceActionPolicy): boolean =>
  policy.sourcePolicy !== undefined ||
  policy.segmentBounds !== undefined ||
  policy.newPastureBounds !== undefined ||
  policy.costPolicy !== undefined ||
  policy.paymentBudget !== undefined ||
  policy.pastureBounds !== undefined

const borrowedPolicyWithCurrentCaps = (
  state: GameState,
  activePlayer: PlayerState,
  policy: FenceActionPolicy,
): FenceActionPolicy => {
  if (!isBorrowedFenceSourcePolicy(policy.sourcePolicy)) return policy
  const donorCaps: Record<string, number> = {}
  for (const [donorId, cap] of Object.entries(policy.sourcePolicy.donorCaps)) {
    const donor = state.players.find((candidate) => candidate.id === donorId)
    donorCaps[donorId] = donor && donor.id !== activePlayer.id
      ? Math.min(cap, getOwnOrdinaryFenceReserveCount(donor))
      : 0
  }
  return { ...policy, sourcePolicy: { kind: 'borrowed', donorCaps } }
}

const sourceOrdinaryCapacity = (
  player: PlayerState,
  policy: FenceActionPolicy,
  selectedFreeFences: number,
): number => {
  if (isBorrowedFenceSourcePolicy(policy.sourcePolicy)) {
    return borrowedFenceDonorCapTotal(policy.sourcePolicy)
  }
  const remainingBuildCapacity = Math.max(
    0,
    getOwnOrdinaryFenceBuildLimit(player) - getOwnOrdinaryFenceCount(player),
  )
  const availableOrdinaryFenceTokens =
    getOwnOrdinaryFenceReserveCount(player) + selectedFreeFences
  return Math.min(remainingBuildCapacity, availableOrdinaryFenceTokens)
}

const buildBorrowedFenceSourcesForEdges = (
  policy: FenceActionPolicy,
  edges: string[],
): Record<string, string> | undefined => {
  if (!isBorrowedFenceSourcePolicy(policy.sourcePolicy)) return undefined
  const result: Record<string, string> = {}
  let donorIndex = 0
  const donors = Object.entries(policy.sourcePolicy.donorCaps)
    .filter(([, cap]) => cap > 0)
    .flatMap(([donorId, cap]) => Array.from({ length: cap }, () => donorId))
  for (const edge of edges) {
    const donorId = donors[donorIndex]
    if (!donorId) return undefined
    result[edge] = donorId
    donorIndex += 1
  }
  return result
}

const minPerimeterForFarmCells = (cellCount: number): number => {
  if (cellCount <= 0) return 0
  let best = Number.POSITIVE_INFINITY
  for (let rows = 1; rows <= FARM_ROWS; rows += 1) {
    for (let cols = 1; cols <= FARM_COLS; cols += 1) {
      if (rows * cols >= cellCount) {
        best = Math.min(best, 2 * (rows + cols))
      }
    }
  }
  return Number.isFinite(best) ? best : minimumFenceSegments
}

const minOrdinaryPerimeterForFarmCells = (cellCount: number): number => {
  if (cellCount <= 0) return 0
  let best = Number.POSITIVE_INFINITY
  for (let rows = 1; rows <= FARM_ROWS; rows += 1) {
    for (let cols = 1; cols <= FARM_COLS; cols += 1) {
      if (rows * cols >= cellCount) {
        best = Math.min(best, rows + cols)
      }
    }
  }
  return Number.isFinite(best) ? best : 0
}

const inferMinimumPolicySegments = (policy: FenceActionPolicy): number => {
  const segmentBounds = policy.segmentBounds
  const hasSegmentMin =
    segmentBounds?.fence?.min !== undefined ||
    segmentBounds?.palisade?.min !== undefined ||
    segmentBounds?.total?.min !== undefined
  if (hasSegmentMin) {
    return Math.max(
      segmentBounds?.total?.min ?? 0,
      (segmentBounds?.fence?.min ?? 0) + (segmentBounds?.palisade?.min ?? 0),
    )
  }
  const minPastureSize =
    policy.newPastureBounds?.totalSize?.min ??
    policy.pastureBounds?.newPastureSize?.min
  if (minPastureSize !== undefined) {
    return minPerimeterForFarmCells(minPastureSize)
  }
  const maxTotal = segmentBounds?.total?.max
  if (maxTotal !== undefined) {
    return 1
  }
  return minimumFenceSegments
}

const inferMinimumPolicyOrdinarySegments = (policy: FenceActionPolicy): number => {
  const minPastureSize =
    policy.newPastureBounds?.totalSize?.min ??
    policy.pastureBounds?.newPastureSize?.min
  if (minPastureSize !== undefined) {
    return minOrdinaryPerimeterForFarmCells(minPastureSize)
  }
  return 0
}

const canStartWithFencePolicy = (
  player: PlayerState,
  policy: FenceActionPolicy,
  ordinaryCapacity: number,
  selectedFreeFences: number,
  costOverride?: Partial<Resource>,
): boolean => {
  const segmentBounds = policy.segmentBounds
  const minTotal = inferMinimumPolicySegments(policy)
  const maxTotal = segmentBounds?.total?.max ?? minTotal
  if (minTotal > maxTotal) return false
  const allowedFence =
    !policy.allowedSegmentTypes || policy.allowedSegmentTypes.includes('fence')
  const allowedPalisade =
    (!policy.allowedSegmentTypes || policy.allowedSegmentTypes.includes('palisade')) &&
    playerCanBuildPalisades(player)
  const minFence = segmentBounds?.fence?.min ?? 0
  const minOrdinaryForPasture = allowedPalisade
    ? inferMinimumPolicyOrdinarySegments(policy)
    : 0
  const minOrdinary = Math.max(minFence, minOrdinaryForPasture)
  const minPalisade = segmentBounds?.palisade?.min ?? 0
  if ((minFence > 0 && !allowedFence) || (minPalisade > 0 && !allowedPalisade)) {
    return false
  }
  const maxFence = Math.min(
    allowedFence ? ordinaryCapacity : 0,
    segmentBounds?.fence?.max ?? maxTotal,
  )
  const maxPalisade = Math.min(
    allowedPalisade ? 2 * (FARM_ROWS + FARM_COLS) : 0,
    segmentBounds?.palisade?.max ?? maxTotal,
  )
  const fenceWoodCost = policy.costPolicy?.fence?.wood ?? 1
  const palisadeWoodCost = policy.costPolicy?.palisade?.wood ?? 2
  const fixedWoodCost = Math.max(0, policy.costPolicy?.fixedWood ?? 0)
  const costFreeFences = selectedFreeFences

  for (let ordinary = minOrdinary; ordinary <= maxFence; ordinary += 1) {
    for (let palisade = minPalisade; palisade <= maxPalisade; palisade += 1) {
      const total = ordinary + palisade
      if (total < minTotal || total > maxTotal) continue
      const payableFenceCount = Math.max(0, ordinary - costFreeFences)
      const payableFenceWoodCost = applyWoodCostOverride(
        payableFenceCount * fenceWoodCost,
        costOverride,
      )
      const woodCost =
        payableFenceWoodCost +
        palisade * palisadeWoodCost +
        fixedWoodCost
      const cost: ComplexCost = { fee: { wood: woodCost } }
      if (policy.paymentBudget) cost.paymentBudget = policy.paymentBudget
      if (canAffordTypedFlatCost(player, cost, 'fencing')) {
        return true
      }
    }
  }
  return false
}

const farmTiles = (): Array<{ row: number; col: number }> => {
  const tiles: Array<{ row: number; col: number }> = []
  for (let row = 0; row < FARM_ROWS; row += 1) {
    for (let col = 0; col < FARM_COLS; col += 1) {
      tiles.push({ row, col })
    }
  }
  return tiles
}

const perimeterEdges = (tiles: Array<{ row: number; col: number }>): string[] => {
  const keys = new Set(tiles.map((tile) => `${tile.row}-${tile.col}`))
  const edges = new Set<string>()
  tiles.forEach((tile) => {
    if (!keys.has(`${tile.row - 1}-${tile.col}`)) edges.add(`H-${tile.row}-${tile.col}`)
    if (!keys.has(`${tile.row + 1}-${tile.col}`)) edges.add(`H-${tile.row + 1}-${tile.col}`)
    if (!keys.has(`${tile.row}-${tile.col - 1}`)) edges.add(`V-${tile.row}-${tile.col}`)
    if (!keys.has(`${tile.row}-${tile.col + 1}`)) edges.add(`V-${tile.row}-${tile.col + 1}`)
  })
  return Array.from(edges)
}

const connected = (tiles: Array<{ row: number; col: number }>): boolean => {
  if (tiles.length <= 1) return true
  const remaining = new Set(tiles.map((tile) => `${tile.row}-${tile.col}`))
  const stack = [tiles[0]!]
  remaining.delete(`${tiles[0]!.row}-${tiles[0]!.col}`)
  while (stack.length > 0) {
    const tile = stack.pop()!
    for (const next of [
      { row: tile.row - 1, col: tile.col },
      { row: tile.row + 1, col: tile.col },
      { row: tile.row, col: tile.col - 1 },
      { row: tile.row, col: tile.col + 1 },
    ]) {
      const key = `${next.row}-${next.col}`
      if (!remaining.delete(key)) continue
      stack.push(next)
    }
  }
  return remaining.size === 0
}

const connectedTileSetCache = new Map<number, Array<Array<{ row: number; col: number }>>>()

const connectedTileSets = (size: number): Array<Array<{ row: number; col: number }>> => {
  const cached = connectedTileSetCache.get(size)
  if (cached) return cached
  const all = farmTiles()
  const results: Array<Array<{ row: number; col: number }>> = []
  const choose = (start: number, picked: Array<{ row: number; col: number }>) => {
    if (picked.length === size) {
      if (connected(picked)) results.push([...picked])
      return
    }
    for (let index = start; index < all.length; index += 1) {
      picked.push(all[index]!)
      choose(index + 1, picked)
      picked.pop()
    }
  }
  choose(0, [])
  connectedTileSetCache.set(size, results)
  return results
}

const candidatePastureSizes = (policy: FenceActionPolicy): number[] => {
  const hasPastureSizeBound =
    policy.newPastureBounds?.totalSize?.min !== undefined ||
    policy.newPastureBounds?.totalSize?.max !== undefined ||
    policy.pastureBounds?.newPastureSize?.min !== undefined ||
    policy.pastureBounds?.newPastureSize?.max !== undefined
  const min =
    policy.newPastureBounds?.totalSize?.min ??
    policy.pastureBounds?.newPastureSize?.min ??
    1
  const max =
    policy.newPastureBounds?.totalSize?.max ??
    policy.pastureBounds?.newPastureSize?.max ??
    (hasPastureSizeBound ? min : FARM_ROWS * FARM_COLS)
  const sizes: number[] = []
  for (let size = Math.max(1, min); size <= Math.min(max, FARM_ROWS * FARM_COLS); size += 1) {
    sizes.push(size)
  }
  return sizes
}

const boardForPlayer = (state: GameState, player: PlayerState) => {
  const idx = state.players.indexOf(player)
  if (idx >= 0) return playerBoard(state, idx)
  return playerBoard({ ...state, players: [player] }, 0)
}

const candidateFenceSpecs = (
  perimeter: string[],
  player: PlayerState,
  policy: FenceActionPolicy,
): Array<{ edges: string[]; palisadeEdges: string[] }> => {
  const existing = new Set((player.fenceSegments ?? []).map((segment) => segment.edge))
  const existingPerimeter = perimeter.filter((edge) => existing.has(edge))
  const newPerimeter = perimeter.filter((edge) => !existing.has(edge))
  const allowsFence =
    !policy.allowedSegmentTypes || policy.allowedSegmentTypes.includes('fence')
  const allowsPalisade =
    (!policy.allowedSegmentTypes || policy.allowedSegmentTypes.includes('palisade')) &&
    playerCanBuildPalisades(player)
  const specs: Array<{ edges: string[]; palisadeEdges: string[] }> = []
  if (allowsFence) specs.push({ edges: perimeter, palisadeEdges: [] })
  if (!allowsPalisade) return specs

  const borderNew = newPerimeter.filter(isBorderEdge)
  for (let palisadeCount = 1; palisadeCount <= borderNew.length; palisadeCount += 1) {
    const palisadeSet = new Set(borderNew.slice(0, palisadeCount))
    const ordinaryEdges = newPerimeter.filter((edge) => !palisadeSet.has(edge))
    if (ordinaryEdges.length > 0 && !allowsFence) continue
    specs.push({
      edges: [...existingPerimeter, ...ordinaryEdges],
      palisadeEdges: [...palisadeSet],
    })
  }
  return specs
}

const hasPossibleFenceCommit = (
  state: GameState,
  player: PlayerState,
  policy: FenceActionPolicy,
): boolean => {
  const board = boardForPlayer(state, player)
  const freeFences = readPendingFenceBonus(player)?.freeFences ?? 0
  const options = fenceValidationOptions(player, playerCanBuildPalisades(player), policy)
  const lockedKeys = collectLockedFarmTileKeys(player)
  const existing = new Set((player.fenceSegments ?? []).map((segment) => segment.edge))
  const allEdgeIds = new Set(getAllEdgeIds())
  for (const size of candidatePastureSizes(policy)) {
    for (const tiles of connectedTileSets(size)) {
      const perimeter = perimeterEdges(tiles).filter((edge) => allEdgeIds.has(edge))
      if (perimeter.every((edge) => existing.has(edge))) continue
      for (const spec of candidateFenceSpecs(perimeter, player, policy)) {
        const newFenceEdges = spec.edges.filter((edge) => !existing.has(edge))
        const fenceSources = buildBorrowedFenceSourcesForEdges(policy, newFenceEdges)
        const result = board.farmyard.canBuildFence({
          ...spec,
          fenceSources,
          extraWood: 0,
          freeFences,
          options,
          lockedKeys,
        })
        if (result.ok) return true
      }
    }
  }
  return false
}

const fenceValidationOptions = (
  player: PlayerState,
  allowPalisades: boolean,
  policy: FenceActionPolicy,
  fenceSources?: Record<string, string>,
): FenceValidationOptions => {
  const selectedFreeFences = readPendingFenceBonus(player)?.freeFences ?? 0
  const borrowedCapacity = isBorrowedFenceSourcePolicy(policy.sourcePolicy)
    ? borrowedFenceDonorCapTotal(policy.sourcePolicy)
    : undefined
  return {
    skipPayment: true,
    allowPalisades,
    allowedSegmentTypes: policy.allowedSegmentTypes,
    sourcePolicy: policy.sourcePolicy,
    segmentBounds: policy.segmentBounds,
    newPastureBounds: policy.newPastureBounds,
    costPolicy: policy.costPolicy,
    pastureBounds: policy.pastureBounds,
    preserveAnimalTotals: policy.preserveAnimalTotals,
    ordinaryFenceBuildLimit: borrowedCapacity ?? getOwnOrdinaryFenceBuildLimit(player),
    availableOrdinaryFenceTokens:
      borrowedCapacity ?? getOwnOrdinaryFenceReserveCount(player) + selectedFreeFences,
    fenceSources,
  }
}

const fenceFail = (
  errorKey: string,
  policy?: FenceActionPolicy,
): ActionExecutionResult =>
  policy && hasFenceActionPolicy(policy)
    ? { type: 'fail', errorKey, recoverable: true }
    : { type: 'fail', errorKey }

const applyWoodCostOverride = (
  woodCost: number,
  costOverride?: Partial<Resource>,
): number => Math.max(0, woodCost + (costOverride?.wood ?? 0))

export { getFenceCount, getPalisadeCount } from '../../domain/fence-segments'

export const getTotalPastureCells = (player: PlayerState) =>
  player.pastures.reduce((sum, pasture) => sum + pasture.size, 0)

export const canStartFencing = (
  state: GameState,
  player: PlayerState,
  costOverride?: Partial<Resource>,
  actionContext?: Record<string, unknown>,
) => {
  const policy = borrowedPolicyWithCurrentCaps(
    state,
    player,
    readFenceActionPolicy(actionContext),
  )
  const selectedFreeFences = readPendingFenceBonus(player)?.freeFences ?? 0
  const ordinaryCapacity = sourceOrdinaryCapacity(player, policy, selectedFreeFences)
  const canCheckLayout = Array.isArray(state.players) && state.players.length > 0
  if (hasCanStartPolicy(policy)) {
    if (!canStartWithFencePolicy(
      player,
      policy,
      ordinaryCapacity,
      selectedFreeFences,
      costOverride,
    )) {
      return false
    }
    return !canCheckLayout || hasPossibleFenceCommit(state, player, policy)
  }
  if (ordinaryCapacity < minimumFenceSegments) {
    return false
  }
  if (getTotalPastureCells(player) >= maxPastureCells) return false
  const free = selectedFreeFences + Math.max(0, -(costOverride?.wood ?? 0))
  if (free > 0) {
    const woodCount = player.resources.wood ?? 0
    if (woodCount + free >= minimumFenceSegments) {
      return !canCheckLayout || hasPossibleFenceCommit(state, player, policy)
    }
  }
  const minimumWoodCost = applyWoodCostOverride(minimumFenceSegments, costOverride)
  if (!canAffordTypedFlatCost(player, { wood: minimumWoodCost }, 'fencing')) {
    return false
  }
  return !canCheckLayout || hasPossibleFenceCommit(state, player, policy)
}

type FencePayload = {
  edges?: string[]
  palisadeEdges?: string[]
  extraWood?: number
  fenceSources?: Record<string, string>
}

const applyPlayerMutation = (target: PlayerState, source: PlayerState) => {
  for (const key of Object.keys(target) as Array<keyof PlayerState>) {
    if (!(key in source)) {
      delete (target as Record<string, unknown>)[key as string]
    }
  }
  Object.assign(target, source)
}

const positiveResources = (resources: Partial<Resource>): Partial<Resource> => {
  const result: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    result[key as keyof Resource] = value
  })
  return result
}

const computeFenceCostAdjustment = (
  state: GameState,
  player: PlayerState,
  newFenceEdges: string[],
  newPalisadeEdges: string[],
  space: ActionSpace | undefined,
  policy: FenceActionPolicy,
): {
  freeFences: number
  extraWood: number
  trades: Trade[]
  bonuses: Bonus[]
  paymentResourceProviders: ComplexCost['paymentResourceProviders']
} => {
  const pendingFreeFences = readPendingFenceBonus(player)?.freeFences ?? 0
  const fenceOverride = collectFarmChoiceCostAdjustments(
    state,
    player,
    'fence',
    { newFenceEdges, newPalisadeEdges },
    space,
  )
  const hookWood = fenceOverride.costs.wood ?? 0
  const hookFreeFences = Math.max(0, -hookWood)
  const springFreeFences = computeSpringFreeFences(
    state,
    player,
    newFenceEdges,
    policy,
    pendingFreeFences + hookFreeFences,
    Math.max(0, hookWood),
  )
  return {
    freeFences: pendingFreeFences + hookFreeFences + springFreeFences,
    extraWood: Math.max(0, hookWood),
    trades: fenceOverride.trades,
    bonuses: fenceOverride.bonuses,
    paymentResourceProviders: fenceOverride.paymentResourceProviders,
  }
}

const computeSpringFreeFences = (
  state: GameState,
  _player: PlayerState,
  newFenceEdges: string[],
  policy: FenceActionPolicy,
  freeFencesBeforeSpring: number,
  extraWoodBeforeSpring: number,
): number => {
  if (!isThroughTheSeasonsSeason(state, 'spring')) return 0
  if (isBorrowedFenceSourcePolicy(policy.sourcePolicy)) return 0
  if (newFenceEdges.length <= 0) return 0
  const fenceWoodCost = policy.costPolicy?.fence?.wood ?? 1
  if (fenceWoodCost <= 0) return 0
  const ordinaryWoodBeforeSpring =
    Math.max(0, newFenceEdges.length - freeFencesBeforeSpring) * fenceWoodCost +
    extraWoodBeforeSpring
  const maxFreeByPayment = Math.floor(Math.max(0, ordinaryWoodBeforeSpring - 1) / fenceWoodCost)
  return Math.max(0, Math.min(2, newFenceEdges.length, maxFreeByPayment))
}

const buildFencePaymentCost = (
  payableWoodCost: number,
  adjustment: {
    trades: Trade[]
    bonuses: Bonus[]
    paymentResourceProviders?: ComplexCost['paymentResourceProviders']
  },
  policy: FenceActionPolicy,
): ComplexCost => {
  const cost: ComplexCost = { fee: { wood: payableWoodCost } }
  if (adjustment.trades.length > 0) cost.trades = adjustment.trades
  if (adjustment.bonuses.length > 0) cost.bonuses = adjustment.bonuses
  if ((adjustment.paymentResourceProviders?.length ?? 0) > 0) {
    cost.paymentResourceProviders = adjustment.paymentResourceProviders
  }
  if (policy.paymentBudget) cost.paymentBudget = policy.paymentBudget
  return cost
}

const canAffordFencePayment = (
  player: PlayerState,
  paymentCost: ComplexCost,
): boolean =>
  canAffordTypedFlatCost(player, paymentCost, 'fencing')

const countBorrowedFenceSources = (
  policy: FenceActionPolicy,
  newFenceEdges: string[],
  fenceSources: Record<string, string> | undefined,
): Map<string, number> => {
  const counts = new Map<string, number>()
  if (!isBorrowedFenceSourcePolicy(policy.sourcePolicy) || !fenceSources) return counts
  for (const edge of newFenceEdges) {
    const donorId = fenceSources[edge]
    if (!donorId) continue
    counts.set(donorId, (counts.get(donorId) ?? 0) + 1)
  }
  return counts
}

const finalizeFence = (
  ctx: ActionMutationContext,
  edges: string[],
  palisadeEdges: string[],
  extraWood: number,
  fenceSources: Record<string, string> | undefined,
  paymentChoice: string | undefined,
  policy: FenceActionPolicy,
): ActionExecutionResult => {
  const currentPolicy = borrowedPolicyWithCurrentCaps(ctx.state, ctx.player, policy)
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const normalized = normalizePlayerFarm(ctx.player)
  const existingEdgeIds = new Set(
    (normalized.fenceSegments ?? []).map((seg) => seg.edge),
  )
  const newFenceEdgesPreview = edges.filter((e) => !existingEdgeIds.has(e))
  const newPalisadeEdgesPreview = palisadeEdges.filter(
    (e) => !existingEdgeIds.has(e),
  )
  const costAdjustment = computeFenceCostAdjustment(
    ctx.state,
    normalized,
    newFenceEdgesPreview,
    newPalisadeEdgesPreview,
    ctx.space,
    currentPolicy,
  )
  const idx = ctx.state.players.indexOf(ctx.player)
  const validated = playerBoard(ctx.state, idx).farmyard.canBuildFence({
    edges,
    palisadeEdges,
    extraWood: extraWood + costAdjustment.extraWood,
    freeFences: costAdjustment.freeFences,
    options: fenceValidationOptions(
      normalized,
      playerCanBuildPalisades(normalized),
      currentPolicy,
      fenceSources,
    ),
    lockedKeys,
  })
  if (!validated.ok) {
    return fenceFail(validated.error?.code ?? 'log.fencingFail', currentPolicy)
  }
  const paymentCost = buildFencePaymentCost(
    validated.payableWoodCost,
    costAdjustment,
    currentPolicy,
  )
  if (!canAffordFencePayment(validated.player as unknown as PlayerState, paymentCost)) {
    return fenceFail('NOT_ENOUGH_WOOD', currentPolicy)
  }
  const payment = resolveTypedFlatPaymentSelection(
    validated.player as unknown as PlayerState,
    paymentCost,
    'pay:fence',
    paymentChoice,
    { type: 'fail', errorKey: 'log.fencingFail' },
    'fencing',
    ctx.state,
  )
  if (payment.type !== 'selected') {
    return { type: 'fail', errorKey: 'log.fencingFail' }
  }
  const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
  const consumed = isBorrowedFenceSourcePolicy(currentPolicy.sourcePolicy)
    ? undefined
    : consumePendingFenceBonus(nextPlayer, validated.newFenceEdges.length)
  applyPlayerMutation(ctx.player, nextPlayer)
  for (const [donorId, count] of countBorrowedFenceSources(
    currentPolicy,
    validated.newFenceEdges,
    fenceSources,
  )) {
    const donor = ctx.state.players.find((candidate) => candidate.id === donorId)
    if (donor) addConsumedSupplyTokenCount(donor, 'fence', count)
  }
  const paidResources = positiveResources(payment.solution.resourcesPaid)
  const newSegmentByEdge = new Map(
    nextPlayer.fenceSegments
      .filter((segment) =>
        validated.newFenceEdges.includes(segment.edge) ||
        validated.newPalisadeEdges.includes(segment.edge),
      )
      .map((segment) => [segment.edge, segment]),
  )
  const builtFences = [
    ...validated.newFenceEdges,
    ...validated.newPalisadeEdges,
  ]
    .map((edge) => newSegmentByEdge.get(edge))
    .filter((segment): segment is FenceSegment => segment !== undefined)
  if (builtFences.length > 0) {
    ctx.eventSink?.emit<'farm.fenceBuilt'>({
      type: 'farm.fenceBuilt',
      fences: builtFences,
      newFenceEdges: validated.newFenceEdges,
      newPastures: validated.newPastures,
    })
  }
  const extraData: Record<string, unknown> = {
    newFenceEdges: validated.newFenceEdges,
    newPalisadeEdges: validated.newPalisadeEdges,
    newPastures: validated.newPastures,
  }
  if (consumed) {
    extraData.usedFreeFences = consumed.usedFreeFences
    extraData.sourceCard = consumed.sourceCard
    if (consumed.usedFreeFences > 0) {
      ctx.eventSink?.emit<'farm.fenceConsumed'>({
        type: 'farm.fenceConsumed',
        count: consumed.usedFreeFences,
        reason: 'cardEffect',
      })
    }
  }
  return {
    type: 'ok',
    resourcesPaid: paidResources,
    extraData,
    internalChildren: {
      beforeHostListeners: [
        buildInternalPayChild({
          cost: paymentCost,
          costType: 'fencing',
          optionPrefix: 'pay:fence',
          paymentChoice,
          sourceCard: ctx.sourceCard,
          sourceActionId: ctx.space.id,
        }),
      ],
    },
  }
}

export const fenceAction: ActionDefinition = {
  id: 'fence',
  nameKey: 'actions.fencing.name',
  descriptionKey: 'actions.fencing.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) =>
    canStartFencing(state, player, undefined, context?.actionContext),
  costPreview: {
    getBaseCost: () => ({ wood: minimumFenceSegments }),
    canExecute: (ctx, costOverride) =>
      canStartFencing(
        ctx.state,
        ctx.player,
        costOverride,
        (ctx as { actionContext?: Record<string, unknown> }).actionContext,
      ),
  },
  execute: ({ state, player, space, actionContext }): ActionExecutionResult => {
    const idx = state.players.indexOf(player)
    const policy = readFenceActionPolicy(actionContext)
    const farm = playerBoard(state, idx).farmyard.selectableTiles('fence', {
      spaceId: space.id,
      actionContext,
    })
    return {
      type: 'request',
      request: {
        kind: 'farm-select',
        farm,
        options: [
          { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
        ],
      },
      promptKey: 'ui.interactionFenceSelect',
      promptParams: policy.promptHintKey ? { hintKey: policy.promptHintKey } : undefined,
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    const policy = readFenceActionPolicy(ctx.actionContext)
    if (choice === 'cancel') {
      return {
        type: 'fail',
        errorKey: 'log.fencingFail',
        recoverable: true,
      }
    }

    // Second call: payment combo selected after multi-combo prompt.
    if (choice.startsWith('pay:fence:')) {
      const farmPayload = ctx.actionContext?.farmPayload as
        | {
            edges?: string[]
            palisadeEdges?: string[]
            extraWood?: number
            fenceSources?: Record<string, string>
          }
        | undefined
      if (!farmPayload) return { type: 'fail', errorKey: 'log.fencingFail' }
      const edges = Array.isArray(farmPayload.edges) ? farmPayload.edges : []
      const palisadeEdges = Array.isArray(farmPayload.palisadeEdges)
        ? farmPayload.palisadeEdges
        : []
      const extraWood = farmPayload.extraWood ?? 0
      return finalizeFence(
        ctx,
        edges,
        palisadeEdges,
        extraWood,
        farmPayload.fenceSources,
        choice,
        policy,
      )
    }

    // First call: client submitted fence geometry alongside `confirm`.
    if (payload && choice === 'confirm') {
      const fp = payload as FencePayload
      const edges = Array.isArray(fp.edges) ? fp.edges : []
      const palisadeEdges = Array.isArray(fp.palisadeEdges) ? fp.palisadeEdges : []
      const extraWood = fp.extraWood ?? 0
      const fenceSources = isRecord(fp.fenceSources)
        ? Object.fromEntries(
            Object.entries(fp.fenceSources).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : undefined
      const currentPolicy = borrowedPolicyWithCurrentCaps(ctx.state, ctx.player, policy)

      const lockedKeys = collectLockedFarmTileKeys(ctx.player)
      const normalized = normalizePlayerFarm(ctx.player)
      const existingEdgeIds = new Set(
        (normalized.fenceSegments ?? []).map((seg) => seg.edge),
      )
      const newFenceEdgesPreview = edges.filter((e) => !existingEdgeIds.has(e))
      const newPalisadeEdgesPreview = palisadeEdges.filter(
        (e) => !existingEdgeIds.has(e),
      )
      const costAdjustment = computeFenceCostAdjustment(
        ctx.state,
        normalized,
        newFenceEdgesPreview,
        newPalisadeEdgesPreview,
        ctx.space,
        currentPolicy,
      )
      const idx = ctx.state.players.indexOf(ctx.player)
      const validated = playerBoard(ctx.state, idx).farmyard.canBuildFence({
        edges,
        palisadeEdges,
        extraWood: extraWood + costAdjustment.extraWood,
        freeFences: costAdjustment.freeFences,
        options: fenceValidationOptions(
          normalized,
          playerCanBuildPalisades(normalized),
          currentPolicy,
          fenceSources,
        ),
        lockedKeys,
      })
      if (!validated.ok) {
        return fenceFail(validated.error?.code ?? 'log.fencingFail', currentPolicy)
      }
      const paymentCost = buildFencePaymentCost(
        validated.payableWoodCost,
        costAdjustment,
        currentPolicy,
      )
      if (!canAffordFencePayment(validated.player as unknown as PlayerState, paymentCost)) {
        return fenceFail('NOT_ENOUGH_WOOD', currentPolicy)
      }
      const payment = resolveTypedFlatPaymentSelection(
        validated.player as unknown as PlayerState,
        paymentCost,
        'pay:fence',
        undefined,
        { type: 'fail', errorKey: 'log.fencingFail' },
        'fencing',
        ctx.state,
      )
      if (payment.type === 'request') {
        const options = payment.request.kind === 'choice' ? payment.request.options : []
        return {
          type: 'request',
          request: { kind: 'choice', options },
          promptKey: payment.promptKey,
          extraData: {
            actionContextWrite: {
              farmPayload: { edges, palisadeEdges, extraWood, fenceSources },
            },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.fencingFail' }
      }
      return finalizeFence(ctx, edges, palisadeEdges, extraWood, fenceSources, undefined, policy)
    }

    return { type: 'fail', errorKey: 'log.fencingFail' }
  },
}
