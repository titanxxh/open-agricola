import type {
  ActionCostPreview,
  ActionDefinition,
  ActionMutationContext,
  ActionExecutionResult,
  ComplexCost,
  FarmTilePosition,
  InternalActionChild,
  PlayerState,
  Resource,
} from '../../contract/types'
// PaymentSolver namespace (S3 Task 7a): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// construct.ts only uses room-payment helpers (S4 domain aggregate scope),
// so no PaymentSolver call sites exist here yet.
import {
  applyCostOverride,
  getBuildRoomCost,
  getMaxBuildableRooms,
  resolveRoomPaymentSelection,
} from '../payment/internal'
import { buildPayChild, type PayChildOptions } from '../helpers/pay-child'
import { playerBoard } from '../../domain'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { incRoomsBuilt } from '../../session/stats'

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

const positiveResources = (resources: Partial<Resource>): Partial<Resource> => {
  const result: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    result[key as keyof Resource] = value
  })
  return result
}

const buildInternalPayChild = (
  options: PayChildOptions & { paymentChoice?: string },
): InternalActionChild => {
  const payChild = buildPayChild(options)
  if (payChild.type !== 'leaf') {
    throw new Error('Expected pay child leaf')
  }
  return {
    actionId: payChild.actionId,
    sourceCard: payChild.sourceCard,
    params: payChild.params,
    resultKey: 'payment',
  }
}

const buildConstructPayCost = (
  player: PlayerState,
  costOverride: Partial<Resource> | undefined,
  rooms: number,
): ComplexCost => ({
  unitFee: applyCostOverride(getBuildRoomCost(player.houseType), costOverride),
  nb: rooms,
})

const finalizeRoom = (
  ctx: ActionMutationContext,
  rooms: FarmTilePosition[],
  paymentChoice: string | undefined,
): ActionExecutionResult => {
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const idx = ctx.state.players.indexOf(ctx.player)
  const selection = playerBoard(ctx.state, idx).farmyard.canBuildRoom(rooms, lockedKeys)
  if (!selection.ok) return { type: 'fail', errorKey: selection.code ?? 'log.action' }

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
    return { type: 'fail', errorKey: 'log.buildRoomFail' }
  }

  const payment = resolveRoomPaymentSelection(
    ctx.player,
    ctx.costs,
    rooms.length,
    paymentChoice,
  )
  if (payment.type !== 'selected') return { type: 'fail', errorKey: 'log.buildRoomFail' }

  const nextPlayer = JSON.parse(JSON.stringify(ctx.player)) as PlayerState
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
  ctx.eventSink?.emit<'farm.roomBuilt'>({
    type: 'farm.roomBuilt',
    rooms: rooms.map((room) => ({
      playerId: ctx.player.id,
      row: room.row,
      col: room.col,
      type: ctx.player.houseType,
    })),
  })
  const resourcesPaid = positiveResources(payment.solution.resourcesPaid)

  return {
    type: 'ok',
    resourcesPaid,
    extraData: { builtRooms: rooms },
    internalChildren: {
      beforeHostListeners: [
        buildInternalPayChild({
          cost: buildConstructPayCost(ctx.player, ctx.costs, rooms.length),
          costType: 'construct',
          optionPrefix: 'pay:room',
          paymentChoice,
          sourceCard: ctx.sourceCard,
          sourceActionId: ctx.space.id,
        }),
      ],
    },
  }
}

export const constructAction: ActionDefinition = {
  id: 'construct',
  nameKey: 'actions.construct.name',
  descriptionKey: 'actions.construct.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => getMaxBuildableRooms(player) > 0,
  costPreview: constructCostPreview,
  execute: ({ state, player, costs, actionContext }): ActionExecutionResult => {
    const idx = state.players.indexOf(player)
    const farm = playerBoard(state, idx).farmyard.selectableTiles('room', {
      costOverride: costs,
      actionContext,
    })
    return {
      type: 'request',
      request: {
        kind: 'farm-select',
        farm,
        options: [
          { value: 'confirm', labelKey: 'ui.interactionRoomConfirm' },
          { value: 'cancel', labelKey: 'ui.interactionRoomCancel' },
        ],
      },
      promptKey: 'ui.interactionRoomSelect',
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') return { type: 'ok' }

    // Second call: payment combo selected after multi-combo prompt.
    if (choice.startsWith('pay:room:')) {
      const farmPayload = ctx.actionContext?.farmPayload as
        | { rooms?: FarmTilePosition[] }
        | undefined
      const rooms = farmPayload?.rooms
      if (!Array.isArray(rooms) || rooms.length === 0) {
        return { type: 'fail', errorKey: 'log.buildRoomFail' }
      }
      return finalizeRoom(ctx, rooms, choice)
    }

    // First call: client submitted room geometry alongside `confirm`.
    if (payload && choice === 'confirm') {
      const rooms = (payload as { rooms?: FarmTilePosition[] }).rooms
      if (!Array.isArray(rooms) || rooms.length === 0) {
        return { type: 'fail', errorKey: 'NO_SELECTION' }
      }
      const lockedKeys = collectLockedFarmTileKeys(ctx.player)
      const idx = ctx.state.players.indexOf(ctx.player)
      const selection = playerBoard(ctx.state, idx).farmyard.canBuildRoom(rooms, lockedKeys)
      if (!selection.ok) {
        return { type: 'fail', errorKey: selection.code ?? 'log.buildRoomFail' }
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
        return { type: 'fail', errorKey: 'log.buildRoomFail' }
      }

      const payment = resolveRoomPaymentSelection(
        ctx.player,
        ctx.costs,
        rooms.length,
      )
      if (payment.type === 'request') {
        const options = payment.request.kind === 'choice' ? payment.request.options : []
        return {
          type: 'request',
          request: { kind: 'choice', options },
          promptKey: payment.promptKey,
          extraData: {
            actionContextWrite: { farmPayload: { rooms } },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.buildRoomFail' }
      }
      return finalizeRoom(ctx, rooms, undefined)
    }

    return { type: 'fail', errorKey: 'log.buildRoomFail' }
  },
}
