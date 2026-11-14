import { commitRoomConstruction } from '../../domain/room-construction'
import type {
  ActionAvailabilityContext,
  ActionCostPreview,
  ActionDefinition,
  ActionExecutionContext,
  ActionMutationContext,
  ActionExecutionResult,
  ComplexCost,
  FarmTilePosition,
  Resource,
} from '../../contract/types'
import { PaymentSolver, describePaymentEffectPreview, type ConstructPaymentInput } from '../payment'
import { buildInternalPayChild } from '../helpers/pay-child'
import { resolveBuildPlayers } from '../helpers/build-players'
import { playerBoard } from '../../domain'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import {
  addCardResourceGained,
  recordActionCostAttribution,
} from '../../cards/helpers/card-state'
import { incRoomsBuilt } from '../../session/stats'
import { collectFarmChoiceCostAdjustments } from '../../cards/card-listeners'
import { requireActionHookRegistry } from '../hooks'

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

const constructPaymentInput = (
  context: ActionAvailabilityContext & Partial<ActionExecutionContext>,
): ConstructPaymentInput | undefined => {
  const actionContext = readConstructActionContext(context)
  const roles = resolveBuildPlayers({ ...context, actionContext })
  if (!roles) return undefined
  const adjustments = context.actionHooks ? collectFarmChoiceCostAdjustments(
    requireActionHookRegistry(context.actionHooks), context.state, roles.builder, 'construct',
    context.params ?? {}, context.space, { sourceCard: context.sourceCard, actionContext },
  ) : { costs: context.costs, trades: context.costTrades, bonuses: context.costBonuses, paymentResourceProviders: context.paymentResourceProviders }
  return {
    state: context.state, payer: roles.builder, farmOwner: roles.farmOwner,
    costs: adjustments.costs, actionContext, adjustments,
  }
}

export const constructFarmSelection = (context: ActionAvailabilityContext & Partial<ActionExecutionContext>) => {
  const input = constructPaymentInput(context)
  if (!input) return undefined
  return playerBoard(context.state, context.state.players.indexOf(input.farmOwner)).farmInteraction.selectableTiles('room', {
    max: PaymentSolver.getMaxBuildableRooms(input),
  })
}

const canStartConstruct = (context: ActionAvailabilityContext, costs?: Partial<Resource>) => {
  const farm = constructFarmSelection({ ...context, costs })
  return !!farm?.selectableTiles.length && (farm.maxSelections ?? 0) > 0
}

