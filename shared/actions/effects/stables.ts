import type {
  ActionAvailabilityContext,
  ActionCostPreview,
  ActionDefinition,
  ActionMutationContext,
  ActionExecutionResult,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../contract/types'
import { getNextEmptyTileForPlayer, positionKey } from '../../domain/farm'
import {
  payResources,
  readExactCost,
  resolveUnitCostWithDelta,
} from '../payment/internal'
import { stableWoodCost } from './fencing'
import { canExecuteWithCostPreview } from '../helpers/cost-preview'
// PaymentSolver namespace (S3 Task 7a): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
import { PaymentSolver } from '../payment'
import type { PaymentCtx } from '../payment'
import {
  resolveTypedFlatPaymentSelection,
} from '../payment/internal'
import { buildInternalPayChild } from '../helpers/pay-child'
import { playerBoard } from '../../domain'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'

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

type StableAvailabilityContext = ActionAvailabilityContext & {
  actionContext?: Record<string, unknown>
}

export const buildStable = (player: PlayerState): ActionExecutionResult => {
  const next = getNextEmptyTileForPlayer(player)
  if (!next) {
    return { type: 'fail', errorKey: 'log.buildStableFail' }
  }
  const stableCtx: PaymentCtx = { actionId: 'stables', costType: 'none' }
  if (!PaymentSolver.canAfford(buildSingletonState(player), 0, { wood: stableWoodCost }, stableCtx)) {
    return { type: 'fail', errorKey: 'log.buildStableFail' }
  }
  payResources(player, { wood: stableWoodCost })
  player.stableTiles.push(next)
  return { type: 'ok' }
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
  costs: Partial<Resource> | undefined,
): Partial<Resource> | undefined => {
  if (costs && Object.keys(costs).length > 0) return costs
  return readExactCost(actionContext) ? undefined : readCostOverride(actionContext)
}

const readStableActionContext = (
  context: ActionAvailabilityContext,
): Record<string, unknown> | undefined => {
  const actionContext = (context as StableAvailabilityContext).actionContext
  if (actionContext) return actionContext
  const paramsActionContext = context.params?.actionContext
  if (!paramsActionContext || typeof paramsActionContext !== 'object') return undefined
  return paramsActionContext as Record<string, unknown>
}

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
    if (pasture.size !== 1) continue
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
  costs: Partial<Resource> | undefined,
  count: number,
) => {
  if (!isWithinStableMax(actionContext, count)) return null
  return resolveUnitCostWithDelta(
    { wood: stableWoodCost },
    readExactCost(actionContext),
    readStableCostDelta(actionContext, costs),
    count,
  )
}

const buildStableFarmSelection = (
  state: GameState,
  player: PlayerState,
  actionContext: Record<string, unknown> | undefined,
  costs: Partial<Resource> | undefined,
) => {
  const zoneFilter = actionContext?.zoneFilter
  const max = actionContext?.max
  const reserve = getAvailableStableSupplyCount(state, player)
  const selectionMax = typeof max === 'number' ? Math.min(max, reserve) : reserve
  const idx = state.players.indexOf(player)
  return playerBoard(state, idx).farmyard.selectableTiles('stable', {
    costOverride: readStableCostDelta(actionContext, costs),
    exactCost: readExactCost(actionContext),
    zoneFilter: zoneFilter === 'pasture-1' ? 'pasture-1' : undefined,
    max: selectionMax,
  })
}

const isStableStructurallyPossible = ({ state, player }: ActionAvailabilityContext) =>
  getAvailableStableSupplyCount(state, player) > 0

const canExecuteStableCostPreview = (
  context: ActionAvailabilityContext,
  costs?: Partial<Resource>,
) => {
  if (!isStableStructurallyPossible(context)) return false
  const farm = buildStableFarmSelection(
    context.state,
    context.player,
    readStableActionContext(context),
    costs,
  )
  return farm.farmType === 'stable' && farm.maxSelections > 0
}

