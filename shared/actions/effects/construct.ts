import type {
  ActionCostPreview,
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  FarmTilePosition,
  PlayerState,
} from '../../game/types'
// PaymentSolver namespace (S3 Task 7a): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// construct.ts only uses room-payment helpers (S4 domain aggregate scope),
// so no PaymentSolver call sites exist here yet.
import {
  buildRoomCostPerUnit,
  executeResolvedRoomPayment,
  getBuildRoomCost,
  getMaxBuildableRooms,
  resolveRoomPaymentSelection,
} from '../helpers/room-payment'
import { validateRoomSelection } from '../../logic/farm/validators'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { incRoomsBuilt } from '../../logic/stats'

const constructCostPreview: ActionCostPreview = {
  getBaseCost: ({ player }) => getBuildRoomCost(player.houseType),
  canExecute: (context, costOverride) =>
    getMaxBuildableRooms(context.player, costOverride) > 0,
}

const applyPlayerMutation = (target: PlayerState, source: PlayerState) => {
  for (const key of Object.keys(target) as Array<keyof PlayerState>) {
    if (!(key in source)) {
      delete (target as Record<string, unknown>)[key as string]
    }
  }
  Object.assign(target, source)
}

const finalizeRoom = (
  ctx: ActionExecutionContext,
  rooms: FarmTilePosition[],
  paymentChoice: string | undefined,
): ActionExecutionResult => {
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const selection = validateRoomSelection(ctx.player, rooms, lockedKeys)
  if (!selection.ok) return { type: 'fail', logKey: selection.code ?? 'log.action' }

  const maxUnits =
    typeof ctx.actionContext?.maxRooms === 'number'
      ? ctx.actionContext.maxRooms
      : undefined
  const maxBuildableRooms = getMaxBuildableRooms(
    ctx.player,
    ctx.costs,
    typeof maxUnits === 'number' ? { maxRooms: maxUnits } : undefined,
  )
  if (rooms.length > maxBuildableRooms) {
    return { type: 'fail', logKey: 'log.buildRoomFail' }
  }

  const costPerRoom = buildRoomCostPerUnit(ctx.player, ctx.costs)
  const payment = resolveRoomPaymentSelection(
    ctx.player,
    costPerRoom,
    rooms.length,
    paymentChoice,
  )
  if (payment.type !== 'selected') return { type: 'fail', logKey: 'log.buildRoomFail' }

  const nextPlayer = JSON.parse(JSON.stringify(ctx.player)) as PlayerState
  executeResolvedRoomPayment(nextPlayer, payment)
  nextPlayer.roomTiles = [...nextPlayer.roomTiles, ...rooms]
  nextPlayer.rooms = nextPlayer.rooms + rooms.length
  applyPlayerMutation(ctx.player, nextPlayer)

  if (ctx.sourceCard && rooms.length > 0) {
    const houseType = ctx.player.houseType
    const roomKey =
      houseType === 'wood' ? 'roomWood'
      : houseType === 'clay' ? 'roomClay'
      : 'roomStone'
    addCardResourceGained(ctx.player, ctx.sourceCard, { [roomKey]: rooms.length })
  }
  incRoomsBuilt(ctx.player, rooms.length)

  return { type: 'ok', extraData: { builtRooms: rooms } }
}

export const constructAction: ActionDefinition = {
  id: 'construct',
  nameKey: 'actions.construct.name',
  descriptionKey: 'actions.construct.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => getMaxBuildableRooms(player) > 0,
  costPreview: constructCostPreview,
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionRoomSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionRoomConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionRoomCancel' },
    ],
  }),
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') return { type: 'ok' }

    // Second call: payment combo selected after multi-combo prompt.
    if (choice.startsWith('pay:room:')) {
      const farmPayload = ctx.actionContext?.farmPayload as
        | { rooms?: FarmTilePosition[] }
        | undefined
      const rooms = farmPayload?.rooms
      if (!Array.isArray(rooms) || rooms.length === 0) {
        return { type: 'fail', logKey: 'log.buildRoomFail' }
      }
      return finalizeRoom(ctx, rooms, choice)
    }

    // First call: client submitted room geometry alongside `confirm`.
    if (payload && choice === 'confirm') {
      const rooms = (payload as { rooms?: FarmTilePosition[] }).rooms
      if (!Array.isArray(rooms) || rooms.length === 0) {
        return { type: 'fail', logKey: 'NO_SELECTION' }
      }
      const lockedKeys = collectLockedFarmTileKeys(ctx.player)
      const selection = validateRoomSelection(ctx.player, rooms, lockedKeys)
      if (!selection.ok) {
        return { type: 'fail', logKey: selection.code ?? 'log.buildRoomFail' }
      }

      const maxUnits =
        typeof ctx.actionContext?.maxRooms === 'number'
          ? ctx.actionContext.maxRooms
          : undefined
      const maxBuildableRooms = getMaxBuildableRooms(
        ctx.player,
        ctx.costs,
        typeof maxUnits === 'number' ? { maxRooms: maxUnits } : undefined,
      )
      if (rooms.length > maxBuildableRooms) {
        return { type: 'fail', logKey: 'log.buildRoomFail' }
      }

      const costPerRoom = buildRoomCostPerUnit(ctx.player, ctx.costs)
      const payment = resolveRoomPaymentSelection(
        ctx.player,
        costPerRoom,
        rooms.length,
      )
      if (payment.type === 'choice') {
        return {
          type: 'choice',
          promptKey: payment.promptKey,
          options: payment.options ?? [],
          extraData: {
            actionContextWrite: { farmPayload: { rooms } },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', logKey: 'log.buildRoomFail' }
      }
      return finalizeRoom(ctx, rooms, undefined)
    }

    return { type: 'fail', logKey: 'log.buildRoomFail' }
  },
}
