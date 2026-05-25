import type {
  ActionAvailabilityContext,
  ActionChoiceOption,
  ActionCostPreview,
  ActionDefinition,
  ActionExecutionResult,
  InternalActionChild,
  ComplexCost,
  PlayerState,
  Resource,
} from '../../contract/types'
import { canExecuteWithCostPreview } from '../helpers/cost-preview'
// PaymentSolver namespace (S3 Task 7b): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// renovation.ts only uses typed-flat helpers (shim scope), so no PaymentSolver
// call sites exist here yet.
import {
  canAffordTypedFlatCost,
  payTypedFlatCost,
  readExactCost,
  resolveUnitCostWithDelta,
} from '../payment/internal'
import { mergeResources } from '../../utils/resources'
import { buildInternalPayChild } from '../helpers/pay-child'

type RenovationTarget = Exclude<PlayerState['houseType'], 'wood'>

type RenovationPlan = {
  nextType: RenovationTarget
  cost: ComplexCost
}

type PendingRenovation = {
  from: PlayerState['houseType']
  to: RenovationTarget
  rooms: { row: number; col: number }[]
}

const readPendingRenovation = (
  result: Extract<ActionExecutionResult, { type: 'ok' }>,
): PendingRenovation | null => {
  const raw = result.extraData?.renovation
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<PendingRenovation>
  if (r.from !== 'wood' && r.from !== 'clay') return null
  if (r.to !== 'clay' && r.to !== 'stone') return null
  if (!Array.isArray(r.rooms)) return null
  return {
    from: r.from,
    to: r.to,
    rooms: r.rooms,
  }
}

const mergeRenovationCost = (
  baseCost: ComplexCost,
  costOverride?: Partial<Resource>,
): ComplexCost => {
  if (!costOverride) return baseCost
  // costOverride is a per-action delta against the TOTAL cost, matching the
  // legacy semantic where pre-spec baseCost was the pre-multiplied
  // {[material]: rooms, reed: 1} and override modified that total. It lands
  // in fees[0]; unitFee × nb stays the BGA-aligned per-room cost. Negative
  // entries (e.g. D154 ChimneySweep `stone: -2`) remain in fees[0]; enumerate
  // clamps the merged baseFee at the affordability stage so wood→clay (no
  // stone in unitFee) doesn't credit a refund on the unrelated resource.
  return {
    ...baseCost,
    fees: [mergeResources(baseCost.fees?.[0] ?? {}, costOverride)],
  }
}

const resolveRenovationActionCost = (
  baseCost: ComplexCost,
  actionContext?: Record<string, unknown>,
  costOverride?: Partial<Resource>,
): ComplexCost | null => {
  const exactCost = readExactCost(actionContext)
  if (exactCost) {
    const resolved = resolveUnitCostWithDelta({}, exactCost, costOverride, 1)
    return resolved ? { fee: resolved } : null
  }
  return mergeRenovationCost(baseCost, costOverride)
}

/**
 * Build a renovation plan for an explicit target. Returns `null` when the
 * target is not a legal next step from the player's current house type.
 *
 * Cost model (BGA): N building resources of the target type + 1 reed, where
 * N is the player's current room count. The wood→stone direct path costs
 * `{ stone: rooms, reed: 1 }` and is only legal when explicitly requested
 * (e.g. via A87 Conservator).
 */
export const buildRenovationPlan = (
  player: PlayerState,
  target: RenovationTarget,
): RenovationPlan | null => {
  const isLegal =
    (player.houseType === 'wood' && (target === 'clay' || target === 'stone'))
    || (player.houseType === 'clay' && target === 'stone')
  if (!isLegal) return null

  const material: 'clay' | 'stone' = target
  return {
    nextType: target,
    cost: {
      fees: [{ reed: 1 }],
      unitFee: { [material]: 1 },
      nb: player.rooms,
    },
  }
}

/**
 * Default next-target plan (no card adjustments). Wood→clay, clay→stone.
 * Used by D13 Trowel / E87 MasterRenovator to probe the player's eligible
 * renovation target, and internally as the fallback when no explicit target
 * is supplied in `params`.
 */
export const getRenovation = (player: PlayerState): RenovationPlan | null => {
  if (player.houseType === 'wood') return buildRenovationPlan(player, 'clay')
  if (player.houseType === 'clay') return buildRenovationPlan(player, 'stone')
  return null
}

const readSelectedTarget = (
  params?: Record<string, unknown>,
): RenovationTarget | null => {
  const value = params?.selectedOption
  if (value === 'clay' || value === 'stone') return value
  return null
}

const planForContext = (
  player: PlayerState,
  params?: Record<string, unknown>,
): RenovationPlan | null => {
  const explicit = readSelectedTarget(params)
  if (explicit) return buildRenovationPlan(player, explicit)
  return getRenovation(player)
}

