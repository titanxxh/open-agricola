import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionMutationContext,
  ActionSpace,
  FenceSegment,
  FenceSegmentType,
  GameState,
  PlayerState,
  Resource,
} from '../../contract/types'
// PaymentSolver namespace (S3 Task 7b): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// fencing.ts only uses typed-flat helpers (shim scope), so no PaymentSolver
// call sites exist here yet.
import {
  canAffordTypedFlatCost,
  resolveTypedFlatPaymentSelection,
} from '../payment/internal'
import { buildInternalPayChild } from '../helpers/pay-child'
import { playerBoard, normalizePlayerFarm } from '../../domain'
import { FARM_COLS, FARM_ROWS } from '../../domain/farm'
import type {
  FenceCostPolicy,
  FencePastureBounds,
  FenceSegmentBounds,
  FenceValidationOptions,
} from '../../domain/farmyard'
import {
  MAX_ORDINARY_FENCE_PIECES,
  getOwnOrdinaryFenceCount,
} from '../../domain/fence-segments'
import {
  getOwnOrdinaryFenceBuildLimit,
  getOwnOrdinaryFenceReserveCount,
} from '../../domain/supply-tokens'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import { collectComputeCostsForFarmChoice } from '../../cards/card-listeners'
import { playerCanBuildPalisades } from '../../cards/helpers/card-type'
import {
  consumePendingFenceBonus,
  readPendingFenceBonus,
} from '../../cards/helpers/pending-fence-bonus'

export const maxFences = MAX_ORDINARY_FENCE_PIECES
export const maxPastureCells = 15
export const stableWoodCost = 2
export const minimumFenceSegments = 4

export type FenceActionPolicy = {
  allowedSegmentTypes?: FenceSegmentType[]
  sourcePolicy?: 'ownOnly'
  segmentBounds?: FenceSegmentBounds
  newPastureBounds?: FencePastureBounds
  costPolicy?: FenceCostPolicy
  pastureBounds?: FenceValidationOptions['pastureBounds']
  cancelPolicy?: 'allowCancel' | 'forbidCancel'
  preserveAnimalTotals?: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFenceSegmentType = (value: unknown): value is FenceSegmentType =>
  value === 'fence' || value === 'palisade'

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
    sourcePolicy:
      source.sourcePolicy === 'ownOnly' ? 'ownOnly' : undefined,
    segmentBounds: isRecord(source.segmentBounds)
      ? (source.segmentBounds as FenceSegmentBounds)
      : undefined,
    newPastureBounds: isRecord(source.newPastureBounds)
      ? (source.newPastureBounds as FencePastureBounds)
      : undefined,
    costPolicy: isRecord(source.costPolicy)
      ? (source.costPolicy as FenceCostPolicy)
      : undefined,
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
  }
}

const hasFenceActionPolicy = (policy: FenceActionPolicy): boolean =>
  policy.allowedSegmentTypes !== undefined ||
  policy.sourcePolicy !== undefined ||
  policy.segmentBounds !== undefined ||
  policy.newPastureBounds !== undefined ||
  policy.costPolicy !== undefined ||
  policy.pastureBounds !== undefined ||
  policy.cancelPolicy !== undefined ||
  policy.preserveAnimalTotals !== undefined

const hasCanStartPolicy = (policy: FenceActionPolicy): boolean =>
  policy.sourcePolicy !== undefined ||
  policy.segmentBounds !== undefined ||
  policy.newPastureBounds !== undefined ||
  policy.costPolicy !== undefined ||
  policy.pastureBounds !== undefined

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
      if (canAffordTypedFlatCost(player, { wood: woodCost }, 'fencing')) {
        return true
      }
    }
  }
  return false
}

