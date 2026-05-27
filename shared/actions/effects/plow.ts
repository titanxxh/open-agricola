import type {
  ActionAvailabilityContext,
  ActionCostPreview,
  ActionDefinition,
  ActionMutationContext,
  ActionExecutionResult,
  FarmTilePosition,
  PlayerState,
  Resource,
} from '../../contract/types'
import { getAllTilePositions, positionKey } from '../../domain/farm'
import { canExecuteWithCostPreview } from '../helpers/cost-preview'
import { playerBoard } from '../../domain'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import { addCardResourceGained } from '../../cards/helpers/card-state'
// PaymentSolver namespace (S3 Task 7a): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// plow.ts only uses typed-flat helpers (shim scope), so no PaymentSolver
// call sites exist here yet.
import {
  canAffordTypedFlatCost,
  executeResolvedTypedFlatPayment,
  readExactCost,
  resolveUnitCostWithDelta,
  resolveTypedFlatPaymentSelection,
} from '../payment/internal'

const getOccupiedKeys = (player: PlayerState) => {
  const keys = new Set<string>()
  player.roomTiles.forEach((tile) => keys.add(positionKey(tile)))
  player.fields.forEach((field) =>
    keys.add(positionKey({ row: field.row, col: field.col })),
  )
  player.stableTiles.forEach((tile) => keys.add(positionKey(tile)))
  player.pastures.forEach((pasture) => {
    pasture.tiles.forEach((tile) => keys.add(positionKey(tile)))
  })
  return keys
}

const isAdjacentToField = (
  position: FarmTilePosition,
  fieldKeys: Set<string>,
) => {
  const deltas = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ]
  return deltas.some((delta) =>
    fieldKeys.has(`${position.row + delta.dr}-${position.col + delta.dc}`),
  )
}

export const getPlowableTiles = (player: PlayerState) => {
  const occupied = getOccupiedKeys(player)
  const lockedKeys = collectLockedFarmTileKeys(player)
  const fieldKeys = new Set(
    player.fields.map((field) =>
      positionKey({ row: field.row, col: field.col }),
    ),
  )
  if (fieldKeys.size === 0) {
    return getAllTilePositions().filter((pos) => {
      const key = positionKey(pos)
      return !occupied.has(key) && !lockedKeys.has(key)
    })
  }
  return getAllTilePositions().filter((pos) => {
    const key = positionKey(pos)
    if (occupied.has(key)) return false
    if (lockedKeys.has(key)) return false
    return isAdjacentToField(pos, fieldKeys)
  })
}

const plowCostPreview: ActionCostPreview = {
  isStructurallyPossible: (context) =>
    getAvailablePlowTiles(context.player, readPlowActionContext(context)).length > 0,
  getBaseCost: (context) =>
    resolvePlowCost(readPlowActionContext(context), undefined) ?? {},
  canExecute: (context, costs) => {
    const actionContext = readPlowActionContext(context)
    if (getAvailablePlowTiles(context.player, actionContext).length === 0) return false
    return canPayPlowCost(context.player, actionContext, costs)
  },
}

type PlowAvailabilityContext = ActionAvailabilityContext & {
  actionContext?: Record<string, unknown>
}

const readPlowActionContext = (
  context: ActionAvailabilityContext,
): Record<string, unknown> | undefined => {
  const actionContext = (context as PlowAvailabilityContext).actionContext
  if (actionContext) return actionContext
  const paramsActionContext = context.params?.actionContext
  if (!paramsActionContext || typeof paramsActionContext !== 'object') return undefined
  return paramsActionContext as Record<string, unknown>
}

const isFarmTilePosition = (value: unknown): value is FarmTilePosition => {
  if (!value || typeof value !== 'object') return false
  const tile = value as Partial<FarmTilePosition>
  return typeof tile.row === 'number' && typeof tile.col === 'number'
}

const readAllowedTiles = (
  actionContext: Record<string, unknown> | undefined,
): FarmTilePosition[] | undefined => {
  const allowedTiles = actionContext?.allowedTiles
  if (!Array.isArray(allowedTiles)) return undefined
  return allowedTiles.filter(isFarmTilePosition)
}

const getAvailablePlowTiles = (
  player: PlayerState,
  actionContext: Record<string, unknown> | undefined,
) => {
  const plowableTiles = getPlowableTiles(player)
  const allowedTiles = readAllowedTiles(actionContext)
  if (!allowedTiles) return plowableTiles
  const allowedKeys = new Set(allowedTiles.map(positionKey))
  return plowableTiles.filter((tile) => allowedKeys.has(positionKey(tile)))
}

const isPlowTileAllowed = (
  tile: unknown,
  actionContext: Record<string, unknown> | undefined,
): tile is FarmTilePosition => {
  if (!isFarmTilePosition(tile)) return false
  const allowedTiles = readAllowedTiles(actionContext)
  if (!allowedTiles) return true
  const allowedKeys = new Set(allowedTiles.map(positionKey))
  return allowedKeys.has(positionKey(tile))
}

const resolvePlowCost = (
  actionContext: Record<string, unknown> | undefined,
  costs: Partial<Resource> | undefined,
) => resolveUnitCostWithDelta({}, readExactCost(actionContext), costs, 1)

