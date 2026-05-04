import type {
  ActionCostPreview,
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  FarmTilePosition,
  PlayerState,
  Resource,
} from '../../game/types'
import { getAllTilePositions, positionKey } from '../../game/farm'
import { canExecuteWithCostPreview } from '../helpers/cost-preview'
import { validatePlowSelection } from '../../logic/farm/plow-validation'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import { addCardResourceGained } from '../../cards/helpers/card-state'
// PaymentSolver namespace (S3 Task 7a): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// plow.ts only uses typed-flat helpers (shim scope), so no PaymentSolver
// call sites exist here yet.
import {
  executeResolvedTypedFlatPayment,
  resolveTypedFlatPaymentSelection,
} from '../helpers/pay-helpers'

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
  const fieldKeys = new Set(
    player.fields.map((field) =>
      positionKey({ row: field.row, col: field.col }),
    ),
  )
  if (fieldKeys.size === 0) {
    return getAllTilePositions().filter(
      (pos) => !occupied.has(positionKey(pos)),
    )
  }
  return getAllTilePositions().filter((pos) => {
    if (occupied.has(positionKey(pos))) return false
    return isAdjacentToField(pos, fieldKeys)
  })
}

const plowCostPreview: ActionCostPreview = {
  isStructurallyPossible: ({ player }) => getPlowableTiles(player).length > 0,
  getBaseCost: () => ({}),
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
  ctx: ActionExecutionContext,
  tile: FarmTilePosition,
  paymentChoice: string | undefined,
): ActionExecutionResult => {
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const validated = validatePlowSelection(ctx.player, tile, lockedKeys)
  if (!validated.ok) return { type: 'fail', logKey: validated.error?.code ?? 'log.action' }
  const plowCost = sanitizePayableCost(ctx.costs)
  const payment = resolveTypedFlatPaymentSelection(
    validated.player as unknown as PlayerState,
    plowCost,
    'pay:plow',
    paymentChoice,
    { type: 'fail', logKey: 'log.action' },
    'plow',
  )
  if (payment.type !== 'selected') return { type: 'fail', logKey: 'log.action' }
  const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
  executeResolvedTypedFlatPayment(nextPlayer, payment, 'plow')
  applyPlayerMutation(ctx.player, nextPlayer)
  if (ctx.sourceCard) {
    addCardResourceGained(ctx.player, ctx.sourceCard, { field: 1 })
  }
  return { type: 'ok', extraData: { plowedTile: tile } }
}

export const plowAction: ActionDefinition = {
  id: 'plow',
  nameKey: 'actions.plow.name',
  descriptionKey: 'actions.plow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    canExecuteWithCostPreview(plowCostPreview, { state, player }),
  costPreview: plowCostPreview,
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionPlowSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionPlowConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionPlowCancel' },
    ],
  }),
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') return { type: 'ok' }

    const lockedKeys = collectLockedFarmTileKeys(ctx.player)

    // Second call: payment combo selected after multi-combo prompt.
    if (choice.startsWith('pay:plow:')) {
      const farmPayload = ctx.actionContext?.farmPayload as
        | { tile?: FarmTilePosition }
        | undefined
      const tile = farmPayload?.tile
      if (!tile) return { type: 'fail', logKey: 'log.action' }
      const validated = validatePlowSelection(ctx.player, tile, lockedKeys)
      if (!validated.ok) {
        return { type: 'fail', logKey: validated.error?.code ?? 'log.action' }
      }
      return finalizePlow(ctx, tile, choice)
    }

    // First call: client submitted tile geometry alongside `confirm`.
    if (payload && choice === 'confirm') {
      const tile = (payload as { tile?: FarmTilePosition }).tile
      const validated = validatePlowSelection(ctx.player, tile, lockedKeys)
      if (!validated.ok) {
        return { type: 'fail', logKey: validated.error?.code ?? 'log.action' }
      }
      const selectedTile = tile as FarmTilePosition
      const payment = resolveTypedFlatPaymentSelection(
        validated.player as unknown as PlayerState,
        sanitizePayableCost(ctx.costs),
        'pay:plow',
        undefined,
        { type: 'fail', logKey: 'log.action' },
        'plow',
      )
      if (payment.type === 'choice') {
        return {
          type: 'choice',
          promptKey: payment.promptKey,
          options: payment.options ?? [],
          extraData: {
            actionContextWrite: { farmPayload: { tile: selectedTile } },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', logKey: 'log.action' }
      }
      return finalizePlow(ctx, selectedTile, undefined)
    }

    return { type: 'fail', logKey: 'log.action' }
  },
}