const stablesCostPreview: ActionCostPreview = {
  isStructurallyPossible: isStableStructurallyPossible,
  getBaseCost: (context) => {
    const actionContext = readStableActionContext(context)
    return resolveStableTotalCost(actionContext, undefined, 1) ?? {}
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

const applyPlayerMutation = (target: PlayerState, source: PlayerState) => {
  for (const key of Object.keys(target) as Array<keyof PlayerState>) {
    if (!(key in source)) {
      delete (target as Record<string, unknown>)[key as string]
    }
  }
  Object.assign(target, source)
}

const finalizeStables = (
  ctx: ActionMutationContext,
  stables: FarmTilePosition[],
  paymentChoice: string | undefined,
): ActionExecutionResult => {
  if (stables.length > getAvailableStableSupplyCount(ctx.state, ctx.player)) {
    return { type: 'fail', errorKey: 'log.buildStableFail' }
  }
  const placementError = validateStablePlacement(ctx, stables)
  if (placementError) return placementError
  const totalCost = resolveStableTotalCost(ctx.actionContext, ctx.costs, stables.length)
  if (!totalCost) return { type: 'fail', errorKey: 'log.buildStableFail' }
  const payment = resolveTypedFlatPaymentSelection(
    ctx.player,
    totalCost,
    'pay:stable',
    paymentChoice,
    { type: 'fail', errorKey: 'log.buildStableFail' },
    'stables',
    ctx.state,
  )
  if (payment.type !== 'selected') return { type: 'fail', errorKey: 'log.buildStableFail' }
  const nextPlayer = JSON.parse(JSON.stringify(ctx.player)) as PlayerState
  nextPlayer.stableTiles = [...nextPlayer.stableTiles, ...stables]
  applyPlayerMutation(ctx.player, nextPlayer)
  if (ctx.sourceCard) {
    addCardResourceGained(ctx.player, ctx.sourceCard, { stable: stables.length })
  }
  const resourcesPaid = sanitizePayableCost(payment.solution.resourcesPaid)
  ctx.eventSink?.emit<'farm.stableBuilt'>({
    type: 'farm.stableBuilt',
    sourceActionId: ctx.space.id,
    stables: stables.map((stable) => ({
      playerId: ctx.player.id,
      row: stable.row,
      col: stable.col,
    })),
  })
  return {
    type: 'ok',
    resourcesPaid,
    extraData: { builtStables: stables },
    internalChildren: {
      afterHostListeners: [
        buildInternalPayChild({
          cost: { fee: totalCost },
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
      { state, player, actionContext: opts?.actionContext } as StableAvailabilityContext,
      readStableCostDelta(opts?.actionContext, undefined),
  ),
  costPreview: stablesCostPreview,
  execute: ({ state, player, costs, actionContext }): ActionExecutionResult => {
    const farm = buildStableFarmSelection(state, player, actionContext, costs)
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
        | { stables?: FarmTilePosition[] }
        | undefined
      const stables = farmPayload?.stables
      if (!Array.isArray(stables) || stables.length === 0) {
        return { type: 'fail', errorKey: 'log.buildStableFail' }
      }
      return finalizeStables(ctx, stables, choice)
    }

    // First call: client submitted stable geometry alongside `confirm`.
    if (payload && choice === 'confirm') {
      const stables = (payload as { stables?: FarmTilePosition[] }).stables
      if (!Array.isArray(stables) || stables.length === 0) {
        return { type: 'fail', errorKey: 'NO_SELECTION' }
      }
      if (stables.length > getAvailableStableSupplyCount(ctx.state, ctx.player)) {
        return { type: 'fail', errorKey: 'log.buildStableFail' }
      }
      const placementError = validateStablePlacement(ctx, stables)
      if (placementError) return placementError
      const totalCost = resolveStableTotalCost(ctx.actionContext, ctx.costs, stables.length)
      if (!totalCost) return { type: 'fail', errorKey: 'log.buildStableFail' }
      const payment = resolveTypedFlatPaymentSelection(
        ctx.player,
        totalCost,
        'pay:stable',
        undefined,
        { type: 'fail', errorKey: 'log.buildStableFail' },
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
            actionContextWrite: { farmPayload: { stables } },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.buildStableFail' }
      }
      return finalizeStables(ctx, stables, undefined)
    }

    return { type: 'fail', errorKey: 'log.buildStableFail' }
  },
}

// re-export for external callers building actionContext
export { applyCostOverride } from '../payment/internal'
