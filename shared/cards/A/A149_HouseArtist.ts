import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'A149_HouseArtist'

// A149 House Artist: Each time you use the Traveling Players accumulation space, you also
// get a Build Rooms action. Each room you build during the action costs you 1 reed less.
// BGA: onPlayerPlaceFarmer (on TravelingPlayers) → optional CONSTRUCT with actionCardId=A149
//      onPlayerComputeCostsConstruct: if actionCardId === this card, reduce reed by 1 per room trade

const triggerListener: CardListenerRegistration = {
  id: 'A149-house-artist-after-traveling-players',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'traveling-players') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'construct',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

// Discount: -1 reed per room when triggered by this card.
// BGA: iterates over trades with REED key and decrements by 1 per trade entry.
// In our system, the reed cost per room is a flat cost; -1 reed discount applies.
const costListener: CardListenerRegistration = {
  id: 'A149-house-artist-compute-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    return { costs: { reed: -1 } }
  },
}

registerCardListener(triggerListener)
registerCardListener(costListener)

export const A149_HouseArtist = new Occupation({
  id: CARD_ID,
  name: 'House Artist',
  deck: 'A',
  number: 149,
  category: 'FARM_PLANNER',
  desc: [
    'Each time you use the __Traveling Players__ accumulation space, you also get a __Build Rooms__ action. Each room you build during the action costs you 1 <REED> less.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