const constructCostPreview: ActionCostPreview = {
  dependsOnHouseType: true,
  unitCost: 'room',
  getBaseCost: context => {
    const input = constructPaymentInput(context)
    return input ? PaymentSolver.buildConstructCost({ ...input, costs: undefined, adjustments: undefined, roomCount: 1 })?.unitFee ?? {} : {}
  },
  canExecute: canStartConstruct,
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

const finalizeRoom = (
  ctx: ActionMutationContext,
  rooms: FarmTilePosition[],
  paymentChoice: string | undefined,
): ActionExecutionResult => {
  const roles = resolveBuildPlayers(ctx)
  if (!roles) return { type: 'fail', errorKey: 'log.buildRoomFail', recoverable: true }
  const { builder, farmOwner } = roles
  const lockedKeys = collectLockedFarmTileKeys(farmOwner)
  const idx = ctx.state.players.indexOf(farmOwner)
  const selection = playerBoard(ctx.state, idx).farmyard.canBuildRoom(rooms, lockedKeys)
  if (!selection.ok) return { type: 'fail', errorKey: selection.code ?? 'log.action' }

  const input = constructPaymentInput(ctx)
  if (!input || rooms.length > PaymentSolver.getMaxBuildableRooms(input)) return { type: 'fail', errorKey: 'log.buildRoomFail' }
  const payment = PaymentSolver.resolveRoomPaymentSelection({ ...input, roomCount: rooms.length, paymentChoice })
  if (payment.type !== 'selected') {
    return { type: 'fail', errorKey: 'log.buildRoomFail', recoverable: payment.type === 'fail' && payment.recoverable === true }
  }
  const payCost = PaymentSolver.buildConstructCost({ ...input, roomCount: rooms.length })
  const baseCost = PaymentSolver.buildConstructCost({ ...input, roomCount: rooms.length, costs: undefined, adjustments: undefined })
  if (!payCost || !baseCost) return { type: 'fail', errorKey: 'log.buildRoomFail' }

  const farmOperation = commitRoomConstruction(ctx.state, farmOwner, rooms, ctx.sourceCard, ctx.eventSink, builder)

  if (ctx.sourceCard && rooms.length > 0) {
    const houseType = farmOwner.houseType
    const roomKey =
      houseType === 'wood' ? 'roomWood'
      : houseType === 'clay' ? 'roomClay'
      : 'roomStone'
    addCardResourceGained(builder, ctx.sourceCard, { [roomKey]: rooms.length })
  }
  const costAttributionSources = recordConstructCostAttribution(ctx, baseCost, payCost, rooms.length)
  incRoomsBuilt(builder, rooms.length)
  ctx.eventSink?.emit<'farm.roomBuilt'>({
    type: 'farm.roomBuilt',
    actorPlayerId: builder.id,
    targetPlayerId: farmOwner.id,
    newlyUsedTiles: farmOperation.newlyUsedTiles,
    rooms: rooms.map((room) => ({
      playerId: farmOwner.id,
      row: room.row,
      col: room.col,
      type: farmOwner.houseType,
    })),
  })
  const resourcesPaid = positiveResources(payment.solution.resourcesPaid)

  return {
    type: 'ok',
    farmOperations: [farmOperation],
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
  farmBuild: { kinds: ['rooms'] },
  nameKey: 'actions.construct.name',
  descriptionKey: 'actions.construct.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) =>
    canStartConstruct({ ...context, state, player, actionHooks: context?.actionHooks }),
  costPreview: constructCostPreview,
  projectInteractionRequest: (state, player, request, actionContext, actionHooks, sourceCard, saved) => {
    const context = { state, player, actionContext, actionHooks, sourceCard, ...saved }
    const farm = constructFarmSelection(context)
    if (!farm) return { request }
    if (request.kind === 'farm-select') return { request: { ...request, farm } }
    const payload = actionContext?.farmPayload
    if (request.kind !== 'choice' || !payload || typeof payload !== 'object' || !('rooms' in payload) || !Array.isArray(payload.rooms)) return { request }
    const rooms = payload.rooms.filter((tile): tile is FarmTilePosition =>
      tile !== null && typeof tile === 'object' && typeof tile.row === 'number' && typeof tile.col === 'number')
    if (rooms.length !== payload.rooms.length) return { request }
    const input = constructPaymentInput(context)
    const cost = input && rooms.length > 0 && rooms.length <= (farm.maxSelections ?? 0)
      ? PaymentSolver.buildConstructCost({ ...input, roomCount: rooms.length }) : undefined
    const solutions = cost ? PaymentSolver.computeOptions(state, state.players.indexOf(player), cost, { actionId: 'construct', costType: 'construct' }) : []
    if (solutions.length > 0) {
      const payment = PaymentSolver.buildPaymentChoiceResult(solutions, 'pay:room')
      return { request: payment.type === 'request' ? payment.request : request }
    }
    const owner = resolveBuildPlayers(context)?.farmOwner
    return {
      request: { kind: 'farm-select', farm, ...(owner && owner.id !== player.id ? { farmOwnerPlayerId: owner.id } : {}), options: [{ value: 'confirm', labelKey: 'ui.interactionRoomConfirm' }] },
      promptKey: 'ui.interactionRoomSelect',
    }
  },
  previewEffect: context => {
    const input = constructPaymentInput(context)
    if (!input) return undefined
    if (context.previewMode === 'base') return { kind: 'unitCost', unit: 'room', resourcesPaid: constructCostPreview.getBaseCost(context), actionNameKey: 'actions.construct.name' }
    const selection = constructFarmSelection(context)
    if (!selection) return undefined
    return { kind: 'actionCosts', actionNameKey: 'actions.construct.name', options: Array.from({ length: selection.maxSelections ?? 0 }, (_, index) => {
      const cost = PaymentSolver.buildConstructCost({ ...input, roomCount: index + 1 })
      const solutions = cost ? PaymentSolver.computeOptions(context.state, context.state.players.indexOf(input.payer), cost, { actionId: 'construct', costType: 'construct' }) : []
      return { amount: index + 1, paymentOptions: solutions.map(solution => describePaymentEffectPreview(solution, false, { paymentResourceProviders: cost?.paymentResourceProviders })) }
    }) }
  },
  execute: (context): ActionExecutionResult => {
    const farm = constructFarmSelection(context)
    if (!farm || !farm.selectableTiles.length || !farm.maxSelections) return { type: 'fail', errorKey: 'log.buildRoomFail', recoverable: true }
    return {
      type: 'request',
      request: { kind: 'farm-select', farm, ...(resolveBuildPlayers(context)?.farmOwner.id !== context.player.id ? { farmOwnerPlayerId: resolveBuildPlayers(context)?.farmOwner.id } : {}), options: [{ value: 'confirm', labelKey: 'ui.interactionRoomConfirm' }] },
      promptKey: 'ui.interactionRoomSelect',
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    const roles = resolveBuildPlayers(ctx)
    if (!roles) return { type: 'fail', errorKey: 'log.buildRoomFail', recoverable: true }
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
      const lockedKeys = collectLockedFarmTileKeys(roles.farmOwner)
      const idx = ctx.state.players.indexOf(roles.farmOwner)
      const selection = playerBoard(ctx.state, idx).farmyard.canBuildRoom(rooms, lockedKeys)
      if (!selection.ok) {
        return { type: 'fail', errorKey: selection.code ?? 'log.buildRoomFail', recoverable: true }
      }

      const input = constructPaymentInput(ctx)
      if (!input || rooms.length > PaymentSolver.getMaxBuildableRooms(input)) return { type: 'fail', errorKey: 'log.buildRoomFail', recoverable: true }
      const payment = PaymentSolver.resolveRoomPaymentSelection({ ...input, roomCount: rooms.length })
      if (payment.type === 'request') {
        return {
          type: 'request',
          request: payment.request,
          promptKey: payment.promptKey,
          extraData: {
            actionContextWrite: { farmPayload: { rooms } },
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
