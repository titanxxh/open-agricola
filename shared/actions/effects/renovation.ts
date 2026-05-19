import type {
  ActionChoiceOption,
  ActionCostPreview,
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
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
} from '../payment/internal'
import { mergeResources } from '../../utils/resources'

const RENOVATE_PAYMENT_PREFIX = 'pay:renovate'

const renovatePaymentOptionPrefix = (target: RenovationTarget) =>
  `${RENOVATE_PAYMENT_PREFIX}:${target}`

const parseRenovatePaymentChoice = (
  choice: string,
): { target: RenovationTarget; value: string } | null => {
  const head = `${RENOVATE_PAYMENT_PREFIX}:`
  if (!choice.startsWith(head)) return null
  const remainder = choice.slice(head.length)
  const separator = remainder.indexOf(':')
  if (separator < 0) return null
  const target = remainder.slice(0, separator)
  if (target !== 'clay' && target !== 'stone') return null
  return { target, value: choice }
}

type RenovationTarget = Exclude<PlayerState['houseType'], 'wood'>

const buildRenovationFlow = (
  target: RenovationTarget,
  totalCost: ComplexCost,
): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'pay',
      // totalCost is already a ComplexCost (with unitFee + nb + fees[0]);
      // do NOT wrap in another { fee: ... }. The pay leaf's multi-solution
      // branch surfaces a `prompt.selectPayment` choice when bonus modifiers
      // (e.g. A123 FrameBuilder, A87 Conservator) make more than one variant
      // affordable.
      params: {
        cost: totalCost,
        costType: 'renovation',
        optionPrefix: renovatePaymentOptionPrefix(target),
      },
      actionContext: { costType: 'renovation' },
    },
    {
      type: 'leaf',
      actionId: 'apply-renovation',
      params: { nextType: target },
    },
  ],
})

type RenovationPlan = {
  nextType: RenovationTarget
  cost: ComplexCost
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
  canExecute: ({ player, params }, costOverride) => {
    const plan = planForContext(player, params)
    return canRenovate(player, costOverride, plan)
  },
  getBaseCost: ({ player, params }) => {
    const plan = planForContext(player, params)
    if (!plan) return {}
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

export const renovateHouseAction: ActionDefinition = {
  id: 'renovate-house',
  nameKey: 'actions.renovate-house.name',
  descriptionKey: 'actions.renovate-house.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    canExecuteWithCostPreview(renovateHouseCostPreview, { state, player }),
  costPreview: renovateHouseCostPreview,
  getBaseChoiceOptions: ({ player }) => baseRenovationOptions(player),
  choicePromptKey: 'ui.interactionChooseRenovationTarget',
  noChoiceLogKey: 'log.renovationFail',
  emitLeafActionDetail: true,
  execute: () => ({ type: 'fail', errorKey: 'log.renovationFail' }),
  // 7b1: rewrite as `seq:[pay, apply-renovation]`. The pay leaf handles the
  // typed-flat (and any future ComplexCost) selection — including bonus and
  // surplus solutions — and only on success advances to apply-renovation,
  // which mutates `player.houseType`. This keeps mutate-after-pay invariant
  // shared with `apply-improvement`. Stale `pay:renovate:*` choice strings
  // are intercepted by the pay leaf's own resolveChoice fallback.
  resolveChoice: ({ player, params, costs }, choice) => {
    const failure: ActionExecutionResult = { type: 'fail', errorKey: 'log.renovationFail' }
    const payment = typeof choice === 'string' ? parseRenovatePaymentChoice(choice) : null
    const target: RenovationTarget | null =
      payment?.target
      ?? (choice === 'clay' || choice === 'stone' ? choice : null)
      ?? readSelectedTarget(params)
    if (!target) return failure
    const plan = buildRenovationPlan(player, target)
    if (!plan) return failure
    const totalCost = mergeRenovationCost(plan.cost, costs)
    return { type: 'flow', flow: buildRenovationFlow(target, totalCost) }
  },
}
