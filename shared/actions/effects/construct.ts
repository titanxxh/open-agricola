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
import { PaymentSolver, type ConstructCostAdjustments } from '../payment'
import { buildInternalPayChild } from '../helpers/pay-child'
import { playerBoard } from '../../domain'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import {
  addCardResourceGained,
  recordActionCostAttribution,
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
    paymentResourceProviders?: ActionExecutionContext['paymentResourceProviders']
  }
  const trades = raw.costTrades ?? []
  const bonuses = raw.costBonuses ?? []
  const paymentResourceProviders = raw.paymentResourceProviders ?? []
  if (trades.length === 0 && bonuses.length === 0 && paymentResourceProviders.length === 0) {
    return undefined
  }
  return { trades, bonuses, paymentResourceProviders }
}

const constructCostPreview: ActionCostPreview = {
  getBaseCost: (context) => {
    const cost = PaymentSolver.buildConstructCost(
      context.player,
      undefined,
      1,
      readConstructActionContext(context),
    )
    return cost?.unitFee ?? PaymentSolver.getBuildRoomCost(context.player.houseType)
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
  if (PaymentSolver.getMaxBuildableRooms(player, costs, actionContext, costAdjustments, state) <= 0) return false
  const costDelta = PaymentSolver.readConstructCostDelta(actionContext, costs)
  const farm = boardForPlayer(state, player).farmInteraction.selectableTiles('room', {
    costOverride: costDelta,
    exactCost: PaymentSolver.readExactCost(actionContext),
    actionContext,
    costAdjustments,
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
) =>
  recordActionCostAttribution(
    ctx.player,
    ctx.costAttribution,
    totalComplexCostResources(baseCost),
    totalComplexCostResources(finalCost),
    rooms,
  )

const buildConstructPayCost = (
  player: PlayerState,
  costs: Partial<Resource> | undefined,
  actionContext: Record<string, unknown> | undefined,
  rooms: number,
  costAdjustments: ConstructCostAdjustments | undefined,
): ComplexCost | null => PaymentSolver.buildConstructCost(player, costs, rooms, actionContext, costAdjustments)

const finalizeRoom = (
  ctx: ActionMutationContext,
  rooms: FarmTilePosition[],
  paymentChoice: string | undefined,
): ActionExecutionResult => {
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const idx = ctx.state.players.indexOf(ctx.player)
  const selection = playerBoard(ctx.state, idx).farmyard.canBuildRoom(rooms, lockedKeys)
  if (!selection.ok) return { type: 'fail', errorKey: selection.code ?? 'log.action' }

  const maxBuildableRooms = PaymentSolver.getMaxBuildableRooms(
    ctx.player,
    ctx.costs,
    ctx.actionContext,
    readConstructCostAdjustments(ctx),
    ctx.state,
  )
  if (rooms.length > maxBuildableRooms) {
    return { type: 'fail', errorKey: 'log.buildRoomFail' }
  }

  const payment = PaymentSolver.resolveRoomPaymentSelection(
    ctx.player,
    ctx.costs,
    rooms.length,
    paymentChoice,
    ctx.actionContext,
    readConstructCostAdjustments(ctx),
    ctx.state,
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
  const costAttributionSources = recordConstructCostAttribution(ctx, baseCost, payCost, rooms.length)
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
          actionContext: { issuedPaymentChoices: ctx.actionContext?.issuedPaymentChoices },
          candidateMetadataByFeeIndex: costAttributionSources.length > 0
            ? { 0: { originalFeeIndex: 0, sources: costAttributionSources } }
            : undefined,
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
    const costDelta = PaymentSolver.readConstructCostDelta(actionContext, costs)
    const farm = playerBoard(state, idx).farmInteraction.selectableTiles('room', {
      costOverride: costDelta,
      exactCost: PaymentSolver.readExactCost(actionContext),
      actionContext,
      costAdjustments: readConstructCostAdjustments(context),
    })
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
        return { type: 'fail', errorKey: 'NO_SELECTION', recoverable: true }
      }
      const lockedKeys = collectLockedFarmTileKeys(ctx.player)
      const idx = ctx.state.players.indexOf(ctx.player)
      const selection = playerBoard(ctx.state, idx).farmyard.canBuildRoom(rooms, lockedKeys)
      if (!selection.ok) {
        return { type: 'fail', errorKey: selection.code ?? 'log.buildRoomFail', recoverable: true }
      }

      const maxBuildableRooms = PaymentSolver.getMaxBuildableRooms(
        ctx.player,
        ctx.costs,
        ctx.actionContext,
        readConstructCostAdjustments(ctx),
        ctx.state,
      )
      if (rooms.length > maxBuildableRooms) {
        return { type: 'fail', errorKey: 'log.buildRoomFail', recoverable: true }
      }

      const payment = PaymentSolver.resolveRoomPaymentSelection(
        ctx.player,
        ctx.costs,
        rooms.length,
        undefined,
        ctx.actionContext,
        readConstructCostAdjustments(ctx),
        ctx.state,
      )
      if (payment.type === 'request') {
        const options = payment.request.kind === 'choice' ? payment.request.options : []
        return {
          type: 'request',
          request: { kind: 'choice', options },
          promptKey: payment.promptKey,
          extraData: {
            actionContextWrite: { ...(payment.extraData?.actionContextWrite as Record<string,unknown> | undefined), farmPayload: { rooms } },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.buildRoomFail', recoverable: true }
      }
      return finalizeRoom(ctx, rooms, undefined)
    }

    return { type: 'fail', errorKey: 'log.buildRoomFail', recoverable: true }
  },
}
