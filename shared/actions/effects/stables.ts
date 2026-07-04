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
import type { FarmStableBuiltEvent } from '../../contract/events'
import { getNextEmptyTileForPlayer, positionKey } from '../../domain/farm'
import { stableWoodCost } from './fencing'
import { canExecuteWithCostPreview } from '../helpers/cost-preview'
import { PaymentSolver } from '../payment'
import type { PaymentCtx } from '../payment'
import { buildInternalPayChild } from '../helpers/pay-child'
import { playerBoard } from '../../domain'
import {
  collectLockedFarmTileKeys,
  collectSpecialStablePositions,
  applySpecialStableAt,
} from '../../cards/card-effects'
import { collectComputeCostsForFarmChoice } from '../../cards/card-listeners'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'

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
  PaymentSolver.payResources(player, { wood: stableWoodCost })
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
  return PaymentSolver.readExactCost(actionContext) ? undefined : readCostOverride(actionContext)
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
  return PaymentSolver.resolveUnitCostWithDelta(
    { wood: stableWoodCost },
    PaymentSolver.readExactCost(actionContext),
    readStableCostDelta(actionContext, costs),
    count,
  )
}

/**
 * Aggregate computeCosts/stables card discounts that depend on how many
 * stables this build crosses (e.g. C88 Carpenter's Apprentice gives the 3rd
 * and 4th card-facing stable -1 wood each). Mirrors fencing's
 * `computeFreeFenceTotal`: the listener is fed the per-build `stableCount` and
 * returns a single aggregate delta, which is applied to the base total cost.
 */
const applyStableBuildDiscount = (
  state: GameState,
  player: PlayerState,
  baseCost: Partial<Resource> | null,
  totalUnits: number,
): Partial<Resource> | null => {
  if (!baseCost) return baseCost
  const override = collectComputeCostsForFarmChoice(state, player, 'stables', {
    stableCount: totalUnits,
  })
  const result: Partial<Resource> = { ...baseCost }
  for (const [key, delta] of Object.entries(override)) {
    if (typeof delta !== 'number' || delta === 0) continue
    const k = key as keyof Resource
    result[k] = Math.max(0, (result[k] ?? 0) + delta)
    if (result[k] === 0) delete result[k]
  }
  return result
}

const resolveStableTotalCostWithDiscount = (
  state: GameState,
  player: PlayerState,
  actionContext: Record<string, unknown> | undefined,
  costs: Partial<Resource> | undefined,
  totalUnits: number,
): Partial<Resource> | null =>
  // `costs` carries the dispatcher's per-unit computeCosts delta (e.g. a flat
  // per-stable modifier). C88 deliberately stays out of that pass — it needs
  // the real build count — and is applied here against `totalUnits` via
  // applyStableBuildDiscount, so the two never double-count the same card.
  applyStableBuildDiscount(
    state,
    player,
    resolveStableTotalCost(actionContext, costs, totalUnits),
    totalUnits,
  )

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
  // Affordability must use the count-dependent TOTAL cost, which the farmyard's
  // per-unit `costOverride` scan cannot express when a discount is non-uniform
  // (e.g. C88 only cheapens the 3rd/4th card-facing stable). Probe each build
  // count 1..reserve through `resolveStableTotalCostWithDiscount` — the same
  // total used at settlement — and take the largest count the player can pay.
  // Total cost is monotonic in count (each extra stable adds ≥1 wood), so the
  // first unaffordable count terminates the scan.
  let affordableMax = 0
  for (let count = 1; count <= selectionMax; count += 1) {
    const total = resolveStableTotalCostWithDiscount(state, player, actionContext, costs, count)
    if (!total) break
    if (!PaymentSolver.canAffordTypedFlatCost(player, total, 'stables', state)) break
    affordableMax = count
  }
  const farm = playerBoard(state, idx).farmyard.selectableTiles('stable', {
    costOverride: readStableCostDelta(actionContext, costs),
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
  if (farm.farmType !== 'stable') return false
  if (farm.maxSelections > 0) return true
  return (farm.farmHandPositions?.length ?? 0) > 0
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
  farmHand: FarmTilePosition | undefined,
): ActionExecutionResult => {
  const totalUnits = stables.length + (farmHand ? 1 : 0)
  if (totalUnits > getAvailableStableSupplyCount(ctx.state, ctx.player)) {
    return { type: 'fail', errorKey: 'log.buildStableFail' }
  }
  const placementError = stables.length > 0 ? validateStablePlacement(ctx, stables) : undefined
  if (placementError) return placementError
  const totalCost = resolveStableTotalCostWithDiscount(
    ctx.state,
    ctx.player,
    ctx.actionContext,
    ctx.costs,
    totalUnits,
  )
  if (!totalCost) return { type: 'fail', errorKey: 'log.buildStableFail' }
  const payment = PaymentSolver.resolveTypedFlatPaymentSelection(
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
  let specialSourceCardId: string | undefined
  if (farmHand) {
    const applied = applySpecialStableAt(ctx.state, nextPlayer, farmHand)
    if (!applied) return { type: 'fail', errorKey: 'log.buildStableFail' }
    specialSourceCardId = applied.sourceCardId
  }
  applyPlayerMutation(ctx.player, nextPlayer)
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
    sourceActionId: ctx.space.id,
    stables: stableItems,
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
        return { type: 'fail', errorKey: 'NO_SELECTION' }
      }
      if (totalUnits > getAvailableStableSupplyCount(ctx.state, ctx.player)) {
        return { type: 'fail', errorKey: 'log.buildStableFail' }
      }
      const placementError = stables.length > 0 ? validateStablePlacement(ctx, stables) : undefined
      if (placementError) return placementError
      const totalCost = resolveStableTotalCostWithDiscount(
        ctx.state,
        ctx.player,
        ctx.actionContext,
        ctx.costs,
        totalUnits,
      )
      if (!totalCost) return { type: 'fail', errorKey: 'log.buildStableFail' }
      const payment = PaymentSolver.resolveTypedFlatPaymentSelection(
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
            actionContextWrite: { farmPayload: { stables, farmHand } },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.buildStableFail' }
      }
      return finalizeStables(ctx, stables, undefined, farmHand)
    }

    return { type: 'fail', errorKey: 'log.buildStableFail' }
  },
}
