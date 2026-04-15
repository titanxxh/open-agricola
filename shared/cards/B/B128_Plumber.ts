import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRenovation } from '../../actions/effects/renovation'

const CARD_ID = 'B128_Plumber'

// B128 Plumber: Each time after you use the Major Improvement action space, you can take a
// Renovation action, paying 2 clay or 2 stone less for the renovation.
// BGA: isListeningTo → PlaceFarmer on MajorImprovement action card type
//      onPlayerAfterPlaceFarmer → optional RENOVATION with actionCardId=B128_Plumber
//      onPlayerComputeCostsRenovation → if actionCardId matches, addBonusChoices -1 or -2
//      (player always benefits most from -2, so we apply -2 directly)

const triggerListener: CardListenerRegistration = {
  id: 'B128-plumber-after-place-farmer-major-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'major-improvement') return
    // Only offer if renovation is actually possible
    const renovation = getRenovation(context.player)
    if (!renovation) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'renovate-house',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

// Cost discount: -2 on the renovation material (clay or stone) when triggered by this card.
// BGA: addBonusChoices([{resource => -1}, {resource => -2}])
// We apply the maximum benefit (-2) since the player always prefers the larger discount.
const costListener: CardListenerRegistration = {
  id: 'B128-plumber-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    const renovation = getRenovation(context.player)
    if (!renovation) return
    if (renovation.nextType === 'clay') {
      return { costs: { clay: -2 } }
    }
    if (renovation.nextType === 'stone') {
      return { costs: { stone: -2 } }
    }
  },
}

registerCardListener(triggerListener)
registerCardListener(costListener)

export const B128_Plumber = new Occupation({
  id: CARD_ID,
  name: 'Plumber',
  deck: 'B',
  number: 128,
  category: 'FARM_PLANNER',
  desc: [
    'Each time after you use the __Major Improvement__ action space, you can take a __Renovation__ action, paying 2 <CLAY> or 2 <STONE> less for the renovation.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})
