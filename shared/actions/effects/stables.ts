import type {
  ActionCostPreview,
  ActionDefinition,
  ActionMutationContext,
  ActionExecutionResult,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../contract/types'
import { getNextEmptyTileForPlayer } from '../../domain/farm'
import { payResources, applyCostOverride } from '../payment/internal'
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
  payResources(player, { wood: stableWoodCost })
  player.stableTiles.push(next)
  return { type: 'ok' }
}

const stablesCostPreview: ActionCostPreview = {
  isStructurallyPossible: ({ player }) => player.stableTiles.length < 4,
  getBaseCost: () => ({ wood: stableWoodCost }),
}

const readCostOverride = (
  actionContext?: Record<string, unknown>,
): Partial<Resource> | undefined => {
  const override = actionContext?.costOverride
  if (!override || typeof override !== 'object') return undefined
  return override as Partial<Resource>
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

const scaleCost = (
  costPerUnit: Partial<Resource>,
  count: number,
): Partial<Resource> => {
  const total: Partial<Resource> = {}
  Object.entries(costPerUnit).forEach(([key, value]) => {
    if (typeof value !== 'number') return
    total[key as keyof Resource] = value * count
  })
  return sanitizePayableCost(total)
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
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const idx = ctx.state.players.indexOf(ctx.player)
  const validated = playerBoard(ctx.state, idx).farmyard.canBuildStable(stables, lockedKeys)
  if (!validated.ok) return { type: 'fail', errorKey: validated.code ?? 'log.buildStableFail' }
  const costOverride = readCostOverride(ctx.actionContext) ?? ctx.costs
  const costPerStable = applyCostOverride({ wood: stableWoodCost }, costOverride)
  const totalCost = scaleCost(costPerStable, stables.length)
  const payment = resolveTypedFlatPaymentSelection(
    ctx.player,
    totalCost,
    'pay:stable',
    paymentChoice,
    { type: 'fail', errorKey: 'log.buildStableFail' },
    'stables',
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
    canExecuteWithCostPreview(stablesCostPreview, { state, player }, readCostOverride(opts?.actionContext)),
  costPreview: stablesCostPreview,
  execute: ({ state, player, costs, actionContext }): ActionExecutionResult => {
    const zoneFilter = actionContext?.zoneFilter
    const max = actionContext?.max
    const idx = state.players.indexOf(player)
    const farm = playerBoard(state, idx).farmyard.selectableTiles('stable', {
      costOverride: costs,
      zoneFilter: zoneFilter === 'pasture-1' ? 'pasture-1' : undefined,
      max: typeof max === 'number' ? max : undefined,
    })
    return {
      type: 'request',
      request: {
        kind: 'farm-select',
        farm,
        options: [
          { value: 'confirm', labelKey: 'ui.interactionStableConfirm' },
          { value: 'cancel', labelKey: 'ui.interactionStableCancel' },
        ],
      },
      promptKey: 'ui.interactionStableSelect',
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') return { type: 'ok' }

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
      const lockedKeys = collectLockedFarmTileKeys(ctx.player)
      const idx = ctx.state.players.indexOf(ctx.player)
      const validated = playerBoard(ctx.state, idx).farmyard.canBuildStable(stables, lockedKeys)
      if (!validated.ok) {
        return { type: 'fail', errorKey: validated.code ?? 'log.buildStableFail' }
      }
      const costOverride = readCostOverride(ctx.actionContext) ?? ctx.costs
      const costPerStable = applyCostOverride({ wood: stableWoodCost }, costOverride)
      const totalCost = scaleCost(costPerStable, stables.length)
      const payment = resolveTypedFlatPaymentSelection(
        ctx.player,
        totalCost,
        'pay:stable',
        undefined,
        { type: 'fail', errorKey: 'log.buildStableFail' },
        'stables',
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
export { applyCostOverride }
