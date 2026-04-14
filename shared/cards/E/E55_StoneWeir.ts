import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E55_StoneWeir'

// Each time you use Fishing, if there are 0/1/2/3 food on the space,
// get an additional 4/3/2/1 food from the general supply.
const listener: CardListenerRegistration = {
  id: 'E55-stone-weir-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'fishing') return
    const fishingFood = context.space?.resources?.food ?? 0
    if (fishingFood >= 4) return
    const bonus = 4 - fishingFood
    return { flow: gainLeaf(CARD_ID, { food: bonus }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const E55_StoneWeir = new MinorImprovement({
  id: CARD_ID,
  name: 'Stone Weir',
  deck: 'E',
  number: 55,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Fishing__ accumulation space, if there are 0/1/2/3 <FOOD> on the space, you get an additional 4/3/2/1 <FOOD> from the general supply.'],
  cost: { stone: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
