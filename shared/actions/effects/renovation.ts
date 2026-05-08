import type {
  ActionChoiceOption,
  ActionCostPreview,
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
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
  totalCost: Partial<Resource>,
): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'pay',
      // Wrap as ComplexCost so the pay leaf's multi-solution branch runs and
      // surfaces a `prompt.selectPayment` choice when bonus modifiers (e.g.
      // A123 FrameBuilder, A87 Conservator) make more than one variant
      // affordable. A bare Partial<Resource> cost would auto-pay eagerly.
      params: {
        cost: { fee: totalCost },
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
  cost: Partial<Resource>
}

const mergeRenovationCost = (
  baseCost: Partial<Resource>,
  costOverride?: Partial<Resource>,
) => {
  if (!costOverride) return baseCost
  return {
    ...baseCost,
    ...Object.fromEntries(
      Object.entries(costOverride).map(([key, value]) => [
        key,
        Math.max(0, (baseCost[key as keyof Resource] ?? 0) + (value ?? 0)),
      ]),
    ),
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
  if (player.houseType === 'wood' && target === 'clay') {
    return { nextType: 'clay', cost: { clay: player.rooms, reed: 1 } }
  }
  if (player.houseType === 'wood' && target === 'stone') {
    return { nextType: 'stone', cost: { stone: player.rooms, reed: 1 } }
  }
  if (player.houseType === 'clay' && target === 'stone') {
    return { nextType: 'stone', cost: { stone: player.rooms, reed: 1 } }
  }
  return null
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

const renovateHouseCostPreview: ActionCostPreview = {
  isStructurallyPossible: ({ player }) =>
    player.houseType === 'wood' || player.houseType === 'clay',
  canExecute: ({ player, params }, costOverride) => {
    const plan = planForContext(player, params)
    return canRenovate(player, costOverride, plan)
  },
  getBaseCost: ({ player, params }) => planForContext(player, params)?.cost ?? {},
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
  execute: () => ({ type: 'fail', logKey: 'log.renovationFail' }),
  // 7b1: rewrite as `seq:[pay, apply-renovation]`. The pay leaf handles the
  // typed-flat (and any future ComplexCost) selection — including bonus and
  // surplus solutions — and only on success advances to apply-renovation,
  // which mutates `player.houseType`. This keeps mutate-after-pay invariant
  // shared with `apply-improvement`. Stale `pay:renovate:*` choice strings
  // are intercepted by the pay leaf's own resolveChoice fallback.
  resolveChoice: ({ player, params, costs }, choice) => {
    const failure: ActionExecutionResult = { type: 'fail', logKey: 'log.renovationFail' }
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
