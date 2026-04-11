import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C52_HuntsmansHat'

// BGA also modifies the AnimalMarket flow (sheep+food / boar+food / pay food→cattle).
// We don't have a separate AnimalMarket action space, so only PigMarket is handled here.

const huntsmansHatListener: CardListenerRegistration = {
  id: 'C52-huntsmans-hat-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, result } = context
    if (space.id !== 'pig-market') return
    const gained = (result as any)?.resourcesGained?.boar ?? 0
    if (gained <= 0) return
    return {
      flow: gainLeaf(CARD_ID, { food: gained }),
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
  vp: 1,
  cost: { reed: 1 },
  prerequisite: "Cooking Improvement",
  newSet: true,
})
