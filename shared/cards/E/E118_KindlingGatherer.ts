import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E118_KindlingGatherer'

// BGA: Each time you get food from an action space, you get 1 additional wood.
// Triggers on place-farmer for: Fishing, TravelingPlayers, ResourceMarket, ResourceMarketAdd,
//   ForestInn (B42), Archway (D51), StudioBoat (C39), MeetingPlace beginner variants
// Triggers on gain for: DayLaborer, AnimalMarketAdd, Collector (C104)

// Fishing is an accumulation space → triggers via collect.
// TravelingPlayers is an accumulation space → triggers via collect (food accumulation).
// ResourceMarket (4p) is a gain action → triggers via place-farmer.
// DayLaborer triggers via gain action.
const PLACE_FARMER_FOOD_SPACES = new Set([
  'resource-market-4',
])

const COLLECT_FOOD_SPACES = new Set([
  'fishing',
  'traveling-players',
])

const GAIN_FOOD_SPACES = new Set([
  'day-laborer',
])

const placeFarmerListener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (!PLACE_FARMER_FOOD_SPACES.has(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const collectListener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (!COLLECT_FOOD_SPACES.has(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const gainListener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-gain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (!GAIN_FOOD_SPACES.has(context.space.id)) return
    // Only trigger if food was actually gained
    const gained = context.result?.type === 'ok' ? context.result.resourcesGained : undefined
    if (gained && (gained.food ?? 0) > 0) {
      return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
    }
  },
}

registerCardListener(placeFarmerListener)
registerCardListener(collectListener)
registerCardListener(gainListener)

export const E118_KindlingGatherer = new Occupation({
  id: CARD_ID,
  name: 'Kindling Gatherer',
  deck: 'E',
  number: 118,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you get <FOOD> from an action space, you get 1 additional <WOOD>.'],
  cost: {},
  players: '1+',
})
