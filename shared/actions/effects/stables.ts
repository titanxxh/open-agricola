import { getStandingSpecialStableCount } from '../../domain/stables'
import { commitFarmOperation } from '../../domain/farm-operations'
import { requireActionHookRegistry } from '../hooks'
import type {
  ActionCostAttribution,
  ActionAvailabilityContext,
  ActionCostPreview,
  ActionDefinition,
  ActionMutationContext,
  ActionExecutionResult,
  ComplexCost,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../contract/types'
import type { FarmStableBuiltEvent } from '../../contract/events'
import { getNextEmptyTileForPlayer, positionKey } from '../../domain/farm'
import { stableWoodCost } from './fencing'
import { canExecuteWithCostPreview } from '../helpers/cost-preview'
import { PaymentSolver, describePaymentEffectPreview } from '../payment'
import type { PaymentCtx } from '../payment'
import { buildInternalPayChild } from '../helpers/pay-child'
import { playerBoard } from '../../domain'
import {
  collectLockedFarmTileKeys,
  collectSpecialStablePositions,
  applySpecialStableAt,
} from '../../cards/card-effects'
import { collectFarmChoiceCostAdjustments } from '../../cards/card-listeners'
import { addCardResourceGained, recordActionCostAttribution } from '../../cards/helpers/card-state'
import { findMatureFutureStableEntry, getAvailableStableSupplyCount } from '../../domain/supply-tokens'
import { getPastureSize } from '../../domain/pasture'

// `actionContext.farmHand === true` is the generic gate set by the
// Farm-Expansion stables leaf wrapper to allow special card stables (e.g. B85
// FarmHand). Other "build a stable" effects (E148 / A089 / C94) leave it unset,
// so no special stable is offered there. The `farmHand` payload/protocol field
// names are kept for client compatibility.
const isSpecialStableEntry = (actionContext?: Record<string, unknown>): boolean =>
  actionContext?.farmHand === true

const readSpecialStablePayload = (
  actionContext: Record<string, unknown> | undefined,
  source: { farmHand?: FarmTilePosition } | undefined,
): FarmTilePosition | undefined => {
  if (!isSpecialStableEntry(actionContext)) return undefined
  const farmHand = source?.farmHand
  if (!farmHand) return undefined
  if (typeof farmHand.row !== 'number' || typeof farmHand.col !== 'number') return undefined
  return { row: farmHand.row, col: farmHand.col }
}

/**
 * Construct a minimal GameState wrapping a single player. Used by
 * buildStable's PaymentSolver.canAfford call where the function signature
 * doesn't carry GameState. Safe ONLY for simple-cost (non-ComplexCost)
 * affordability checks — those route through canPayResources which only
 * reads player.resources. Do not pass to ComplexCost paths or hook-firing
 * code paths.
 */
const buildSingletonState = (player: PlayerState): GameState =>
  ({ ...({} as GameState), players: [player] })

export const buildStable = (player: PlayerState): ActionExecutionResult => {
  const next = getNextEmptyTileForPlayer(player)
  if (!next) {
    return { type: 'fail', errorKey: 'log.buildStableFail' }
  }
  const stableCtx: PaymentCtx = { actionId: 'stables', costType: 'none' }
  if (!PaymentSolver.canAfford(buildSingletonState(player), 0, { wood: stableWoodCost }, stableCtx)) {
    return { type: 'fail', errorKey: 'log.buildStableFail' }
  }
  PaymentSolver.payResources(player, { wood: stableWoodCost })
  const farmOperation = commitFarmOperation(player, { kind: 'stables', positions: [next], standingSpecialStableCount: getStandingSpecialStableCount(player) })
  return { type: 'ok', farmOperations: [farmOperation] }
}

const readCostOverride = (
  actionContext?: Record<string, unknown>,
): Partial<Resource> | undefined => {
  const override = actionContext?.costOverride
  if (!override || typeof override !== 'object') return undefined
  return override as Partial<Resource>
}

const readStableCostDelta = (
  actionContext: Record<string, unknown> | undefined,
): Partial<Resource> | undefined => {
  return PaymentSolver.readExactCost(actionContext) ? undefined : readCostOverride(actionContext)
}

const readStableActionContext = (
  context: ActionAvailabilityContext,
): Record<string, unknown> | undefined => {
  const actionContext = context.actionContext
  if (actionContext) return actionContext
  const paramsActionContext = context.params?.actionContext
  if (!paramsActionContext || typeof paramsActionContext !== 'object') return undefined
  return paramsActionContext as Record<string, unknown>
}

const readFutureStableId = (actionContext?: Record<string, unknown>): string | undefined =>
  typeof actionContext?.futureMeepleId === 'string' ? actionContext.futureMeepleId : undefined

const readStableMax = (
  actionContext?: Record<string, unknown>,
): number | undefined => {
  const max = actionContext?.max
  if (typeof max !== 'number') return undefined
  return Math.max(0, Math.floor(max))
}

const isWithinStableMax = (
  actionContext: Record<string, unknown> | undefined,
  count: number,
) => {
  const max = readStableMax(actionContext)
  return max === undefined || count <= max
}

const isWithinStableZoneFilter = (
  player: PlayerState,
  stables: FarmTilePosition[],
  actionContext?: Record<string, unknown>,
): boolean => {
  if (actionContext?.zoneFilter !== 'pasture-1') return true
  const oneSizePastureCells = new Set<string>()
  for (const pasture of player.pastures ?? []) {
    if (getPastureSize(pasture) !== 1) continue
    for (const tile of pasture.tiles ?? []) {
      oneSizePastureCells.add(positionKey(tile))
    }
  }
  return stables.every((stable) => oneSizePastureCells.has(positionKey(stable)))
}

const validateStablePlacement = (
  ctx: ActionMutationContext,
  stables: FarmTilePosition[],
): ActionExecutionResult | undefined => {
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const idx = ctx.state.players.indexOf(ctx.player)
  const validated = playerBoard(ctx.state, idx).farmyard.canBuildStable(stables, lockedKeys)
  if (!validated.ok) return { type: 'fail', errorKey: validated.code ?? 'log.buildStableFail' }
  if (!isWithinStableZoneFilter(ctx.player, stables, ctx.actionContext)) {
    return { type: 'fail', errorKey: 'log.buildStableFail' }
  }
  return undefined
}

const resolveStableTotalCost = (
  actionContext: Record<string, unknown> | undefined,
  count: number,
) => {
  if (!isWithinStableMax(actionContext, count)) return null
  return PaymentSolver.resolveUnitCostWithDelta(
    { wood: stableWoodCost },
    PaymentSolver.readExactCost(actionContext),
    readStableCostDelta(actionContext),
    count,
  )
}

/**
 * Resolve payload-aware stable costs while retaining their per-unit structure.
 */
type StableCostResolution = {
  baseCost: Partial<Resource>
  finalCost: Partial<Resource>
  paymentCost: ComplexCost
  farmCostAttribution: ActionCostAttribution[]
}

const resolveStableTotalCostWithDiscount = (
  context: ActionAvailabilityContext,
  totalUnits: number,
): StableCostResolution | null => {
  const { state, player } = context
  const actionContext = readStableActionContext(context)
  const baseCost = resolveStableTotalCost(actionContext, totalUnits)
  const unitCost = resolveStableTotalCost(actionContext, 1)
  if (!baseCost || !unitCost) return null
  // Recompute the complete contribution with the selected quantity. Generic
  // ctx.costs was queried before that quantity existed and must not also
  // become a per-unit delta in the same payment plan.
  const adjustments = collectFarmChoiceCostAdjustments(requireActionHookRegistry(context.actionHooks), state, player, 'stables', {
    ...context.params,
    stableCount: totalUnits,
    stableUnitCost: unitCost,
  }, context.space, { sourceCard: context.sourceCard, actionContext })
  const finalCost: Partial<Resource> = { ...baseCost }
  for (const [key, delta] of Object.entries(adjustments.costs)) {
    if (typeof delta !== 'number' || delta === 0) continue
    const k = key as keyof Resource
    finalCost[k] = Math.max(0, (finalCost[k] ?? 0) + delta)
    if (finalCost[k] === 0) delete finalCost[k]
  }
  const paymentCost: ComplexCost = { unitFee: unitCost, nb: totalUnits }
  if (Object.keys(adjustments.costs).length > 0) paymentCost.fee = adjustments.costs
  if (adjustments.trades.length > 0) paymentCost.trades = adjustments.trades
  if (adjustments.bonuses.length > 0) paymentCost.bonuses = adjustments.bonuses
  if (adjustments.paymentResourceProviders.length > 0) {
    paymentCost.paymentResourceProviders = adjustments.paymentResourceProviders
  }
  return {
    baseCost,
    finalCost,
    paymentCost,
    farmCostAttribution: adjustments.costAttribution,
  }
}

const buildStableFarmSelection = (
  context: ActionAvailabilityContext,
) => {
  const { state, player } = context
  const actionContext = readStableActionContext(context)
  const zoneFilter = actionContext?.zoneFilter
  const max = actionContext?.max
  const reserve = getAvailableStableSupplyCount(state, player, readFutureStableId(actionContext))
  const selectionMax = typeof max === 'number' ? Math.min(max, reserve) : reserve
  const idx = state.players.indexOf(player)
  // Affordability must use the count-dependent TOTAL cost, which the farmyard's
  // per-unit `costOverride` scan cannot express when a discount is non-uniform
  // (e.g. C88 only cheapens the 3rd/4th card-facing stable). Probe each build
  // count 1..reserve through `resolveStableTotalCostWithDiscount` — the same
  // total used at settlement — and take the largest count the player can pay.
  // Total cost is monotonic in count (each extra stable adds ≥1 wood), so the
  // first unaffordable count terminates the scan.
  let affordableMax = 0
  for (let count = 1; count <= selectionMax; count += 1) {
    const resolution = resolveStableTotalCostWithDiscount(context, count)
    if (!resolution) break
    if (!PaymentSolver.canAffordTypedFlatCost(player, resolution.paymentCost, 'stables', state)) break
    affordableMax = count
  }
  const farm = playerBoard(state, idx).farmInteraction.selectableTiles('stable', {
    costOverride: readStableCostDelta(actionContext),
    exactCost: PaymentSolver.readExactCost(actionContext),
    zoneFilter: zoneFilter === 'pasture-1' ? 'pasture-1' : undefined,
    max: selectionMax,
  })
  if (farm.farmType !== 'stable') return farm
  // Replace the farmyard's per-unit affordability cap with our count-aware one.
  // `affordableMax` already folds in supply reserve and `actionContext.max`
  // (its scan bound is `selectionMax`); geometry bounds it via selectable tiles.
  farm.maxSelections = Math.min(farm.selectableTiles.length, affordableMax)
  const farmHandPositions = isSpecialStableEntry(actionContext)
    ? collectSpecialStablePositions(state, player).map((c) => c.position)
    : []
  return farmHandPositions.length > 0 ? { ...farm, farmHandPositions } : farm
}

const isStableStructurallyPossible = (context: ActionAvailabilityContext) =>
  getAvailableStableSupplyCount(context.state, context.player, readFutureStableId(readStableActionContext(context))) > 0

const canExecuteStableCostPreview = (
  context: ActionAvailabilityContext,
) => {
  if (!isStableStructurallyPossible(context)) return false
  const farm = buildStableFarmSelection(context)
  if (farm.farmType !== 'stable') return false
  if (farm.maxSelections > 0) return true
  return (farm.farmHandPositions?.length ?? 0) > 0
}

const stablesCostPreview: ActionCostPreview = {
  unitCost: 'stable',
  isStructurallyPossible: isStableStructurallyPossible,
  getBaseCost: (context) => {
    const actionContext = readStableActionContext(context)
    return resolveStableTotalCost(actionContext, 1) ?? {}
  },
  canExecute: canExecuteStableCostPreview,
}

const sanitizePayableCost = (
  cost: Partial<Resource> | undefined,
): Partial<Resource> => {
  const payable: Partial<Resource> = {}
  Object.entries(cost ?? {}).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    payable[key as keyof Resource] = value
  })
  return payable
}


