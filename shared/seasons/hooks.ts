import { registerActionHook } from '../actions/hooks'
import { canStartFencing } from '../actions/effects/fencing'
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
}