export const canRenovate = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
  renovationOverride?: RenovationPlan | null,
) => {
  const renovation = renovationOverride ?? getRenovation(player)
  if (!renovation) return false
  const cost = mergeRenovationCost(renovation.cost, costOverride)
  return canAffordTypedFlatCost(player, cost, 'renovation')
}

export const renovateHouse = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
  renovationOverride?: RenovationPlan | null,
) => {
  const renovation = renovationOverride ?? getRenovation(player)
  if (!renovation) return false
  const cost = mergeRenovationCost(renovation.cost, costOverride)
  if (!payTypedFlatCost(player, cost, 'renovation')) return false
  player.houseType = renovation.nextType
  return true
}

const flattenRenovationCost = (cost: ComplexCost): Partial<Resource> => {
  const unit = cost.unitFee ?? {}
  const nb = cost.nb ?? 0
  const acc: Partial<Resource> = {}
  for (const [k, v] of Object.entries(unit)) {
    acc[k as keyof Resource] = (v ?? 0) * nb
  }
  return mergeResources(acc, cost.fees?.[0] ?? {})
}

const renovateHouseCostPreview: ActionCostPreview = {
  isStructurallyPossible: ({ player }) =>
    player.houseType === 'wood' || player.houseType === 'clay',
  canExecute: (context, costOverride) => {
    const { player, params } = context
    const plan = planForContext(player, params)
    if (!plan) return false
    const actionContext = (context as { actionContext?: Record<string, unknown> }).actionContext
    const cost = resolveRenovationActionCost(plan.cost, actionContext, costOverride)
    return cost ? canAffordTypedFlatCost(player, cost, 'renovation') : false
  },
  getBaseCost: (context) => {
    const { player, params } = context
    const plan = planForContext(player, params)
    if (!plan) return {}
    const actionContext = (context as { actionContext?: Record<string, unknown> }).actionContext
    const exactCost = readExactCost(actionContext)
    if (exactCost) return resolveUnitCostWithDelta({}, exactCost, undefined, 1) ?? {}
    return flattenRenovationCost(plan.cost)
  },
}

const baseRenovationOptions = (player: PlayerState): ActionChoiceOption[] => {
  if (player.houseType === 'wood') {
    return [
      { value: 'clay', labelKey: 'ui.interactionRenovateToClay' },
    ]
  }
  if (player.houseType === 'clay') {
    return [
      { value: 'stone', labelKey: 'ui.interactionRenovateToStone' },
    ]
  }
  return []
}

const buildRenovationPayChild = (cost: ComplexCost): InternalActionChild => {
  return buildInternalPayChild({
    cost,
    costType: 'renovation',
    optionPrefix: 'renovation',
  })
}

export const renovateHouseAction: ActionDefinition = {
  id: 'renovate-house',
  nameKey: 'actions.renovate-house.name',
  descriptionKey: 'actions.renovate-house.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, opts) =>
    canExecuteWithCostPreview(
      renovateHouseCostPreview,
      { state, player, actionContext: opts?.actionContext } as ActionAvailabilityContext & {
        actionContext?: Record<string, unknown>
      },
    ),
  costPreview: renovateHouseCostPreview,
  getBaseChoiceOptions: ({ player }) => baseRenovationOptions(player),
  choicePromptKey: 'ui.interactionChooseRenovationTarget',
  noChoiceLogKey: 'log.renovationFail',
  emitLeafActionDetail: true,
  execute: () => ({ type: 'fail', errorKey: 'log.renovationFail' }),
  resolveChoice: ({ player, params, costs, actionContext }, choice) => {
    const failure: ActionExecutionResult = { type: 'fail', errorKey: 'log.renovationFail' }
    const target: RenovationTarget | null =
      (choice === 'clay' || choice === 'stone' ? choice : null)
      ?? readSelectedTarget(params)
    if (!target) return failure
    const plan = buildRenovationPlan(player, target)
    if (!plan) return failure
    const totalCost = resolveRenovationActionCost(plan.cost, actionContext, costs)
    if (!totalCost) return failure
    const from = player.houseType
    return {
      type: 'ok',
      extraData: {
        renovation: {
          from,
          to: plan.nextType,
          rooms: player.roomTiles.map(({ row, col }) => ({ row, col })),
        },
      },
      internalChildren: {
        beforeHostListeners: [buildRenovationPayChild(totalCost)],
      },
    }
  },
  completeInternalChildren: ({ player, eventSink }, result) => {
    const renovation = readPendingRenovation(result)
    if (!renovation) return { type: 'ok' }
    player.houseType = renovation.to
    eventSink.emit<'farm.renovated'>({
      type: 'farm.renovated',
      playerId: player.id,
      from: renovation.from,
      to: renovation.to,
      rooms: renovation.rooms,
    })
    return result
  },
}
