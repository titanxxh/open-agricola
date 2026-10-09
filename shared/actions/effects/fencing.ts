import type {
  ActionCostAttribution,
  ActionDefinition,
  ActionExecutionContext,
  InteractionRequest,
  ActionExecutionResult,
  ActionMutationContext,
  ActionSpace,
  Bonus,
  ComplexCost,
  FarmTilePosition,
  FenceSegment,
  FenceSegmentType,
  GameState,
  PaymentResourceMap,
  PlayerState,
  Resource,
  Trade,
} from '../../contract/types'
import { PaymentSolver } from '../payment'
import { buildInternalPayChild } from '../helpers/pay-child'
import { playerBoard, normalizePlayerFarm } from '../../domain'
import {
  getFarmyardTileCount,
  getFarmyardTilePositions,
  isFarmyardBorderEdge,
} from '../../domain/farm'
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
import { findPlayerById } from '../../domain/player'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import { buildFenceFarmInteraction } from '../../domain/farmyard-interaction'
import { hasMatchingActionHooks } from '../hooks'
import { getMatchingListeners, collectFarmChoiceCostAdjustments } from '../../cards/card-listeners'
import { playerCanBuildPalisades } from '../../cards/helpers/card-type'
import { recordActionCostAttribution } from '../../cards/helpers/card-state'
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
  newRegionBounds?: FencePastureBounds
  costPolicy?: FenceCostPolicy
  paymentBudget?: PaymentResourceMap
  pastureBounds?: FenceValidationOptions['pastureBounds']
  cancelPolicy?: 'allowCancel' | 'forbidCancel'
  preserveAnimalTotals?: boolean
  connectionPolicy?: FenceValidationOptions['connectionPolicy']
  allowedNewRegionTiles?: FarmTilePosition[]
  allowTerrainInNewRegions?: boolean
  suppressTerrainRegions?: boolean
  promptHintKey?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFenceSegmentType = (value: unknown): value is FenceSegmentType =>
  value === 'fence' || value === 'palisade'

const isFarmTilePosition = (value: unknown): value is FarmTilePosition => {
  if (!isRecord(value)) return false
  return typeof value.row === 'number' && typeof value.col === 'number'
}

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
    newRegionBounds: isRecord(source.newRegionBounds)
      ? (source.newRegionBounds as FencePastureBounds)
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
    connectionPolicy:
      source.connectionPolicy === 'allowDisconnected'
        ? 'allowDisconnected'
        : undefined,
    allowedNewRegionTiles: Array.isArray(source.allowedNewRegionTiles)
      ? source.allowedNewRegionTiles.filter(isFarmTilePosition)
      : undefined,
    allowTerrainInNewRegions:
      typeof source.allowTerrainInNewRegions === 'boolean'
        ? source.allowTerrainInNewRegions
        : undefined,
    suppressTerrainRegions:
      typeof source.suppressTerrainRegions === 'boolean'
        ? source.suppressTerrainRegions
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
  policy.newRegionBounds !== undefined ||
  policy.costPolicy !== undefined ||
  policy.paymentBudget !== undefined ||
  policy.pastureBounds !== undefined ||
  policy.cancelPolicy !== undefined ||
  policy.preserveAnimalTotals !== undefined ||
  policy.connectionPolicy !== undefined ||
  policy.allowedNewRegionTiles !== undefined ||
  policy.allowTerrainInNewRegions !== undefined ||
  policy.suppressTerrainRegions !== undefined

const hasCanStartPolicy = (policy: FenceActionPolicy): boolean =>
  policy.sourcePolicy !== undefined ||
  policy.segmentBounds !== undefined ||
  policy.newPastureBounds !== undefined ||
  policy.newRegionBounds !== undefined ||
  policy.costPolicy !== undefined ||
  policy.paymentBudget !== undefined ||
  policy.pastureBounds !== undefined ||
  policy.connectionPolicy !== undefined ||
  policy.allowedNewRegionTiles !== undefined ||
  policy.allowTerrainInNewRegions !== undefined ||
  policy.suppressTerrainRegions !== undefined

