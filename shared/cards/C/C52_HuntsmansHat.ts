import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C52_HuntsmansHat'

const huntsmansHatListener: CardListenerRegistration = {
  id: 'C52-huntsmans-hat-before',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space } = context
    if (space.id !== 'pig-market') return
    const obtainedBoar = space.resources.boar ?? 0
    if (obtainedBoar <= 0) return
    return {
      costs: { food: -obtainedBoar },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(huntsmansHatListener)

export const C52_HuntsmansHat = new MinorImprovement({
  id: CARD_ID,
  name: "Huntsman's Hat",
  deck: "C",
  number: 52,
  category: "FOOD_PROVIDER",
  desc: ["For each new <PIG> you get from the effect of an action space, you also get 1 <FOOD>."],
  cost: { reed: 1 },
  prerequisite: "Cooking Improvement",
  newSet: true,
})