const fenceValidationOptions = (
  player: PlayerState,
  allowPalisades: boolean,
  policy: FenceActionPolicy,
): FenceValidationOptions => {
  const selectedFreeFences = readPendingFenceBonus(player)?.freeFences ?? 0
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
    ordinaryFenceBuildLimit: getOwnOrdinaryFenceBuildLimit(player),
    availableOrdinaryFenceTokens:
      getOwnOrdinaryFenceReserveCount(player) + selectedFreeFences,
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

export const getFenceCount = <T extends { fenceSegments: FenceSegment[] }>(
  p: T,
): number => p.fenceSegments.reduce((n, s) => n + (s.type === 'fence' ? 1 : 0), 0)

export const getPalisadeCount = <T extends { fenceSegments: FenceSegment[] }>(
  p: T,
): number => p.fenceSegments.reduce((n, s) => n + (s.type === 'palisade' ? 1 : 0), 0)

export const getTotalPastureCells = (player: PlayerState) =>
  player.pastures.reduce((sum, pasture) => sum + pasture.size, 0)

export const canStartFencing = (
  _state: GameState,
  player: PlayerState,
  costOverride?: Partial<Resource>,
  actionContext?: Record<string, unknown>,
) => {
  const policy = readFenceActionPolicy(actionContext)
  const remainingBuildCapacity = Math.max(
    0,
    getOwnOrdinaryFenceBuildLimit(player) - getOwnOrdinaryFenceCount(player),
  )
  const selectedFreeFences = readPendingFenceBonus(player)?.freeFences ?? 0
  const availableOrdinaryFenceTokens =
    getOwnOrdinaryFenceReserveCount(player) + selectedFreeFences
  const ordinaryCapacity = Math.min(
    remainingBuildCapacity,
    availableOrdinaryFenceTokens,
  )
  if (hasCanStartPolicy(policy)) {
    return canStartWithFencePolicy(
      player,
      policy,
      ordinaryCapacity,
      selectedFreeFences,
      costOverride,
    )
  }
  if (ordinaryCapacity < minimumFenceSegments) {
    return false
  }
  if (getTotalPastureCells(player) >= maxPastureCells) return false
  const free = selectedFreeFences + Math.max(0, Math.abs(costOverride?.wood ?? 0))
  if (free > 0) {
    const woodCount = player.resources.wood ?? 0
    if (woodCount + free >= minimumFenceSegments) return true
  }
  return canAffordTypedFlatCost(player, { wood: minimumFenceSegments }, 'fencing')
}

type FencePayload = {
  edges?: string[]
  palisadeEdges?: string[]
  extraWood?: number
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

const computeFreeFenceTotal = (
  state: GameState,
  player: PlayerState,
  newFenceEdges: string[],
  newPalisadeEdges: string[],
  space: ActionSpace | undefined,
): number => {
  const pendingFreeFences = readPendingFenceBonus(player)?.freeFences ?? 0
  const fenceOverride = collectComputeCostsForFarmChoice(
    state,
    player,
    'fence',
    { newFenceEdges, newPalisadeEdges },
    space,
  )
  const hookFreeFences = Math.max(0, Math.abs(fenceOverride.wood ?? 0))
  return pendingFreeFences + hookFreeFences
}

const finalizeFence = (
  ctx: ActionMutationContext,
  edges: string[],
  palisadeEdges: string[],
  extraWood: number,
  paymentChoice: string | undefined,
  policy: FenceActionPolicy,
): ActionExecutionResult => {
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const normalized = normalizePlayerFarm(ctx.player)
  const existingEdgeIds = new Set(
    (normalized.fenceSegments ?? []).map((seg) => seg.edge),
  )
  const newFenceEdgesPreview = edges.filter((e) => !existingEdgeIds.has(e))
  const newPalisadeEdgesPreview = palisadeEdges.filter(
    (e) => !existingEdgeIds.has(e),
  )
  const freeFences = computeFreeFenceTotal(
    ctx.state,
    normalized,
    newFenceEdgesPreview,
    newPalisadeEdgesPreview,
    ctx.space,
  )
  const idx = ctx.state.players.indexOf(ctx.player)
  const validated = playerBoard(ctx.state, idx).farmyard.canBuildFence({
    edges,
    palisadeEdges,
    extraWood,
    freeFences,
    options: fenceValidationOptions(
      normalized,
      playerCanBuildPalisades(normalized),
      policy,
    ),
    lockedKeys,
  })
  if (!validated.ok) {
    return fenceFail(validated.error?.code ?? 'log.fencingFail', policy)
  }
  const payment = resolveTypedFlatPaymentSelection(
    validated.player as unknown as PlayerState,
    { wood: validated.payableWoodCost },
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
  const consumed = consumePendingFenceBonus(nextPlayer, validated.newFenceEdges.length)
  applyPlayerMutation(ctx.player, nextPlayer)
  const paidResources = positiveResources(payment.solution.resourcesPaid)
  const builtFences = [
    ...validated.newFenceEdges.map((edge) => ({ edge, type: 'fence' })),
    ...validated.newPalisadeEdges.map((edge) => ({ edge, type: 'palisade' })),
  ]
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
          cost: { fee: { wood: validated.payableWoodCost } },
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
        | { edges?: string[]; palisadeEdges?: string[]; extraWood?: number }
        | undefined
      if (!farmPayload) return { type: 'fail', errorKey: 'log.fencingFail' }
      const edges = Array.isArray(farmPayload.edges) ? farmPayload.edges : []
      const palisadeEdges = Array.isArray(farmPayload.palisadeEdges)
        ? farmPayload.palisadeEdges
        : []
      const extraWood = farmPayload.extraWood ?? 0
      return finalizeFence(ctx, edges, palisadeEdges, extraWood, choice, policy)
    }

    // First call: client submitted fence geometry alongside `confirm`.
    if (payload && choice === 'confirm') {
      const fp = payload as FencePayload
      const edges = Array.isArray(fp.edges) ? fp.edges : []
      const palisadeEdges = Array.isArray(fp.palisadeEdges) ? fp.palisadeEdges : []
      const extraWood = fp.extraWood ?? 0

      const lockedKeys = collectLockedFarmTileKeys(ctx.player)
      const normalized = normalizePlayerFarm(ctx.player)
      const existingEdgeIds = new Set(
        (normalized.fenceSegments ?? []).map((seg) => seg.edge),
      )
      const newFenceEdgesPreview = edges.filter((e) => !existingEdgeIds.has(e))
      const newPalisadeEdgesPreview = palisadeEdges.filter(
        (e) => !existingEdgeIds.has(e),
      )
      const freeFences = computeFreeFenceTotal(
        ctx.state,
        normalized,
        newFenceEdgesPreview,
        newPalisadeEdgesPreview,
        ctx.space,
      )
      const idx = ctx.state.players.indexOf(ctx.player)
      const validated = playerBoard(ctx.state, idx).farmyard.canBuildFence({
        edges,
        palisadeEdges,
        extraWood,
        freeFences,
        options: fenceValidationOptions(
          normalized,
          playerCanBuildPalisades(normalized),
          policy,
        ),
        lockedKeys,
      })
      if (!validated.ok) {
        return fenceFail(validated.error?.code ?? 'log.fencingFail', policy)
      }
      const payment = resolveTypedFlatPaymentSelection(
        validated.player as unknown as PlayerState,
        { wood: validated.payableWoodCost },
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
              farmPayload: { edges, palisadeEdges, extraWood },
            },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.fencingFail' }
      }
      return finalizeFence(ctx, edges, palisadeEdges, extraWood, undefined, policy)
    }

    return { type: 'fail', errorKey: 'log.fencingFail' }
  },
}