const finalizeStables = (
  ctx: ActionMutationContext,
  stables: FarmTilePosition[],
  paymentChoice: string | undefined,
  farmHand: FarmTilePosition | undefined,
): ActionExecutionResult => {
  const totalUnits = stables.length + (farmHand ? 1 : 0)
  if (totalUnits > getAvailableStableSupplyCount(ctx.state, ctx.player, readFutureStableId(ctx.actionContext))) {
    return { type: 'fail', errorKey: 'log.buildStableFail' }
  }
  const placementError = stables.length > 0 ? validateStablePlacement(ctx, stables) : undefined
  if (placementError?.type === 'fail') return { ...placementError, recoverable: true }
  const costResolution = resolveStableTotalCostWithDiscount(
    ctx,
    totalUnits,
  )
  if (!costResolution) return { type: 'fail', errorKey: 'log.buildStableFail' }
  const payment = PaymentSolver.resolveTypedFlatPaymentSelection(
    ctx.player,
    costResolution.paymentCost,
    'pay:stable',
    paymentChoice,
    { type: 'fail', errorKey: 'log.buildStableFail' },
    'stables',
    ctx.state,
  )
  if (payment.type !== 'selected') {
    return { type: 'fail', errorKey: 'log.buildStableFail', recoverable: payment.type === 'fail' && payment.recoverable === true }
  }
  const nextPlayer = JSON.parse(JSON.stringify(ctx.player)) as PlayerState
  let specialSourceCardId: string | undefined
  if (farmHand) {
    const applied = applySpecialStableAt(ctx.state, nextPlayer, farmHand)
    if (!applied) return { type: 'fail', errorKey: 'log.buildStableFail', recoverable: true }
    specialSourceCardId = applied.sourceCardId
  }
  const farmOperation = commitFarmOperation(ctx.player, { kind: 'stables', positions: stables, standingSpecialStableCount: getStandingSpecialStableCount(ctx.player), specialStables: farmHand && specialSourceCardId ? [{ ...farmHand, sourceCardId: specialSourceCardId }] : [], preparedPlayer: nextPlayer, sourceCardId: ctx.sourceCard }, ctx.eventSink)
  const futureStable = findMatureFutureStableEntry(ctx.state, ctx.player, readFutureStableId(ctx.actionContext))
  if (futureStable) futureStable.resources.stable = Math.max(0, (futureStable.resources.stable ?? 0) - totalUnits)
  recordActionCostAttribution(
    ctx.player,
    costResolution.farmCostAttribution,
    costResolution.baseCost,
    costResolution.finalCost,
  )
  if (ctx.sourceCard) {
    addCardResourceGained(ctx.player, ctx.sourceCard, { stable: stables.length })
  }
  const resourcesPaid = sanitizePayableCost(payment.solution.resourcesPaid)
  const stableItems: FarmStableBuiltEvent['stables'] = stables.map((stable) => ({
    playerId: ctx.player.id,
    row: stable.row,
    col: stable.col,
    kind: 'normal',
  }))
  if (farmHand && specialSourceCardId) {
    stableItems.push({
      playerId: ctx.player.id,
      row: farmHand.row,
      col: farmHand.col,
      kind: 'special',
      sourceCardId: specialSourceCardId,
    })
  }
  ctx.eventSink?.emit<'farm.stableBuilt'>({
    type: 'farm.stableBuilt',
    newlyUsedTiles: farmOperation.newlyUsedTiles,
    sourceActionId: ctx.space.id,
    stables: stableItems,
  })
  return {
    type: 'ok',
    farmOperations: [farmOperation],
    resourcesPaid,
    extraData: { builtStables: stables },
    internalChildren: {
      beforeHostListeners: [
        buildInternalPayChild({
          cost: costResolution.paymentCost,
          costType: 'stables',
          optionPrefix: 'pay:stable',
          paymentChoice,
          sourceCard: ctx.sourceCard,
          sourceActionId: ctx.space.id,
        }),
      ],
    },
  }
}