const borrowedPolicyWithCurrentCaps = (
  state: GameState,
  activePlayer: PlayerState,
  policy: FenceActionPolicy,
): FenceActionPolicy => {
  if (!isBorrowedFenceSourcePolicy(policy.sourcePolicy)) return policy
  const donorCaps: Record<string, number> = {}
  for (const [donorId, cap] of Object.entries(policy.sourcePolicy.donorCaps)) {
    const donor = findPlayerById(state, donorId)
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

const farmTiles = (player: PlayerState): Array<{ row: number; col: number }> =>
  getFarmyardTilePositions(player)

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

const connectedTileSetCache = new Map<string, Array<Array<{ row: number; col: number }>>>()

const connectedTileSets = (
  player: PlayerState,
  size: number,
): Array<Array<{ row: number; col: number }>> => {
  const all = farmTiles(player)
  const cacheKey = `${size}:${all.map((tile) => `${tile.row}-${tile.col}`).join('|')}`
  const cached = connectedTileSetCache.get(cacheKey)
  if (cached) return cached
  const indexes = new Map(all.map((tile, index) => [`${tile.row}-${tile.col}`, index]))
  const adjacent = all.map(tile => [
    indexes.get(`${tile.row - 1}-${tile.col}`),
    indexes.get(`${tile.row + 1}-${tile.col}`),
    indexes.get(`${tile.row}-${tile.col - 1}`),
    indexes.get(`${tile.row}-${tile.col + 1}`),
  ].filter((index): index is number => index !== undefined))
  const selected = new Uint8Array(all.length)
  const visited = new Uint32Array(all.length)
  const queue = new Uint32Array(all.length)
  let generation = 0
  const selectedConnected = (first: number): boolean => {
    generation = (generation + 1) >>> 0
    if (generation === 0) {
      visited.fill(0)
      generation = 1
    }
    visited[first] = generation
    queue[0] = first
    let count = 1
    for (let cursor = 0; cursor < count; cursor += 1) {
      for (const neighbor of adjacent[queue[cursor]!]!) {
        if (!selected[neighbor] || visited[neighbor] === generation) continue
        visited[neighbor] = generation
        queue[count++] = neighbor
      }
    }
    return count === size
  }
  const results: Array<Array<{ row: number; col: number }>> = []
  const choose = (start: number, picked: Array<{ row: number; col: number }>, first: number) => {
    if (picked.length === size) {
      // Reuse the traversal buffers for nontrivial candidates; no board-size
      // bitmask or per-candidate Set, coordinate strings or neighbor objects.
      if (picked.length <= 1 ? connected(picked) : selectedConnected(first)) results.push([...picked])
      return
    }
    for (let index = start; index <= all.length - (size - picked.length); index += 1) {
      selected[index] = 1
      picked.push(all[index]!)
      choose(index + 1, picked, first < 0 ? index : first)
      picked.pop()
      selected[index] = 0
    }
  }
  choose(0, [], -1)
  connectedTileSetCache.set(cacheKey, results)
  return results
}

const boardForPlayer = (state: GameState, player: PlayerState) => {
  const idx = (state.players ?? []).indexOf(player)
  if (idx >= 0) return playerBoard(state, idx)
  return playerBoard({ ...state, players: [player] }, 0)
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
    newRegionBounds: policy.newRegionBounds,
    costPolicy: policy.costPolicy,
    pastureBounds: policy.pastureBounds,
    preserveAnimalTotals: policy.preserveAnimalTotals,
    connectionPolicy: policy.connectionPolicy,
    allowedNewRegionTiles: policy.allowedNewRegionTiles,
    allowTerrainInNewRegions: policy.allowTerrainInNewRegions,
    suppressTerrainRegions: policy.suppressTerrainRegions,
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

export { getFenceCount, getPalisadeCount } from '../../domain/fence-segments'

export const getTotalPastureCells = (player: PlayerState) =>
  player.pastures.reduce((sum, pasture) => sum + pasture.size, 0)

export const canStartFencing = (
  state: GameState,
  player: PlayerState,
  costOverride?: Partial<Resource>,
  actionContext?: Record<string, unknown>,
): boolean => {
  const space = state.actionSpaces?.find((entry) => entry.id === 'fencing')
    ?? { ...fenceAction, resources: player.resources, takenBy: [] }
  const request: InteractionRequest = {
    kind: 'farm-select',
    farm: buildFenceFarmInteraction(player, space.id, actionContext),
    options: [{ value: 'confirm', labelKey: 'ui.interactionFenceConfirm' }],
  }
  return !affordableFencePlans({ state, player, space, actionContext }, request, costOverride).next().done
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
  baseFreeFences: number
  freeFences: number
  extraWood: number
  costAttribution: ActionCostAttribution[]
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
  const baseSpringFreeFences = computeSpringFreeFences(
    state,
    player,
    newFenceEdges,
    policy,
    pendingFreeFences,
    0,
  )
  return {
    baseFreeFences: pendingFreeFences + baseSpringFreeFences,
    freeFences: pendingFreeFences + hookFreeFences + springFreeFences,
    extraWood: Math.max(0, hookWood),
    costAttribution: fenceOverride.costAttribution,
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
  state: GameState,
): boolean =>
  PaymentSolver.canAffordTypedFlatCost(player, paymentCost, 'fencing', state)

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
  const validationOptions = fenceValidationOptions(
    normalized,
    playerCanBuildPalisades(normalized),
    currentPolicy,
    fenceSources,
  )
  const baseValidated = playerBoard(ctx.state, idx).farmyard.canBuildFence({
    edges,
    palisadeEdges,
    extraWood,
    freeFences: costAdjustment.baseFreeFences,
    options: validationOptions,
    lockedKeys,
  })
  const validated = playerBoard(ctx.state, idx).farmyard.canBuildFence({
    edges,
    palisadeEdges,
    extraWood: extraWood + costAdjustment.extraWood,
    freeFences: costAdjustment.freeFences,
    options: validationOptions,
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
  if (!canAffordFencePayment(validated.player as unknown as PlayerState, paymentCost, ctx.state)) {
    return fenceFail('NOT_ENOUGH_WOOD', currentPolicy)
  }
  const payment = PaymentSolver.resolveTypedFlatPaymentSelection(
    validated.player as unknown as PlayerState,
    paymentCost,
    'pay:fence',
    paymentChoice,
    { type: 'fail', errorKey: 'log.fencingFail' },
    'fencing',
    ctx.state,
    ctx.actionContext,
  )
  if (payment.type !== 'selected') {
    return { type: 'fail', errorKey: 'log.fencingFail' }
  }
  const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
  const consumed = isBorrowedFenceSourcePolicy(currentPolicy.sourcePolicy)
    ? undefined
    : consumePendingFenceBonus(nextPlayer, validated.newFenceEdges.length)
  applyPlayerMutation(ctx.player, nextPlayer)
  recordActionCostAttribution(
    ctx.player,
    costAdjustment.costAttribution,
    { wood: baseValidated.ok ? baseValidated.payableWoodCost : validated.payableWoodCost },
    { wood: validated.payableWoodCost },
  )
  for (const [donorId, count] of countBorrowedFenceSources(
    currentPolicy,
    validated.newFenceEdges,
    fenceSources,
  )) {
    const donor = findPlayerById(ctx.state, donorId)
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
          actionContext: { issuedPaymentChoices: ctx.actionContext?.issuedPaymentChoices },
        }),
      ],
    },
  }
}

function* selectionSubsets<T>(items: readonly T[], min: number, max: number): Generator<T[]> {
  function* choose(start: number, remaining: number, selected: T[]): Generator<T[]> {
    if (remaining === 0) {
      yield selected
      return
    }
    for (let index = start; index <= items.length - remaining; index += 1) {
      yield* choose(index + 1, remaining - 1, [...selected, items[index]!])
    }
  }
  for (let count = min; count <= Math.min(max, items.length); count += 1) {
    yield* choose(0, count, [])
  }
}

function* affordableFencePlans(
  context: ActionExecutionContext,
  request: InteractionRequest,
  costOverride?: Partial<Resource>,
): Generator<FencePayload> {
  if (request.kind !== 'farm-select' || request.farm.farmType !== 'fence') {
    return
  }
  const { state, player, space } = context
  const requestedExtraWood = request.farm.extraWood ?? 0
  const policy = borrowedPolicyWithCurrentCaps(state, player, readFenceActionPolicy(context.actionContext))
  const existing = new Set((player.fenceSegments ?? []).map((segment) => segment.edge))
  const selectable = request.farm.selectableEdges.filter((edge) => !existing.has(edge))
  const options = fenceValidationOptions(player, playerCanBuildPalisades(player), policy)
  const capacity = Math.min(sourceOrdinaryCapacity(player, policy, readPendingFenceBonus(player)?.freeFences ?? 0),
    policy.segmentBounds?.fence?.max ?? selectable.length)
  const border = playerCanBuildPalisades(player) && !isBorrowedFenceSourcePolicy(policy.sourcePolicy)
    && (!policy.allowedSegmentTypes || policy.allowedSegmentTypes.includes('palisade'))
    ? selectable.filter((edge) => isFarmyardBorderEdge(player, edge)) : []
  const maxFence = !policy.allowedSegmentTypes || policy.allowedSegmentTypes.includes('fence') ? capacity : 0
  const maxPalisade = Math.min(border.length, policy.segmentBounds?.palisade?.max ?? border.length)
  const costContext = { state, player, space, actionId: 'fence', phase: 'computeCosts' as const }
  const globalCosts = hasMatchingActionHooks(costContext)
  const costListeners = getMatchingListeners(costContext)
  const geometryCosts = globalCosts || costListeners.length > 0
  const monotoneCosts = !globalCosts && costListeners.every((entry) => entry.registration.monotoneFenceCost === true)
  const pairs: Array<[number, number]> = []
  for (let total = 1; total <= maxFence + maxPalisade; total += 1) {
    for (let fences = 0; fences <= maxFence; fences += 1) {
      const palisades = total - fences
      if (palisades < 0 || palisades > maxPalisade) continue
      if (total < (policy.segmentBounds?.total?.min ?? 0) || total > (policy.segmentBounds?.total?.max ?? Infinity)
        || fences < (policy.segmentBounds?.fence?.min ?? 0) || palisades < (policy.segmentBounds?.palisade?.min ?? 0)) continue
      if (!geometryCosts) {
        const free = (readPendingFenceBonus(player)?.freeFences ?? 0) + Math.max(0, -(costOverride?.wood ?? 0))
        const extra = Math.max(0, costOverride?.wood ?? 0)
        const spring = computeSpringFreeFences(state, player, Array.from({ length: fences }, () => ''), policy, free, extra)
        const wood = Math.max(0, fences - free - spring) * (policy.costPolicy?.fence?.wood ?? 1)
          + palisades * (policy.costPolicy?.palisade?.wood ?? 2) + Math.max(0, policy.costPolicy?.fixedWood ?? 0) + extra
        if (!canAffordFencePayment(player, { fee: { wood }, paymentBudget: policy.paymentBudget }, state)) continue
      }
      pairs.push([fences, palisades])
    }
  }
  if (pairs.length === 0 || pairs.every(([fences, palisades]) => fences + palisades < Math.max(1, 4 - existing.size))) return
  const lockedKeys = collectLockedFarmTileKeys(player)
  const occupied = new Set([...player.roomTiles, ...player.fields].map(({ row, col }) => `${row}-${col}`))
  const seen = new Set<string>()
  const seeds = new Map<string, string[]>()
  let minimalAffordable = false
  const board = boardForPlayer(state, player)
  function* submit(edges: string[], palisadeEdges: string[], fenceSources?: Record<string, string>): Generator<FencePayload> {
    const adjustment = computeFenceCostAdjustment(state, player, edges, palisadeEdges, space, policy)
    if (costOverride) {
      adjustment.freeFences += Math.max(0, -(costOverride.wood ?? 0))
      adjustment.extraWood += Math.max(0, costOverride.wood ?? 0)
    }
    const validated = board.farmyard.canBuildFence({ edges, palisadeEdges, fenceSources,
      extraWood: requestedExtraWood + adjustment.extraWood, freeFences: adjustment.freeFences,
      options: { ...options, fenceSources }, lockedKeys })
    const affordable = validated.ok && canAffordFencePayment(validated.player as PlayerState,
      buildFencePaymentCost(validated.payableWoodCost, adjustment, policy), state)
    if (!affordable) return
    minimalAffordable = true
    const payload = {
      edges: [...edges].sort(),
      palisadeEdges: [...palisadeEdges].sort(),
      extraWood: requestedExtraWood,
      fenceSources,
    }
    const key = JSON.stringify(payload)
    if (seen.has(key)) return
    seen.add(key)
    yield payload
  }
  function* allocate(edges: string[], palisadeEdges: string[]): Generator<FencePayload> {
    if (!isBorrowedFenceSourcePolicy(policy.sourcePolicy)) {
      yield* submit(edges, palisadeEdges)
      return
    }
    const donors = Object.entries(policy.sourcePolicy.donorCaps)
    function* assign(index: number, sources: Record<string, string>, counts: Record<string, number>): Generator<FencePayload> {
      if (index === edges.length) { yield* submit(edges, palisadeEdges, sources); return }
      for (const [donor, cap] of donors) {
        if ((counts[donor] ?? 0) >= cap) continue
        yield* assign(index + 1, { ...sources, [edges[index]!]: donor }, { ...counts, [donor]: (counts[donor] ?? 0) + 1 })
      }
    }
    yield* assign(0, {}, {})
  }
  for (let size = 1; size <= getFarmyardTileCount(player); size += 1) {
    if (existing.size === 0 && !policy.suppressTerrainRegions && (size < (policy.pastureBounds?.newPastureSize?.min ?? 0)
      || size > (policy.pastureBounds?.newPastureSize?.max ?? Infinity))) continue
    for (const tiles of connectedTileSets(player, size)) {
      if (tiles.some(({ row, col }) => occupied.has(`${row}-${col}`) || lockedKeys.has(`${row}-${col}`))) continue
      const required = perimeterEdges(tiles).filter((edge) => !existing.has(edge)).sort()
      if (required.some((edge) => !selectable.includes(edge))) continue
      const seed = required.join(',')
      if (seeds.has(seed)) continue
      seeds.set(seed, required)
      const requiredBorder = required.filter((edge) => border.includes(edge))
      for (const palisades of selectionSubsets(requiredBorder, 0, maxPalisade)) {
        const fences = required.filter((edge) => !palisades.includes(edge))
        if (pairs.some(([fenceCount, palisadeCount]) => fenceCount === fences.length && palisadeCount === palisades.length)) {
          yield* allocate(fences, palisades)
        }
      }
    }
  }
  if (!hasCanStartPolicy(policy) && monotoneCosts && !minimalAffordable) return
  for (const required of seeds.values()) {
      const requiredBorder = required.filter((edge) => border.includes(edge))
      for (const requiredPalisades of selectionSubsets(requiredBorder, 0, maxPalisade)) {
        const requiredFence = required.filter((edge) => !requiredPalisades.includes(edge))
        if (geometryCosts && monotoneCosts) {
          const adjustment = computeFenceCostAdjustment(state, player, requiredFence, requiredPalisades, space, policy)
          if (costOverride) {
            adjustment.freeFences += Math.max(0, -(costOverride.wood ?? 0))
            adjustment.extraWood += Math.max(0, costOverride.wood ?? 0)
          }
          const wood = Math.max(0, requiredFence.length - adjustment.freeFences) * (policy.costPolicy?.fence?.wood ?? 1)
            + requiredPalisades.length * (policy.costPolicy?.palisade?.wood ?? 2)
            + Math.max(0, policy.costPolicy?.fixedWood ?? 0) + adjustment.extraWood
          if (!canAffordFencePayment(player, buildFencePaymentCost(wood, adjustment, policy), state)) continue
        }
        for (const [fenceCount, palisadeCount] of pairs) {
          if (fenceCount < requiredFence.length || palisadeCount < requiredPalisades.length) continue
          for (const extraPalisades of selectionSubsets(border.filter((edge) => !required.includes(edge)),
            palisadeCount - requiredPalisades.length, palisadeCount - requiredPalisades.length)) {
            const remaining = selectable.filter((edge) => !required.includes(edge) && !extraPalisades.includes(edge))
            for (const extraFences of selectionSubsets(remaining, fenceCount - requiredFence.length, fenceCount - requiredFence.length)) {
              yield* allocate([...requiredFence, ...extraFences], [...requiredPalisades, ...extraPalisades])
            }
          }
        }
      }
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
  execute: ({ state, player, space, sourceCard, actionContext }): ActionExecutionResult => {
    const idx = state.players.indexOf(player)
    const policy = readFenceActionPolicy(actionContext)
    if (
      isThroughTheSeasonsSeason(state, 'spring') &&
      !sourceCard &&
      !hasCanStartPolicy(policy) &&
      !PaymentSolver.canAffordTypedFlatCost(player, { wood: 1 }, 'fencing', state)
    ) {
      return { type: 'fail', errorKey: 'log.payFail' }
    }
    const farm = playerBoard(state, idx).farmInteraction.selectableTiles('fence', {
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
        return { type: 'fail', errorKey: validated.error?.code ?? 'log.fencingFail', recoverable: true }
      }
      const paymentCost = buildFencePaymentCost(
        validated.payableWoodCost,
        costAdjustment,
        currentPolicy,
      )
      if (!canAffordFencePayment(validated.player as unknown as PlayerState, paymentCost, ctx.state)) {
        return { type: 'fail', errorKey: 'NOT_ENOUGH_WOOD', recoverable: true }
      }
      const payment = PaymentSolver.resolveTypedFlatPaymentSelection(
        validated.player as unknown as PlayerState,
        paymentCost,
        'pay:fence',
        undefined,
        { type: 'fail', errorKey: 'log.fencingFail', recoverable: true },
        'fencing',
        ctx.state,
        ctx.actionContext,
      )
      if (payment.type === 'request') {
        const options = payment.request.kind === 'choice' ? payment.request.options : []
        return {
          type: 'request',
          request: { kind: 'choice', options },
          promptKey: payment.promptKey,
          extraData: {
            actionContextWrite: {
              ...(payment.extraData?.actionContextWrite as Record<string,unknown> | undefined),
              farmPayload: { edges, palisadeEdges, extraWood, fenceSources },
            },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.fencingFail', recoverable: true }
      }
      return finalizeFence(ctx, edges, palisadeEdges, extraWood, fenceSources, undefined, policy)
    }

    return { type: 'fail', errorKey: 'log.fencingFail', recoverable: true }
  },
}
