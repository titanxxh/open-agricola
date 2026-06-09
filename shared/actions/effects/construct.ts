import type {
  ActionAvailabilityContext,
  ActionCostPreview,
  ActionDefinition,
  ActionExecutionContext,
  ActionMutationContext,
  ActionExecutionResult,
  ComplexCost,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../contract/types'
// PaymentSolver namespace (S3 Task 7a): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// construct.ts only uses room-payment helpers (S4 domain aggregate scope),
// so no PaymentSolver call sites exist here yet.
import {
  buildConstructCost,
  type ConstructCostAdjustments,
  getBuildRoomCost,
  getMaxBuildableRooms,
  readConstructCostDelta,
  readExactCost,
  resolveRoomPaymentSelection,
} from '../payment/internal'
import { buildInternalPayChild } from '../helpers/pay-child'
import { playerBoard } from '../../domain'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import {
  addCardResourceGained,
  addCardResourcePaid,
  addCardResourceSaved,
} from '../../cards/helpers/card-state'
import { incRoomsBuilt } from '../../session/stats'

type ConstructAvailabilityContext = ActionAvailabilityContext & {
  actionContext?: Record<string, unknown>
}

const readConstructActionContext = (
  context: ActionAvailabilityContext,
): Record<string, unknown> | undefined => {
  const actionContext = (context as ConstructAvailabilityContext).actionContext
  if (actionContext) return actionContext
  const paramsActionContext = context.params?.actionContext
  if (!paramsActionContext || typeof paramsActionContext !== 'object') return undefined
  return paramsActionContext as Record<string, unknown>
}

const readConstructCostAdjustments = (
  context: unknown,
): ConstructCostAdjustments | undefined => {
  if (!context || typeof context !== 'object') return undefined
  const raw = context as {
    costTrades?: ActionExecutionContext['costTrades']
    costBonuses?: ActionExecutionContext['costBonuses']
  }
  const trades = raw.costTrades ?? []
  const bonuses = raw.costBonuses ?? []
  if (trades.length === 0 && bonuses.length === 0) return undefined
  return { trades, bonuses }
}

const constructCostPreview: ActionCostPreview = {
  getBaseCost: (context) => {
    const cost = buildConstructCost(
      context.player,
      undefined,
      1,
      readConstructActionContext(context),
    )
    return cost?.unitFee ?? getBuildRoomCost(context.player.houseType)
  },
  canExecute: (context, costs) =>
    canStartConstruct(
      context.state,
      context.player,
      costs,
      readConstructActionContext(context),
      readConstructCostAdjustments(context),
    ),
}

const boardForPlayer = (state: GameState, player: PlayerState) => {
  const idx = state.players.indexOf(player)
  if (idx >= 0) return playerBoard(state, idx)
  return playerBoard({ ...state, players: [player] }, 0)
}

const canStartConstruct = (
  state: GameState,
  player: PlayerState,
  costs: Partial<Resource> | undefined,
  actionContext: Record<string, unknown> | undefined,
  costAdjustments: ConstructCostAdjustments | undefined,
): boolean => {
  if (getMaxBuildableRooms(player, costs, actionContext, costAdjustments) <= 0) return false
  const costDelta = readConstructCostDelta(actionContext, costs)
  const farm = boardForPlayer(state, player).farmyard.selectableTiles('room', {
    costOverride: costDelta,
    exactCost: readExactCost(actionContext),
    actionContext,
  })
  if (farm.farmType !== 'room') return false
  return farm.selectableTiles.length > 0 && (farm.maxSelections ?? 0) > 0
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

const addResource = (
  target: Partial<Resource>,
  key: keyof Resource,
  amount: number,
) => {
  if (amount <= 0) return
  target[key] = (target[key] ?? 0) + amount
}

const totalComplexCostResources = (cost: ComplexCost): Partial<Resource> => {
  const total: Partial<Resource> = {}
  const add = (resources: Partial<Resource> | undefined, multiplier = 1) => {
    if (!resources) return
    Object.entries(resources).forEach(([key, value]) => {
      if (typeof value !== 'number' || value <= 0) return
      addResource(total, key as keyof Resource, value * multiplier)
    })
  }
  add(cost.fee)
  cost.fees?.forEach((fee) => add(fee))
  add(cost.unitFee, cost.nb ?? 1)
  return total
}

const recordConstructCostAttribution = (
  ctx: ActionMutationContext,
  baseCost: ComplexCost,
  finalCost: ComplexCost,
  rooms: number,
) => {
  if (!ctx.costAttribution?.length) return
  const base = totalComplexCostResources(baseCost)
  const final = totalComplexCostResources(finalCost)
  const remainingSaved: Partial<Resource> = {}
  const remainingPaid: Partial<Resource> = {}
  ctx.costAttribution.forEach((entry) => {
    Object.entries(entry.costs).forEach(([key, value]) => {
      if (typeof value !== 'number' || value === 0) return
      const resourceKey = key as keyof Resource
      if (value < 0 && remainingSaved[resourceKey] === undefined) {
        remainingSaved[resourceKey] = Math.max(0, (base[resourceKey] ?? 0) - (final[resourceKey] ?? 0))
      }
      if (value > 0 && remainingPaid[resourceKey] === undefined) {
        remainingPaid[resourceKey] = Math.max(0, (final[resourceKey] ?? 0) - (base[resourceKey] ?? 0))
      }
    })
  })
  ctx.costAttribution.forEach((entry) => {
    if (!entry.sourceCard) return
    const saved: Partial<Resource> = {}
    const paid: Partial<Resource> = {}
    Object.entries(entry.costs).forEach(([key, value]) => {
      if (typeof value !== 'number' || value === 0) return
      const resourceKey = key as keyof Resource
      const requested = Math.abs(value) * rooms
      if (value < 0) {
        const amount = Math.min(requested, remainingSaved[resourceKey] ?? 0)
        addResource(saved, resourceKey, amount)
        remainingSaved[resourceKey] = Math.max(0, (remainingSaved[resourceKey] ?? 0) - amount)
      } else {
        const amount = Math.min(requested, remainingPaid[resourceKey] ?? 0)
        addResource(paid, resourceKey, amount)
        remainingPaid[resourceKey] = Math.max(0, (remainingPaid[resourceKey] ?? 0) - amount)
      }
    })
    addCardResourceSaved(ctx.player, entry.sourceCard, saved)
    addCardResourcePaid(ctx.player, entry.sourceCard, paid)
  })
}

const buildConstructPayCost = (
  player: PlayerState,
  costs: Partial<Resource> | undefined,
  actionContext: Record<string, unknown> | undefined,
  rooms: number,
  costAdjustments: ConstructCostAdjustments | undefined,
): ComplexCost | null => buildConstructCost(player, costs, rooms, actionContext, costAdjustments)

const finalizeRoom = (
  ctx: ActionMutationContext,
  rooms: FarmTilePosition[],
  paymentChoice: string | undefined,
): ActionExecutionResult => {
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const idx = ctx.state.players.indexOf(ctx.player)
  const selection = playerBoard(ctx.state, idx).farmyard.canBuildRoom(rooms, lockedKeys)
  if (!selection.ok) return { type: 'fail', errorKey: selection.code ?? 'log.action' }

  const maxBuildableRooms = getMaxBuildableRooms(
    ctx.player,
    ctx.costs,
    ctx.actionContext,
    readConstructCostAdjustments(ctx),
  )
  if (rooms.length > maxBuildableRooms) {
    return { type: 'fail', errorKey: 'log.buildRoomFail' }
  }

  const payment = resolveRoomPaymentSelection(
    ctx.player,
    ctx.costs,
    rooms.length,
    paymentChoice,
    ctx.actionContext,
    readConstructCostAdjustments(ctx),
  )
  if (payment.type !== 'selected') return { type: 'fail', errorKey: 'log.buildRoomFail' }
  const payCost = buildConstructPayCost(
    ctx.player,
    ctx.costs,
    ctx.actionContext,
    rooms.length,
    readConstructCostAdjustments(ctx),
  )
  if (!payCost) return { type: 'fail', errorKey: 'log.buildRoomFail' }
  const baseCost = buildConstructPayCost(
    ctx.player,
    undefined,
    ctx.actionContext,
    rooms.length,
    undefined,
  )
  if (!baseCost) return { type: 'fail', errorKey: 'log.buildRoomFail' }

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
  recordConstructCostAttribution(ctx, baseCost, payCost, rooms.length)
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
          cost: payCost,
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
  canBeExecutedByPlayer: (_state, player, context) =>
    canStartConstruct(_state, player, undefined, context?.actionContext, undefined),
  costPreview: constructCostPreview,
  execute: (context): ActionExecutionResult => {
    const { state, player, costs, actionContext } = context
    const idx = state.players.indexOf(player)
    const costDelta = readConstructCostDelta(actionContext, costs)
    let farm = playerBoard(state, idx).farmyard.selectableTiles('room', {
      costOverride: costDelta,
      exactCost: readExactCost(actionContext),
      actionContext,
    })
    const roomFarm = farm.farmType === 'room' ? farm : undefined
    if (roomFarm) {
      const maxBuildableRooms = getMaxBuildableRooms(
        player,
        costs,
        actionContext,
        readConstructCostAdjustments(context),
      )
      let selectedRoomFarm = roomFarm
      if (maxBuildableRooms > roomFarm.maxSelections) {
        const fallbackFarm = playerBoard(state, idx).farmyard.selectableTiles('room', {
          exactCost: { max: maxBuildableRooms },
          actionContext,
        })
        if (fallbackFarm.farmType === 'room') selectedRoomFarm = fallbackFarm
      }
      selectedRoomFarm.maxSelections = Math.min(selectedRoomFarm.selectableTiles.length, maxBuildableRooms)
      farm = selectedRoomFarm
    }
    return {
      type: 'request',
      request: {
        kind: 'farm-select',
        farm,
        options: [
          { value: 'confirm', labelKey: 'ui.interactionRoomConfirm' },
        ],
      },
      promptKey: 'ui.interactionRoomSelect',
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') {
      return {
        type: 'fail',
        errorKey: 'log.buildRoomFail',
        recoverable: true,
      }
    }

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

      const maxBuildableRooms = getMaxBuildableRooms(
        ctx.player,
        ctx.costs,
        ctx.actionContext,
        readConstructCostAdjustments(ctx),
      )
      if (rooms.length > maxBuildableRooms) {
        return { type: 'fail', errorKey: 'log.buildRoomFail' }
      }

      const payment = resolveRoomPaymentSelection(
        ctx.player,
        ctx.costs,
        rooms.length,
        undefined,
        ctx.actionContext,
        readConstructCostAdjustments(ctx),
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