export const stablesAction: ActionDefinition = {
  id: 'stables',
  nameKey: 'actions.stables.name',
  descriptionKey: 'actions.stables.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, opts) =>
    canExecuteWithCostPreview(
      stablesCostPreview,
      { ...opts, actionHooks: opts?.actionHooks, state, player },
  ),
  costPreview: stablesCostPreview,
  previewEffect: (context) => {
    const { state, player, actionContext, previewMode } = context
    if (previewMode === 'base') return { kind: 'unitCost', unit: 'stable' as const, actionNameKey: 'actions.stables.name', resourcesPaid: stablesCostPreview.getBaseCost({ actionHooks: context.actionHooks, state, player, params: { actionContext } }) }

    const selection = buildStableFarmSelection(context)
    if (selection.farmType !== 'stable') return undefined
    return { kind: 'actionCosts', actionNameKey: 'actions.stables.name',
      options: Array.from({ length: selection.maxSelections }, (_, index) => {
        const resolution = resolveStableTotalCostWithDiscount(context, index + 1)
        const solutions = resolution ? PaymentSolver.computeOptions(state, state.players.indexOf(player), resolution.paymentCost, { actionId: 'stables', costType: 'stables' }) : []
        return { amount: index + 1, paymentOptions: solutions.map(solution => describePaymentEffectPreview(solution, false, { paymentResourceProviders: resolution?.paymentCost.paymentResourceProviders })) }
      }),
    }
  },
  execute: (context): ActionExecutionResult => {
    const farm = buildStableFarmSelection(context)
    return {
      type: 'request',
      request: {
        kind: 'farm-select',
        farm,
        options: [
          { value: 'confirm', labelKey: 'ui.interactionStableConfirm' },
        ],
      },
      promptKey: 'ui.interactionStableSelect',
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') {
      return {
        type: 'fail',
        errorKey: 'log.buildStableFail',
        recoverable: true,
      }
    }

    // Second call: payment combo selected after multi-combo prompt.
    if (choice.startsWith('pay:stable:')) {
      const farmPayload = ctx.actionContext?.farmPayload as
        | { stables?: FarmTilePosition[]; farmHand?: FarmTilePosition }
        | undefined
      const stables = farmPayload?.stables
      const farmHand = readSpecialStablePayload(ctx.actionContext, farmPayload)
      if (!Array.isArray(stables) || (stables.length === 0 && !farmHand)) {
        return { type: 'fail', errorKey: 'log.buildStableFail' }
      }
      return finalizeStables(ctx, stables, choice, farmHand)
    }

    // First call: client submitted stable geometry alongside `confirm`.
    if (payload && choice === 'confirm') {
      const stables = (payload as { stables?: FarmTilePosition[] }).stables ?? []
      const farmHand = readSpecialStablePayload(
        ctx.actionContext,
        payload as { farmHand?: FarmTilePosition },
      )
      const totalUnits = stables.length + (farmHand ? 1 : 0)
      if (totalUnits === 0) {
        return { type: 'fail', errorKey: 'NO_SELECTION', recoverable: true }
      }
      if (totalUnits > getAvailableStableSupplyCount(ctx.state, ctx.player, readFutureStableId(ctx.actionContext))) {
        return { type: 'fail', errorKey: 'log.buildStableFail', recoverable: true }
      }
      const placementError = stables.length > 0 ? validateStablePlacement(ctx, stables) : undefined
      if (placementError?.type === 'fail') return { ...placementError, recoverable: true }
      if (farmHand && !collectSpecialStablePositions(ctx.state, ctx.player).some(({ position }) =>
        position.row === farmHand.row && position.col === farmHand.col,
      )) {
        return { type: 'fail', errorKey: 'log.buildStableFail', recoverable: true }
      }
      const costResolution = resolveStableTotalCostWithDiscount(
        ctx,
        totalUnits,
      )
      if (!costResolution) return { type: 'fail', errorKey: 'log.buildStableFail', recoverable: true }
      const payment = PaymentSolver.resolveTypedFlatPaymentSelection(
        ctx.player,
        costResolution.paymentCost,
        'pay:stable',
        undefined,
        { type: 'fail', errorKey: 'log.buildStableFail', recoverable: true },
        'stables',
        ctx.state,
      )
      if (payment.type === 'request') {
        const options = payment.request.kind === 'choice' ? payment.request.options : []
        return {
          type: 'request',
          request: { kind: 'choice', options },
          promptKey: payment.promptKey,
          extraData: {
            actionContextWrite: { farmPayload: { stables, farmHand } },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.buildStableFail', recoverable: true }
      }
      return finalizeStables(ctx, stables, undefined, farmHand)
    }

    return { type: 'fail', errorKey: 'log.buildStableFail', recoverable: true }
  },
}
