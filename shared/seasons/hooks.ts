import type { ActionHookRegistry } from '../actions/hooks'
import { stablesAction } from '../actions/effects/stables'
import { PaymentSolver } from '../actions/payment'
import {
  readActionSnapshotExtraData,
  writeActionSnapshotExtraData,
} from '../cards/helpers/action-snapshot'
import { isThroughTheSeasonsSeason, winterPlowFoodCost } from './rules'
import { readTurnScopeToken } from '../cards/helpers/turn-token'

const SUMMER_DAY_LABORER_USED_KEY = 'throughTheSeasonsSummerDayLaborerUsed'

export const registerThroughTheSeasonsHooks = (actionHooks: ActionHookRegistry): void => {
  actionHooks.register({
    id: 'through-the-seasons:winter-fishing-round-limit',
    actions: ['fishing'],
    phases: ['isDoable'],
    handler: (context) => {
      if (!isThroughTheSeasonsSeason(context.state, 'winter')) return
      if (context.state.round > 11) return
      return { doable: false }
    },
  })

  actionHooks.register({
    id: 'through-the-seasons:winter-plow-food-cost',
    actions: ['plow'],
    phases: ['computeCosts'],
    handler: (context) => {
      const food = winterPlowFoodCost(context.state)
      if (food === 0) return
      return { costs: { food } }
    },
  })

  actionHooks.register({
    id: 'through-the-seasons:winter-farmland-food-gate',
    actions: ['farmland'],
    phases: ['isDoable'],
    handler: (context) => {
      if (!isThroughTheSeasonsSeason(context.state, 'winter')) return
      if (PaymentSolver.canAffordTypedFlatCost(context.player, { food: 1 }, 'plow', context.state)) return
      return { doable: false }
    },
  })

  actionHooks.register({
    id: 'through-the-seasons:summer-day-laborer-grain',
    actions: ['gain'],
    phases: ['after'],
    handler: (context) => {
      if (!isThroughTheSeasonsSeason(context.state, 'summer')) return
      if (context.space.id !== 'day-laborer') return
      const actionToken = readTurnScopeToken(context.player)
      if (actionToken !== undefined) {
        if (readActionSnapshotExtraData<boolean>(context.player, SUMMER_DAY_LABORER_USED_KEY)) return
        writeActionSnapshotExtraData(context.player, SUMMER_DAY_LABORER_USED_KEY, true)
      }
      return { flow: { type: 'leaf', actionId: 'bonus-grain', actionContext: { seasonalGrant: { season: 'summer' } } } }
    },
  })

  actionHooks.register({
    id: 'through-the-seasons:summer-room-stables',
    actions: ['construct'],
    phases: ['after'],
    handler: (context) => {
      if (!isThroughTheSeasonsSeason(context.state, 'summer')) return
      const extraData = context.result && 'extraData' in context.result
        ? context.result.extraData
        : undefined
      const builtRooms = extraData?.builtRooms
      if (!Array.isArray(builtRooms) || builtRooms.length === 0) return
      const actionContext = {
        seasonalGrant: { season: 'summer' },
        exactCost: { max: builtRooms.length },
        max: builtRooms.length,
        trueAction: false,
      }
      if (!stablesAction.canBeExecutedByPlayer(context.state, context.player, { actionHooks: context.actionHooks, actionContext })) return
      return {
        flow: {
          type: 'leaf',
          actionId: 'stables',
          optional: true,
          actionContext,
        },
      }
    },
  })
}
