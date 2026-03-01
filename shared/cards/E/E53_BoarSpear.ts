import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const TRACKED_ACTIONS = ['collect', 'gain', 'receive'] as const

const boarSpearDuringListener: CardListenerRegistration = {
  id: 'E53-boar-spear-during',
  phases: ['during' as ActionHookPhase],
  actions: [...TRACKED_ACTIONS],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { actionId, player, result } = context
    
    if (!TRACKED_ACTIONS.includes(actionId as any)) return
    
    const obtainedBoar = result?.resourcesGained?.boar ?? 0
    if (obtainedBoar <= 0) return
    
    const cardState = player.cardStates?.['E53_BoarSpear'] ?? {}
    const convertedCount = cardState.counters?.['converted'] ?? 0
    
    const availableBoars = obtainedBoar - convertedCount
    if (availableBoars <= 0) return
    
    const options = []
    for (let i = 1; i <= availableBoars; i++) {
      options.push({
        value: String(i),
        labelKey: 'card.boarSpear.convert',
        labelParams: { boar: i, food: i * 4 },
      })
    }
    
    if (options.length === 0) return
    
    return {
      extraOptions: options,
    }
  },
}

const boarSpearAfterListener: CardListenerRegistration = {
  id: 'E53-boar-spear-after',
  phases: ['after' as ActionHookPhase],
  actions: [...TRACKED_ACTIONS],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { actionId, player, result, choice } = context
    
    if (!TRACKED_ACTIONS.includes(actionId as any)) return
    
    const obtainedBoar = result?.resourcesGained?.boar ?? 0
    if (obtainedBoar <= 0) return
    
    if (!choice) return
    
    const convertCount = parseInt(choice, 10)
    if (isNaN(convertCount) || convertCount <= 0) return
    
    const cardState = player.cardStates?.['E53_BoarSpear'] ?? {}
    const previousConverted = cardState.counters?.['converted'] ?? 0
    
    return {
      flow: {
        type: 'seq',
        children: [
          { 
            type: 'leaf', 
            actionId: 'exchange', 
            optional: false,
            promptKey: 'card.boarSpear.converting',
          },
        ],
      },
      extraData_IGNORED: { 
        convertBoar: convertCount,
        previousConverted,
      },
    }
  },
}

registerCardListener(boarSpearDuringListener)
registerCardListener(boarSpearAfterListener)

export const E53_BoarSpear = new MinorImprovement({
  id: "E53_BoarSpear",
  name: "Boar Spear",
  deck: "E",
  number: 53,
  category: "FOOD",
  desc: ["Each time you get at least 1 <PIG> outside of the breeding phase of a harvest, you can immediately turn them into 4 <FOOD> each."],
  cost: {"wood":1,"stone":1},
})