const canPayPlowCost = (
  player: PlayerState,
  actionContext: Record<string, unknown> | undefined,
  costs: Partial<Resource> | undefined,
) => {
  const cost = resolvePlowCost(actionContext, costs)
  return !!cost && canAffordTypedFlatCost(player, cost, 'plow')
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

const finalizePlow = (
  ctx: ActionMutationContext,
  tile: FarmTilePosition,
  paymentChoice: string | undefined,
): ActionExecutionResult => {
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const idx = ctx.state.players.indexOf(ctx.player)
  const validated = playerBoard(ctx.state, idx).farmyard.canPlow(tile, lockedKeys)
  if (!validated.ok) return { type: 'fail', errorKey: validated.error?.code ?? 'log.action' }
  const resolvedCost = resolvePlowCost(ctx.actionContext, ctx.costs)
  if (!resolvedCost) return { type: 'fail', errorKey: 'log.action' }
  const plowCost = sanitizePayableCost(resolvedCost)
  const payment = resolveTypedFlatPaymentSelection(
    validated.player as unknown as PlayerState,
    plowCost,
    'pay:plow',
    paymentChoice,
    { type: 'fail', errorKey: 'log.action' },
    'plow',
    ctx.state,
  )
  if (payment.type !== 'selected') return { type: 'fail', errorKey: 'log.action' }
  const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
  executeResolvedTypedFlatPayment(nextPlayer, payment, 'plow', ctx.state)
  applyPlayerMutation(ctx.player, nextPlayer)
  if (ctx.sourceCard) {
    addCardResourceGained(ctx.player, ctx.sourceCard, { field: 1 })
  }
  ctx.eventSink?.emit<'farm.fieldPlowed'>({
    type: 'farm.fieldPlowed',
    fields: [{ playerId: ctx.player.id, row: tile.row, col: tile.col }],
  })
  return {
    type: 'ok',
    resourcesPaid: sanitizePayableCost(payment.solution.resourcesPaid),
    extraData: { plowedTile: tile },
  }
}

export const plowAction: ActionDefinition = {
  id: 'plow',
  nameKey: 'actions.plow.name',
  descriptionKey: 'actions.plow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) =>
    canExecuteWithCostPreview(
      plowCostPreview,
      { state, player, actionContext: context?.actionContext } as PlowAvailabilityContext,
    ),
  costPreview: plowCostPreview,
  execute: ({ player, actionContext, costs }): ActionExecutionResult => {
    const selectableTiles = canPayPlowCost(player, actionContext, costs)
      ? getAvailablePlowTiles(player, actionContext)
      : []
    return {
      type: 'request',
      request: {
        kind: 'farm-select',
        farm: { farmType: 'plow', selectableTiles },
        options: [
          { value: 'confirm', labelKey: 'ui.interactionPlowConfirm' },
        ],
      },
      promptKey: 'ui.interactionPlowSelect',
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') {
      return { type: 'fail', errorKey: 'log.action', recoverable: true }
    }

    const lockedKeys = collectLockedFarmTileKeys(ctx.player)

    // Second call: payment combo selected after multi-combo prompt.
    const idx = ctx.state.players.indexOf(ctx.player)
    if (choice.startsWith('pay:plow:')) {
      const farmPayload = ctx.actionContext?.farmPayload as
        | { tile?: unknown }
        | undefined
      const tile = farmPayload?.tile
      if (!isPlowTileAllowed(tile, ctx.actionContext)) return { type: 'fail', errorKey: 'log.action' }
      const validated = playerBoard(ctx.state, idx).farmyard.canPlow(tile, lockedKeys)
      if (!validated.ok) {
        return { type: 'fail', errorKey: validated.error?.code ?? 'log.action' }
      }
      return finalizePlow(ctx, tile, choice)
    }

    // First call: client submitted tile geometry alongside `confirm`.
    if (payload && choice === 'confirm') {
      const tile = (payload as { tile?: unknown }).tile
      if (!isPlowTileAllowed(tile, ctx.actionContext)) return { type: 'fail', errorKey: 'log.action' }
      const validated = playerBoard(ctx.state, idx).farmyard.canPlow(tile, lockedKeys)
      if (!validated.ok) {
        return { type: 'fail', errorKey: validated.error?.code ?? 'log.action' }
      }
      const selectedTile = tile as FarmTilePosition
      const resolvedCost = resolvePlowCost(ctx.actionContext, ctx.costs)
      if (!resolvedCost) return { type: 'fail', errorKey: 'log.action' }
      const payment = resolveTypedFlatPaymentSelection(
        validated.player as unknown as PlayerState,
        sanitizePayableCost(resolvedCost),
        'pay:plow',
        undefined,
        { type: 'fail', errorKey: 'log.action' },
        'plow',
        ctx.state,
      )
      if (payment.type === 'request') {
        const options = payment.request.kind === 'choice' ? payment.request.options : []
        return {
          type: 'request',
          request: { kind: 'choice', options },
          promptKey: payment.promptKey,
          extraData: {
            actionContextWrite: { farmPayload: { tile: selectedTile } },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.action' }
      }
      return finalizePlow(ctx, selectedTile, undefined)
    }

    return { type: 'fail', errorKey: 'log.action' }
  },
}
