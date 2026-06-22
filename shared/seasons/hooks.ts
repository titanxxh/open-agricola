import { registerActionHook } from '../actions/hooks'
import { canStartFencing } from '../actions/effects/fencing'
import { gainResources } from '../actions/effects/gain'
import { stablesAction } from '../actions/effects/stables'
import { isThroughTheSeasonsSeason } from './rules'

export const registerThroughTheSeasonsHooks = (): void => {
  registerActionHook({
    id: 'through-the-seasons:winter-fishing-round-limit',
    actions: ['fishing'],
    phases: ['isDoable'],
    handler: (context) => {
      if (!isThroughTheSeasonsSeason(context.state, 'winter')) return
      if (context.state.round > 11) return
      return { doable: false }
    },
  })

  registerActionHook({
    id: 'through-the-seasons:winter-plow-food-cost',
    actions: ['plow'],
    phases: ['computeCosts'],
    handler: (context) => {
      if (!isThroughTheSeasonsSeason(context.state, 'winter')) return
      return { costs: { food: 1 } }
    },
  })

  registerActionHook({
    id: 'through-the-seasons:spring-fence-preview',
    actions: ['fence'],
    phases: ['isDoable'],
    handler: (context) => {
      if (!isThroughTheSeasonsSeason(context.state, 'spring')) return
      if (context.doable) return
      if (canStartFencing(context.state, context.player, { wood: -2 }, context.actionContext)) {
        return { doable: true }
      }
    },
  })

  registerActionHook({
    id: 'through-the-seasons:summer-day-laborer-grain',
    actions: ['gain'],
    phases: ['after'],
    handler: (context) => {
      if (!isThroughTheSeasonsSeason(context.state, 'summer')) return
      if (context.space.id !== 'day-laborer') return
      gainResources(context.player, { grain: 1 })
    },
  })

  registerActionHook({
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
        exactCost: { max: builtRooms.length },
        max: builtRooms.length,
        trueAction: false,
      }
      if (!stablesAction.canBeExecutedByPlayer(context.state, context.player, { actionContext })) return
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
